<script>
  import { onMount, onDestroy } from "svelte";
  import { api } from "../api.js";

  export let currentTrack = null;
  export let queue = [];
  export let onTrackEnd = () => {};

  let audio;
  let audioContext;
  export let analyser = null; // Export analyser for visualizer
  let isPlaying = false;
  export let currentTime = 0; // Export for lyrics sync
  let duration = 0;
  let volume = 1;
  let isLoading = false;
  let previousTrackId = null;

  /* Hover Time Logic */
  let isHovering = false;
  let hoverTime = 0;
  let hoverLeft = 0;

  function handleMouseMove(e) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.min(Math.max(x / width, 0), 1);

    hoverTime = percentage * duration;
    hoverLeft = x;
  }

  function handleMouseEnter() {
    isHovering = true;
  }

  function handleMouseLeave() {
    isHovering = false;
  }

  $: progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  $: formattedCurrent = formatTime(currentTime);
  $: formattedDuration = formatTime(duration);
  $: if (currentTrack && currentTrack.id !== previousTrackId) {
    loadTrack(currentTrack).then((success) => {
      if (success) play();
    });
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const mDisplay = h > 0 ? m.toString().padStart(2, "0") : m.toString();
    const sDisplay = s.toString().padStart(2, "0");

    return h > 0 ? `${h}:${mDisplay}:${sDisplay}` : `${mDisplay}:${sDisplay}`;
  }

  async function loadTrack(track) {
    if (!track) return false;

    const trackIdToLoad = track.id;

    // Prevent reloading the same track if it's already playing/loaded
    if (trackIdToLoad === previousTrackId && audio.src) {
      console.log("Track already loaded, skipping");
      return true;
    }

    previousTrackId = trackIdToLoad;
    isLoading = true;

    // Stop previous track immediately
    if (audio) {
      audio.pause();
      audio.src = ""; // Clear source
    }

    try {
      console.log("Loading track:", track.name);
      const result = await api.getStreamUrl(track.id, track);

      // RACE CONDITION FIX: Check if the track we just loaded is still the current one
      if (currentTrack.id !== trackIdToLoad) {
        console.log(
          "Track changed while loading, discarding result for:",
          track.name,
        );
        return false;
      }

      if (result.error) {
        console.error("Error loading track:", result.error);
        toast.error("Error loading: " + result.error);
        return false;
      }

      audio.src = result.streamUrl;
      audio.load();

      console.log(`Stream loaded (cached: ${result.cached})`);

      // Prefetch logic is now handled reactively by checkPrefetch()
      return true;
    } catch (error) {
      console.error("Load track error:", error);
      return false;
    } finally {
      // Only turn off loading if we finished loading the CURRENT track
      if (currentTrack.id === trackIdToLoad) {
        isLoading = false;
      }
    }
  }

  async function play() {
    if (!currentTrack) return;

    if (!audio.src) {
      const success = await loadTrack(currentTrack);
      if (!success) return;
    }

    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
    }

    try {
      if (audio.src) {
        await audio.play();
        isPlaying = true;
        console.log("[Player] Audio playing");
      } else {
        console.warn("[Player] Attempted to play with empty src");
      }
    } catch (error) {
      console.error("[Player] Play error:", error);
    }
  }

  function pause() {
    audio.pause();
    isPlaying = false;
  }

  function togglePlay() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * duration;
  }

  function setVolume(e) {
    volume = parseFloat(e.target.value);
    audio.volume = volume;
  }

  onMount(() => {
    audio = new Audio();
    audio.volume = volume;

    audio.addEventListener("loadedmetadata", () => {
      duration = audio.duration;
    });

    audio.addEventListener("timeupdate", () => {
      currentTime = audio.currentTime;
    });

    audio.addEventListener("ended", () => {
      // Prevent ended event if we are in the middle of loading a new track
      // or if duration is invalid (which happens when src is cleared)
      if (isLoading || isNaN(audio.duration) || audio.duration === 0) {
        return;
      }
      isPlaying = false;
      onTrackEnd();
    });

    audio.addEventListener("canplay", () => {
      if (isPlaying) {
        audio.play();
      }
    });
  });

  // Setup AudioContext only when needed (for visualizer)
  function setupAudioContext() {
    if (audioContext || !audio) return;

    try {
      console.log("[Player] Setting up AudioContext for visualizer...");
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      console.log("[Player] AudioContext setup complete");
      console.log("[Player] AudioContext state:", audioContext.state);
    } catch (err) {
      console.error("[Player] AudioContext setup failed:", err);
    }
  }

  // Export function to enable visualizer
  export function enableVisualizer() {
    setupAudioContext();
  }

  onDestroy(() => {
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (audioContext) {
      audioContext.close();
    }
  });

  // Reactive prefetch when queue or current track changes
  $: if (queue.length > 0 && currentTrack) {
    checkPrefetch();
  }

  async function checkPrefetch() {
    if (!currentTrack || queue.length === 0) return;

    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex !== -1 && currentIndex < queue.length - 1) {
      // Get next 3 tracks
      const nextTracks = queue.slice(currentIndex + 1, currentIndex + 4);

      // Filter out already cached or prefetching tracks (api.prefetchTracks handles internal caching checks too,
      // but we can avoid calling it if empty)
      if (nextTracks.length > 0) {
        console.log(
          `[Player] Queue update detected. Checking prefetch for ${nextTracks.length} tracks...`,
        );
        api.prefetchTracks(nextTracks).catch((err) => {
          console.error("Prefetch error:", err);
        });
      }
    }
  }

  $: if (currentTrack && audio && currentTrack.id !== previousTrackId) {
    loadTrack(currentTrack).then(() => play());
  } else if (!currentTrack && audio) {
    // Stop playing if track is cleared
    audio.pause();
    audio.src = "";
    previousTrackId = null;
    isPlaying = false;
  }

  export let onNext;
  export let onPrevious;
</script>

<div class="player">
  <div class="track-info">
    {#if currentTrack}
      <img
        src={currentTrack.albumArt}
        alt={currentTrack.name}
        class="album-art"
      />
      <div class="track-details">
        <h3>{currentTrack.name}</h3>
        <p>{currentTrack.artists}</p>
      </div>
    {:else}
      <div class="no-track">
        <div class="album-art-placeholder"></div>
        <div class="track-details">
          <p>No track playing</p>
        </div>
      </div>
    {/if}
  </div>

  <div class="controls">
    <button
      class="btn-icon small"
      onclick={onPrevious}
      aria-label="Previous Track"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
        ><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg
      >
    </button>
    <button
      class="btn-icon"
      onclick={togglePlay}
      disabled={!currentTrack || isLoading}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {#if isLoading}
        <div class="spinner"></div>
      {:else if isPlaying}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
          ><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg
        >
      {:else}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
          ><path d="M8 5v14l11-7z" /></svg
        >
      {/if}
    </button>
    <button class="btn-icon small" onclick={onNext} aria-label="Next Track">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
        ><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg
      >
    </button>
  </div>

  <div class="progress-container">
    <span class="time current">{formattedCurrent}</span>
    <div
      class="progress-bar-wrapper"
      onclick={seek}
      onmousemove={handleMouseMove}
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      role="slider"
      tabindex="0"
      aria-label="Seek Progress"
      aria-valuenow={progress}
      aria-valuemin="0"
      aria-valuemax="100"
      onkeydown={(e) => {
        if (e.key === "ArrowRight") {
          const newTime = Math.min(duration, currentTime + 5);
          audio.currentTime = newTime;
        }
        if (e.key === "ArrowLeft") {
          const newTime = Math.max(0, currentTime - 5);
          audio.currentTime = newTime;
        }
      }}
    >
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress}%"></div>
        {#if isHovering}
          <!-- Hover Point Indicator -->
          <div class="hover-point" style="left: {hoverLeft}px"></div>
          <!-- Time Tooltip -->
          <div class="time-tooltip" style="left: {hoverLeft}px">
            {formatTime(hoverTime)}
          </div>
        {/if}
      </div>
    </div>
    <span class="time duration">{formattedDuration}</span>
  </div>

  <div class="volume-control">
    <span class="volume-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
        />
      </svg>
    </span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      bind:value={volume}
      oninput={setVolume}
      class="volume-slider"
      style="background: linear-gradient(to right, var(--accent-primary) {volume *
        100}%, var(--bg-tertiary) {volume * 100}%);"
    />
  </div>
</div>

<style>
  .player {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .track-info {
    display: flex;
    gap: var(--spacing-md);
    align-items: center;
  }

  .album-art {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-md);
    object-fit: cover;
  }

  .album-art-placeholder {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.125rem;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .no-track {
    display: flex;
    gap: var(--spacing-md);
    align-items: center;
    opacity: 0.5;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
  }

  .btn-icon {
    width: 48px;
    height: 48px;
    font-size: 1.25rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    transform: scale(1.05);
    background: var(--accent-hover);
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-icon.small {
    width: 36px;
    height: 36px;
    font-size: 1rem;
    background: transparent;
    color: var(--text-secondary);
  }

  .btn-icon.small:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-container {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 10px;
    cursor: pointer;
    padding: 5px 0; /* Increase hit area */
  }

  .time {
    font-size: 0.75rem;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: center;
    pointer-events: none; /* Prevent time from interfering with hover */
  }

  .progress-bar-wrapper {
    flex: 1;
    position: relative;
    height: 6px;
    display: flex;
    align-items: center;
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: visible; /* Allow tooltip to show outside */
    transition: height 0.2s;
    position: relative;
  }

  .progress-container:hover .progress-bar {
    height: 6px;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    border-radius: 2px;
    position: relative;
  }

  .progress-fill::after {
    content: "";
    position: absolute;
    right: -4px;
    top: 50%;
    transform: translateY(-50%) scale(0);
    width: 10px;
    height: 10px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .progress-container:hover .progress-fill::after {
    transform: translateY(-50%) scale(1);
  }

  /* Hover Effects */
  .hover-point {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 50%;
    pointer-events: none;
    z-index: 5;
  }

  .time-tooltip {
    position: absolute;
    bottom: 15px; /* Position above bar */
    transform: translateX(-50%);
    background: #282828;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    z-index: 10;
    font-weight: 500;
  }

  .volume-control {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    justify-content: flex-start; /* Forced Left Alignment */
    width: auto; /* Allow it to be just as wide as needed */
    margin-top: var(--spacing-sm);
  }

  .volume-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    min-width: 20px; /* Prevent layout shift */
  }

  .volume-slider {
    width: 80px; /* Fixed small width, exactly like 'perfect' screenshot */
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--bg-tertiary); /* Grey background */
    border-radius: var(--radius-full);
    outline: none;
    cursor: pointer;
    margin: 0;
    padding: 0;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    margin-top: 0; /* Align center */
  }

  .volume-slider:active::-webkit-slider-thumb {
    transform: scale(1.1);
    background: var(--accent-primary);
  }
</style>
