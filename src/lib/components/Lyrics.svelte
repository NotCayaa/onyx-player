<script>
    import { onMount, createEventDispatcher } from "svelte";
    import Visualizer from "./Visualizer.svelte";
    import { fetchLyrics } from "../utils/lyrics.js";

    const dispatch = createEventDispatcher();

    export let currentTrack = null;
    export let currentTime = 0; // Audio playback time in seconds
    export let analyser = null; // AudioContext analyser for visualizer
    export let visualizerEnabled = false; // Toggle visualizer background

    let lyrics = "";
    let isLoading = false;
    let error = null;
    let syncedLyrics = []; // Array of {time: number, text: string}
    let activeLyricIndex = -1;
    let lyricsContainer;
    let lastFetchedTrackId = null; // Cache to prevent refetching on tab switch

    function openZenMode() {
        dispatch("openZenMode", { syncedLyrics, activeLyricIndex });
    }

    async function loadLyrics() {
        if (!currentTrack) {
            lyrics = "";
            syncedLyrics = [];
            lastFetchedTrackId = null;
            return;
        }

        // Skip if already fetched for this track (prevents refetch on tab switch)
        const trackId =
            currentTrack.id || currentTrack.videoId || currentTrack.name;
        if (trackId === lastFetchedTrackId) {
            return;
        }

        isLoading = true;
        error = null;
        lyrics = "";
        syncedLyrics = [];
        lastFetchedTrackId = trackId;

        try {
            const result = await fetchLyrics(currentTrack);
            lyrics = result.lyrics;
            syncedLyrics = result.syncedLyrics;
        } catch (err) {
            console.error("Lyrics error:", err);
            error = "Failed to load lyrics";
            lyrics = "";
            syncedLyrics = [];
        } finally {
            isLoading = false;
        }
    }

    // Update active lyric based on current time
    $: if (syncedLyrics.length > 0) {
        let newIndex = -1;
        for (let i = syncedLyrics.length - 1; i >= 0; i--) {
            if (currentTime >= syncedLyrics[i].time) {
                newIndex = i;
                break;
            }
        }

        if (newIndex !== activeLyricIndex) {
            activeLyricIndex = newIndex;
            scrollToActiveLyric();
        }
    }

    function scrollToActiveLyric() {
        if (lyricsContainer && activeLyricIndex >= 0) {
            const activeElement =
                lyricsContainer.querySelector(".lyric-line-active");
            if (activeElement) {
                // Use getBoundingClientRect for absolute visual position accuracy
                const containerRect = lyricsContainer.getBoundingClientRect();
                const elementRect = activeElement.getBoundingClientRect();

                // Calculate position of element relative to container's current view
                const relativeTop = elementRect.top - containerRect.top;

                // Current scroll position
                const currentScroll = lyricsContainer.scrollTop;

                // We want the element's center to be at the container's center
                const visualOffset = 50; // black magic
                const targetScrollTop =
                    currentScroll +
                    relativeTop -
                    containerRect.height / 2 +
                    elementRect.height / 2 +
                    visualOffset;

                lyricsContainer.scrollTo({
                    top: targetScrollTop,
                    behavior: "smooth",
                });
            }
        }
    }

    $: if (currentTrack) {
        loadLyrics();
    } else {
        // Clear lyrics if no track is playing
        lyrics = "";
        syncedLyrics = [];
        error = null;
    }
</script>

<div class="flex flex-col h-full overflow-hidden relative p-4">
    <!-- Visualizer Background Layer -->
    {#if visualizerEnabled && analyser}
        <div
            class="absolute inset-0 z-0 opacity-60 pointer-events-none blur-[0.5px]"
        >
            <Visualizer
                {analyser}
                enabled={true}
                albumArt={currentTrack?.albumArt}
            />
        </div>
    {/if}

    <!-- Zen Mode Toggle Button -->
    <button
        class="absolute top-2 right-2 z-20 p-2 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200"
        on:click={openZenMode}
        title="Enter Zen Mode"
    >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path
                d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
        </svg>
    </button>

    <!-- Lyrics Foreground Layer -->
    <div class="relative z-10 flex flex-col h-full overflow-hidden p-4">
        {#if isLoading}
            <div
                class="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-[var(--text-muted)]"
            >
                <div
                    class="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--text-primary)] rounded-full animate-spin"
                ></div>
                <p>Loading lyrics...</p>
            </div>
        {:else if error}
            <div
                class="flex-1 flex flex-col items-center justify-center text-center"
            >
                <p class="text-red-400 p-8">{error}</p>
            </div>
        {:else if syncedLyrics.length > 0}
            <div
                class="flex-1 overflow-y-auto flex flex-col items-center w-full scrollbar-hide text-center relative"
                bind:this={lyricsContainer}
            >
                <div class="flex flex-col gap-2 w-full pb-32 pt-16">
                    {#each syncedLyrics as line, index}
                        <div
                            class="py-2 px-2 rounded-lg transition-all duration-300 ease-out text-base leading-relaxed
                                   {index === activeLyricIndex
                                ? 'lyric-line-active opacity-100 text-xl font-bold text-[var(--text-primary)] scale-105'
                                : 'opacity-40 text-[var(--text-secondary)]'}
                                   {index === activeLyricIndex + 1
                                ? 'opacity-70'
                                : ''}"
                        >
                            {line.text || "♪"}
                        </div>
                    {/each}
                </div>
            </div>
        {:else if lyrics}
            <div
                class="flex-1 overflow-y-auto w-full scrollbar-hide text-center"
            >
                <pre
                    class="font-sans text-base leading-loose whitespace-pre-wrap text-[var(--text-primary)] p-4">{lyrics}</pre>
            </div>
        {:else if currentTrack}
            <div
                class="flex-1 flex flex-col items-center justify-center text-center"
            >
                <p
                    class="text-[var(--text-muted)] p-8 text-lg font-medium opacity-80"
                >
                    Lyrics not found for this track
                </p>
            </div>
        {:else}
            <div
                class="flex-1 flex flex-col items-center justify-center text-center"
            >
                <p class="text-[var(--text-muted)] p-8">
                    Play a track to see lyrics
                </p>
            </div>
        {/if}
    </div>
</div>
