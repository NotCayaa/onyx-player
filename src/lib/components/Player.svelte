<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-role-has-required-aria-props -->
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
    audio.crossOrigin = "anonymous"; // Enable CORS for AudioContext analysis
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
  <!-- Circular Visualizer + Album Art Section -->
  <div class="circular-section">
    <div class="circular-container">
      <!-- Visualizer akan ditaro disini nanti -->
      <div class="visualizer-wrapper">
        <!-- Import Visualizer component kalau udah siap -->
      </div>

      <!-- Album Art di tengah -->
      <div class="album-art-circle">
        {#if currentTrack?.albumArt}
          <img src={currentTrack.albumArt} alt={currentTrack.name} />
        {:else}
          <div class="album-art-placeholder-circle"></div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Track Info (dibawah circular) -->
  <div class="track-info-centered">
    {#if currentTrack}
      <h3>{currentTrack.name}</h3>
      <p>{currentTrack.artists}</p>
    {:else}
      <p class="no-track">No track playing</p>
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
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"
          ><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg
        >
      {:else}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"
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

  <div class="progress-container" onclick={seek} role="slider" tabindex="0">
    <span class="time current">{formattedCurrent}</span>
    <div
      class="progress-bar-wrapper"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      onmousemove={handleMouseMove}
      role="presentation"
    >
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress}%"></div>
        {#if isHovering}
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
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-start;
    max-height: 320px;
    flex-shrink: 0;
    overflow: hidden;
  }

  /* Line 418-422: Circular section tetep center */
  .circular-section {
    width: 100%;
    display: flex;
    justify-content: center;
    margin-bottom: 0.15rem;
    align-self: center; /* Tambah ini biar circular tetep center */
  }

  .circular-container {
    position: relative;
    width: 140px; /* Dikurangin dari 180px ke 140px */
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .visualizer-wrapper {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    z-index: 1;
  }

  .album-art-circle {
    position: relative;
    z-index: 10;
    width: 90px; /* Dikurangin dari 115px ke 90px */
    height: 90px;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 255, 255, 0.1);
  }

  .album-art-circle img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .album-art-placeholder-circle {
    width: 100%;
    height: 100%;
    background: var(--bg-tertiary);
  }

  .track-info-centered {
    text-align: center;
    max-width: 300px;
    margin-bottom: 0.15rem;
    align-self: center; /* Tambah ini */
  }

  .track-info-centered h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.9rem; /* Font dikurangin */
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-info-centered p {
    margin: 2px 0 0;
    color: var(--text-secondary);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-track {
    opacity: 0.5;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    width: 100%;
    align-self: center; /* Tambah ini */
  }

  .btn-icon {
    width: 44px;
    height: 44px;
    background: var(--accent-primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
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
    width: 32px;
    height: 32px;
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
    gap: 8px;
    cursor: pointer;
    align-self: center;
    margin-top: 0.5rem;
  }

  .time {
    font-size: 0.7rem;
    color: var(--text-secondary);
    min-width: 35px;
    text-align: center;
    pointer-events: none;
  }

  .progress-bar-wrapper {
    flex: 1;
    position: relative;
    height: 10px;
    display: flex;
    align-items: center;
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: visible;
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
    bottom: 12px;
    transform: translateX(-50%);
    background: #282828;
    color: #fff;
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
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
    justify-content: flex-start;
    width: auto;
    margin-top: 0.25rem; /* Margin dikurangin */
  }

  .volume-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    min-width: 20px;
  }

  .volume-slider {
    width: 80px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--bg-tertiary);
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
    margin-top: 0;
  }

  .volume-slider:active::-webkit-slider-thumb {
    transform: scale(1.1);
    background: var(--accent-primary);
  }
</style>
