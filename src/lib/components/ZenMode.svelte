<script context="module">
    // Persist this across component mount/unmount to fix the animation bug
    let lastAnimatedTrackId = null;
</script>

<script>
    import { createEventDispatcher, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import CircularVisualizer from "./CircularVisualizer.svelte";
    import { fetchLyrics, prefetchLyrics } from "../utils/lyrics.js";

    export let currentTrack = null;
    export let analyser = null;
    export let isPlaying = false;
    export let currentTime = 0; // For reactive lyric sync
    export let volume = 1; // Volume control
    export let queue = []; // For prefetching

    const dispatch = createEventDispatcher();

    // Local lyrics state (independent from main Lyrics panel)
    let syncedLyrics = [];
    let lyrics = "";
    let isLoading = false;
    let lastFetchedTrackId = null;

    // Animation state
    let showTitleAnimation = false;
    let showLyrics = false;

    // Calculate active lyric index reactively based on currentTime
    let activeLyricIndex = -1;
    $: if (syncedLyrics.length > 0) {
        let newIndex = -1;
        for (let i = syncedLyrics.length - 1; i >= 0; i--) {
            if (currentTime >= syncedLyrics[i].time) {
                newIndex = i;
                break;
            }
        }
        activeLyricIndex = newIndex;
    }

    // Show 5 lines: 2 before, current, 2 after
    $: visibleLyrics = getVisibleLyrics(syncedLyrics, activeLyricIndex);

    function getVisibleLyrics(lyrics, activeIndex) {
        if (!lyrics || lyrics.length === 0) return [];

        const result = [];
        const start = Math.max(0, activeIndex - 2);
        const end = Math.min(lyrics.length - 1, activeIndex + 2);

        for (let i = start; i <= end; i++) {
            result.push({
                ...lyrics[i],
                index: i,
                isActive: i === activeIndex,
                isPrevious: i === activeIndex - 1,
                isNext: i === activeIndex + 1,
            });
        }
        return result;
    }

    function handleClose() {
        dispatch("close");
    }

    function handlePrevious() {
        dispatch("previous");
    }

    function handleNext() {
        dispatch("next");
    }

    function handleTogglePlay() {
        dispatch("togglePlay");
    }

    function handleVolumeChange(e) {
        dispatch("volumeChange", parseFloat(e.target.value));
    }

    function handleShuffle() {
        dispatch("shuffle");
    }

    function handleStop() {
        dispatch("stop");
    }

    function handleSeek(e) {
        if (!currentTrack) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.min(Math.max(x / width, 0), 1);

        // Use duration from currentTrack (API provides it)
        let duration = currentTrack.duration;
        // Normalize duration: API might return ms or seconds. usually ms from Spotify/YouTube logic seen elsewhere
        // But let's check: in Player.svelte it uses audio.duration (seconds).
        // currentTrack object usually has duration_ms or duration.
        // Let's normalize safely.
        if (duration > 10000) duration = duration / 1000; // heuristic: if > 10000 likely ms
        if (!duration && currentTrack.duration_ms)
            duration = currentTrack.duration_ms / 1000;

        if (duration) {
            const seekTime = percentage * duration;
            dispatch("seek", seekTime);
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const mDisplay = h > 0 ? m.toString().padStart(2, "0") : m.toString();
        const sDisplay = s.toString().padStart(2, "0");
        return h > 0
            ? `${h}:${mDisplay}:${sDisplay}`
            : `${mDisplay}:${sDisplay}`;
    }

    // Progress Bar State
    let isHoveringProgress = false;
    let hoverTime = 0;
    let hoverLeft = 0;

    function handleMouseMoveProgress(e) {
        if (!currentTrack) return;
        let duration = currentTrack.duration;
        if (duration > 10000) duration = duration / 1000;
        if (!duration && currentTrack.duration_ms)
            duration = currentTrack.duration_ms / 1000;

        if (!duration) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.min(Math.max(x / width, 0), 1);

        hoverTime = percentage * duration;
        hoverLeft = x;
    }

    $: durationSec = currentTrack
        ? currentTrack.duration > 10000
            ? currentTrack.duration / 1000
            : currentTrack.duration_ms
              ? currentTrack.duration_ms / 1000
              : currentTrack.duration
        : 0;

    $: progressPercent =
        durationSec > 0 ? (currentTime / durationSec) * 100 : 0;

    // Handle ESC key
    function handleKeydown(e) {
        if (e.key === "Escape") {
            handleClose();
        }
    }

    // Load lyrics independently
    async function loadLyrics() {
        if (!currentTrack) {
            lyrics = "";
            syncedLyrics = [];
            lastFetchedTrackId = null;
            return;
        }

        const trackId =
            currentTrack.id || currentTrack.videoId || currentTrack.name;

        // If same track, ensure we just show lyrics and skip animation logic
        if (trackId === lastFetchedTrackId) {
            return;
        }

        lastFetchedTrackId = trackId;

        // ANIMATION LOGIC: Check global state
        if (trackId === lastAnimatedTrackId) {
            // Already animated this track, skip animation
            showTitleAnimation = false;
            showLyrics = true;
        } else {
            // New track: Run animation
            lastAnimatedTrackId = trackId;
            showTitleAnimation = true;
            showLyrics = false;

            // Animation timing matches CSS transitions
            setTimeout(() => {
                // Only proceed if track hasn't changed during timeout
                if (lastFetchedTrackId === trackId) {
                    showTitleAnimation = false;
                    setTimeout(() => {
                        if (lastFetchedTrackId === trackId) {
                            showLyrics = true;
                        }
                    }, 300); // 0.3s fade out
                }
            }, 2000); // Reduced hold time slightly
        }

        // Fetch lyrics in background
        isLoading = true;
        try {
            const result = await fetchLyrics(currentTrack);
            if (lastFetchedTrackId === trackId) {
                lyrics = result.lyrics;
                syncedLyrics = result.syncedLyrics;
            }

            // Prefetch next 3 tracks
            if (queue.length > 0) {
                const currentIndex = queue.findIndex(
                    (t) =>
                        t.id === currentTrack.id ||
                        t.videoId === currentTrack.videoId,
                );
                if (currentIndex !== -1) {
                    const nextTracks = queue.slice(
                        currentIndex + 1,
                        currentIndex + 4,
                    );
                    prefetchLyrics(nextTracks);
                }
            }
        } catch (err) {
            console.error("ZenMode lyrics error:", err);
            if (lastFetchedTrackId === trackId) {
                lyrics = "";
                syncedLyrics = [];
            }
        } finally {
            if (lastFetchedTrackId === trackId) {
                isLoading = false;
            }
        }
    }

    $: if (currentTrack) {
        loadLyrics();
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="zen-overlay">
    <!-- Solid Background with blurred album art -->
    <div class="zen-background-solid"></div>
    {#if currentTrack?.albumArt}
        <div
            class="zen-background"
            style="background-image: url({currentTrack.albumArt})"
        ></div>
    {/if}
    <div class="zen-background-overlay"></div>

    <!-- Close Button - Top Right Corner -->
    <button
        class="zen-close-btn"
        on:click={handleClose}
        aria-label="Exit Zen Mode"
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
        </svg>
    </button>

    <!-- Main Content -->
    <div class="zen-content">
        <!-- Vinyl + Visualizer Container -->
        <div class="vinyl-visualizer-container">
            <!-- Circular Visualizer Ring -->
            {#if analyser}
                <CircularVisualizer
                    {analyser}
                    albumArt={currentTrack?.albumArt}
                    size={320}
                />
            {/if}

            <!-- Vinyl Album Art -->
            <div class="vinyl-container" class:spinning={isPlaying}>
                {#if currentTrack?.albumArt}
                    <img
                        src={currentTrack.albumArt}
                        alt={currentTrack.name}
                        class="vinyl-art"
                    />
                {:else}
                    <div class="vinyl-placeholder">
                        <span>♪</span>
                    </div>
                {/if}
                <!-- Vinyl Center Hole -->
                <div class="vinyl-hole"></div>
            </div>
        </div>

        <!-- Lyrics Area with Animations -->
        <div class="zen-lyrics-container">
            {#if showTitleAnimation}
                <div
                    class="zen-title-animation"
                    transition:fade={{ duration: 300 }}
                >
                    <h2 class="zen-title">{currentTrack?.name}</h2>
                    <p class="zen-artist">
                        {currentTrack?.artist || currentTrack?.artists}
                    </p>
                </div>
            {:else if showLyrics}
                <div
                    class="zen-lyrics"
                    style="animation: fadeIn 0.5s ease-out forwards;"
                >
                    {#if syncedLyrics.length > 0}
                        {#each visibleLyrics as line (line.index)}
                            <div
                                class="zen-lyric-line"
                                class:active={line.isActive}
                                class:adjacent={line.isPrevious || line.isNext}
                                class:far={!line.isActive &&
                                    !line.isPrevious &&
                                    !line.isNext}
                            >
                                {line.text || "♪"}
                            </div>
                        {/each}
                    {:else if lyrics}
                        <div class="zen-plain-lyrics">{lyrics}</div>
                    {:else if currentTrack}
                        <div class="zen-no-lyrics">No lyrics available</div>
                    {:else}
                        <div class="zen-no-lyrics">
                            Play a track to see lyrics
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    <!-- Footer Controls Bar -->
    <div class="zen-footer">
        <!-- Progress Bar (Top Row) -->
        <div class="zen-progress-section">
            <span class="zen-time text-right">{formatTime(currentTime)}</span>

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="zen-progress-bar-wrapper"
                on:click={handleSeek}
                on:mouseenter={() => (isHoveringProgress = true)}
                on:mouseleave={() => (isHoveringProgress = false)}
                on:mousemove={handleMouseMoveProgress}
            >
                <div class="zen-progress-track">
                    <div
                        class="zen-progress-fill"
                        style="width: {progressPercent}%"
                    ></div>
                </div>

                <!-- Hover Effects -->
                {#if isHoveringProgress}
                    <div
                        class="zen-hover-point"
                        style="left: {hoverLeft}px"
                    ></div>
                    <div class="zen-tooltip" style="left: {hoverLeft}px">
                        {formatTime(hoverTime)}
                    </div>
                {/if}
            </div>

            <span class="zen-time text-left">{formatTime(durationSec)}</span>
        </div>

        <!-- Controls (Bottom Row) -->
        <div class="zen-controls-row">
            <!-- Left spacer for balance -->
            <div class="zen-controls-left-spacer"></div>

            <!-- Center Controls -->
            <div class="zen-main-controls">
                <!-- Stop -->
                <button
                    class="zen-control-btn zen-stop-btn"
                    on:click={handleStop}
                    aria-label="Stop"
                    title="Stop"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                        />
                    </svg>
                </button>

                <!-- Previous -->
                <button
                    class="zen-control-btn"
                    on:click={handlePrevious}
                    aria-label="Previous Track"
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                </button>

                <!-- Play/Pause -->
                <button
                    class="zen-control-btn zen-play-btn"
                    on:click={handleTogglePlay}
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {#if isPlaying}
                        <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                        </svg>
                    {:else}
                        <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    {/if}
                </button>

                <!-- Next -->
                <button
                    class="zen-control-btn"
                    on:click={handleNext}
                    aria-label="Next Track"
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                </button>

                <!-- Shuffle -->
                <button
                    class="zen-control-btn"
                    on:click={handleShuffle}
                    aria-label="Shuffle Queue"
                    title="Shuffle"
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                        />
                    </svg>
                </button>
            </div>

            <!-- Right - Volume Control -->
            <div class="zen-volume-container">
                <div class="zen-volume">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        class="volume-icon"
                    >
                        <path
                            d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                        />
                    </svg>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        on:input={handleVolumeChange}
                        class="zen-volume-slider"
                        style="background: linear-gradient(to right, white {volume *
                            100}%, rgba(255,255,255,0.2) {volume * 100}%);"
                    />
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .zen-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    /* Solid black base background - no app visible behind */
    .zen-background-solid {
        position: absolute;
        inset: 0;
        background: #000;
        z-index: -3;
    }

    .zen-background {
        position: absolute;
        inset: -50px;
        background-size: cover;
        background-position: center;
        filter: blur(80px) saturate(1.5);
        transform: scale(1.2);
        opacity: 0.6;
        z-index: -2;
    }

    .zen-background-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: -1;
    }

    .zen-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2rem;
        width: 100%;
        max-width: 800px;
        padding: 2rem;
        flex: 1;
    }

    /* Close Button - Top Right */
    .zen-close-btn {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        z-index: 10;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 50%;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(10px);
    }

    .zen-close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: white;
    }

    /* Vinyl + Visualizer */
    .vinyl-visualizer-container {
        position: relative;
        width: 320px;
        height: 320px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .vinyl-container {
        position: relative;
        width: 200px;
        height: 200px;
        border-radius: 50%;
        overflow: hidden;
        box-shadow:
            0 0 0 4px rgba(255, 255, 255, 0.1),
            0 20px 60px rgba(0, 0, 0, 0.5),
            0 0 100px rgba(var(--dominant-rgb, 34, 197, 94), 0.3);
        z-index: 2;
    }

    .vinyl-container.spinning {
        animation: spin 20s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .vinyl-art {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .vinyl-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        color: #555;
    }

    .vinyl-hole {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 20px;
        height: 20px;
        background: rgba(0, 0, 0, 0.9);
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.1);
    }

    /* Lyrics */
    .zen-lyrics {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        text-align: center;
        min-height: 180px;
        justify-content: center;
        padding-bottom: 100px; /* Space for footer */
    }

    .zen-lyric-line {
        transition: all 0.3s ease-out;
        line-height: 1.4;
    }

    /* White highlight instead of green */
    .zen-lyric-line.active {
        font-size: 1.75rem;
        font-weight: 700;
        color: #ffffff;
        text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
        transform: scale(1.05);
    }

    .zen-lyric-line.adjacent {
        font-size: 1.1rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
    }

    .zen-lyric-line.far {
        font-size: 0.95rem;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.35);
    }

    .zen-no-lyrics {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.5);
        font-style: italic;
    }

    /* Footer Bar */
    .zen-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0 2rem 1.5rem 2rem;
        background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.6) 50%,
            transparent 100%
        );
        gap: 0.5rem;
    }

    .zen-progress-section {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 1rem;
        max-width: 800px;
    }

    .zen-time {
        font-family: monospace;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
        min-width: 3rem;
    }

    .zen-progress-bar-wrapper {
        flex: 1;
        height: 16px;
        display: flex;
        align-items: center;
        cursor: pointer;
        position: relative;
    }

    .zen-progress-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        overflow: hidden;
    }

    .zen-progress-fill {
        height: 100%;
        background: white;
        border-radius: 2px;
    }

    .zen-hover-point {
        position: absolute;
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        top: 50%;
        pointer-events: none;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    }

    .zen-tooltip {
        position: absolute;
        bottom: 25px;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        pointer-events: none;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Controls Row */
    .zen-controls-row {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .zen-controls-left-spacer {
        flex: 1;
    }

    /* Center Controls */
    .zen-main-controls {
        flex: 0 auto;
        display: flex;
        align-items: center;
        gap: 1.5rem;
    }

    /* Right Volume */
    .zen-volume-container {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        align-items: center;
    }

    .zen-control-btn {
        background: rgba(255, 255, 255, 0.05);
        border: none;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(5px);
    }

    .zen-control-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        transform: scale(1.1);
    }

    .zen-play-btn {
        width: 64px;
        height: 64px;
        background: rgba(255, 255, 255, 0.1);
    }

    .zen-stop-btn:hover {
        color: #f87171;
    }

    /* Volume Control */
    .zen-volume {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        max-width: 200px; /* Constrain hitbox */
    }

    .volume-icon {
        color: rgba(255, 255, 255, 0.7);
    }

    .zen-volume-slider {
        width: 100px;
        height: 4px;
        border-radius: 2px;
        appearance: none;
        cursor: pointer;
        -webkit-appearance: none;
    }

    .zen-volume-slider::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
    }

    .zen-volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
        margin-top: -4px;
        transition: transform 0.1s;
    }

    .zen-volume-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }

    .zen-volume-slider::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.2);
    }

    .zen-volume-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
        border: none;
        cursor: pointer;
    }
    /* Lyrics Container */
    .zen-lyrics-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 200px;
        position: relative;
    }

    /* Title Animation */
    .zen-title-animation {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        width: 100%;
    }

    .zen-title {
        font-size: 2.5rem;
        font-weight: 800;
        margin-bottom: 0.5rem;
        color: white;
        text-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .zen-artist {
        font-size: 1.5rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* Plain Lyrics */
    .zen-plain-lyrics {
        white-space: pre-wrap;
        font-size: 1.2rem;
        line-height: 1.8;
        color: rgba(255, 255, 255, 0.9);
        max-width: 600px;
        margin: 0 auto;
        padding-bottom: 100px;
    }
</style>
