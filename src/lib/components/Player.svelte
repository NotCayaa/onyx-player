<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-role-has-required-aria-props -->
<script>
  import { onMount, onDestroy } from "svelte";
  import { api } from "../api.js";
  import { toast } from "../stores/toast.js";

  export let currentTrack = null;
  export let queue = [];
  export let onTrackEnd = () => {};

  let audio;
  let audioContext;
  let gainNode = null; // GainNode for volume control through AudioContext
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

    // Setup AudioContext on first play for consistent audio routing
    setupAudioContext();

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
    // When AudioContext is active, use only GainNode for volume control
    // to avoid double volume (audio.volume * gainNode.gain)
    if (gainNode && audioContext) {
      audio.volume = 1; // Bypass audio.volume, let gainNode handle it
      // Use setValueAtTime for proper Web Audio API volume control
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      console.log("[Player] GainNode volume set to:", volume);
    } else {
      audio.volume = volume;
    }
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

      // Create GainNode for volume control
      gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

      const source = audioContext.createMediaElementSource(audio);
      // Route: source -> gainNode -> analyser -> destination
      // This way, the visualizer (analyser) receives volume-adjusted audio
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioContext.destination);

      console.log("[Player] AudioContext setup complete with GainNode");
      console.log("[Player] AudioContext state:", audioContext.state);

      // Bypass audio.volume since gainNode now handles volume
      audio.volume = 1;
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

<div class="w-full flex flex-col gap-1 items-center">
  <!-- Circular Visualizer + Album Art Section -->
  <div class="w-full flex justify-center py-2 relative">
    <div class="relative w-[140px] h-[140px] flex items-center justify-center">
      <!-- Visualizer Placeholder -->
      <div class="absolute inset-0 z-0">
        <!-- Visualizer component will go here -->
      </div>

      <!-- Album Art -->
      <div
        class="relative z-10 w-[100px] h-[100px] rounded-full overflow-hidden shadow-2xl border-[3px] border-neutral-800/50 ring-1 ring-white/10 group"
      >
        {#if currentTrack?.albumArt}
          <img
            src={currentTrack.albumArt}
            alt={currentTrack.name}
            class="w-full h-full object-cover animate-[spin_20s_linear_infinite]"
            style="animation-play-state: {isPlaying ? 'running' : 'paused'};"
          />
        {:else}
          <div
            class="w-full h-full bg-neutral-800 flex items-center justify-center"
          >
            <span class="text-xs text-neutral-600">No Art</span>
          </div>
        {/if}

        <!-- Center Hole (Vinyl Look) -->
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-900 rounded-full border border-neutral-700"
        ></div>
      </div>
    </div>
  </div>

  <!-- Track Info -->
  <div class="text-center max-w-[280px] mb-2 px-4">
    {#if currentTrack}
      <h3
        class="text-[var(--text-primary)] font-bold text-base truncate leading-tight mb-1"
        title={currentTrack.name}
      >
        {currentTrack.name}
      </h3>
      <p class="text-[var(--text-secondary)] text-xs truncate font-medium">
        {currentTrack.artists}
      </p>
    {:else}
      <p class="text-neutral-600 text-sm italic">Onyx Player</p>
    {/if}
  </div>

  <!-- Controls -->
  <div class="flex items-center justify-center gap-6 w-full mb-2">
    <!-- Prev -->
    <button
      class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-2 hover:bg-white/5 rounded-full"
      onclick={onPrevious}
      aria-label="Previous Track"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
        ><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg
      >
    </button>

    <!-- Play/Pause -->
    <button
      class="w-14 h-14 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={togglePlay}
      disabled={!currentTrack || isLoading}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {#if isLoading}
        <div
          class="w-6 h-6 border-2 border-black/30 border-t-black rounded-full animate-spin"
        ></div>
      {:else if isPlaying}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"
          ><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg
        >
      {:else}
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="currentColor"
          class=""><path d="M8 5v14l11-7z" /></svg
        >
      {/if}
    </button>

    <!-- Next -->
    <button
      class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-2 hover:bg-white/5 rounded-full"
      onclick={onNext}
      aria-label="Next Track"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"
        ><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg
      >
    </button>
  </div>

  <!-- Progress Bar -->
  <div
    class="w-full flex items-center gap-3 px-2 group cursor-pointer"
    onclick={seek}
    role="slider"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === "ArrowRight") seek({ detail: 5 }); // Implementation dependent
    }}
  >
    <span
      class="text-[10px] text-neutral-500 font-mono w-8 text-right tabular-nums"
      >{formattedCurrent}</span
    >

    <div
      class="flex-1 h-8 flex items-center relative"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      onmousemove={handleMouseMove}
      role="presentation"
    >
      <!-- Track Rail -->
      <div
        class="w-full h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden"
      >
        <!-- Fill -->
        <div
          class="h-full bg-[var(--text-primary)] rounded-full relative"
          style="width: {progress}%"
        ></div>
      </div>

      <!-- Hover Tooltip/Effects -->
      {#if isHovering}
        <!-- Hover Point Ghost -->
        <div
          class="absolute h-1 w-1 bg-white/50 rounded-full pointer-events-none"
          style="left: {hoverLeft}px; top: 50%; transform: translate(-50%, -50%);"
        ></div>

        <!-- Tooltip -->
        <div
          class="absolute bottom-6 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded shadow-xl border border-white/5 -translate-x-1/2 pointer-events-none font-mono z-20"
          style="left: {hoverLeft}px"
        >
          {formatTime(hoverTime)}
        </div>
      {/if}

      <!-- Thumb (Always visible loop/knob or just distinct end?) Minimalist: No knob, just fill. Or knob on hover? -->
      <div
        class="absolute w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style="left: {progress}%; transform: translateX(-50%);"
      ></div>
    </div>

    <span
      class="text-[10px] text-neutral-500 font-mono w-8 text-left tabular-nums"
      >{formattedDuration}</span
    >
  </div>

  <!-- Volume Control -->
  <div
    class="w-full flex items-center justify-start gap-3 -mt-1 h-6 group/vol px-2"
  >
    <!-- Icon Container (w-8) to align with Time (w-8) above -->
    <div class="w-8 flex justify-end flex-shrink-0">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="block text-neutral-500 group-hover/vol:text-[var(--text-primary)] transition-colors"
      >
        <path
          d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
        />
      </svg>
    </div>

    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      bind:value={volume}
      oninput={setVolume}
      class="volume-slider w-24 h-1 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--text-primary)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hidden group-hover/vol:[&::-webkit-slider-thumb]:block"
      style="background: linear-gradient(to right, var(--text-primary) {volume *
        100}%, var(--bg-tertiary) {volume * 100}%);"
    />
  </div>
</div>
