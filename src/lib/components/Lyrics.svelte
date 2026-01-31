<script>
    import { onMount } from "svelte";
    import Visualizer from "./Visualizer.svelte";

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

    function cleanTitle(title) {
        return title
            .replace(/\(Official Video\)/gi, "")
            .replace(/\(Official Music Video\)/gi, "")
            .replace(/\(Lyrics\)/gi, "")
            .replace(/\(Official Lyric Video\)/gi, "")
            .replace(/\(Feat\..*?\)/gi, "")
            .replace(/\(ft\..*?\)/gi, "")
            .replace(/\[.*?\]/g, "") // Remove brackets like [Official Video]
            .replace(/\s+-\s+.*$/, "") // Remove " - Artist" suffix if present in title
            .trim();
    }

    function findBestMatch(results, track) {
        if (!results || results.length === 0) return null;

        // Filter by artist first (loose match)
        const artistMatches = results.filter(
            (r) =>
                r.artistName
                    .toLowerCase()
                    .includes(track.artist.toLowerCase()) ||
                track.artist.toLowerCase().includes(r.artistName.toLowerCase()),
        );

        const candidates = artistMatches.length > 0 ? artistMatches : results;

        // Find closest duration match
        let bestMatch = null;
        let minDiff = Infinity;

        for (const candidate of candidates) {
            // lrclib returns duration in seconds
            const diff = Math.abs(candidate.duration - track.duration);

            // Bonus points for synced lyrics
            const score = diff - (candidate.syncedLyrics ? 1 : 0);

            if (score < minDiff) {
                minDiff = score;
                bestMatch = candidate;
            }
        }
        return bestMatch;
    }

    async function loadLyrics() {
        if (!currentTrack) {
            lyrics = "";
            syncedLyrics = [];
            return;
        }

        isLoading = true;
        error = null;
        lyrics = "";
        syncedLyrics = [];

        try {
            const cleanedTitle = cleanTitle(currentTrack.name);
            const artistName =
                currentTrack.artists || currentTrack.artist || "";
            const query = `${cleanedTitle} ${artistName}`;

            // Try lrclib.net first (supports synced lyrics)
            let results = [];
            let lrclibFailed = false;

            try {
                const res = await fetch(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
                );

                if (res.ok) {
                    results = await res.json();
                    if (!Array.isArray(results)) results = [];
                } else {
                    lrclibFailed = true;
                }
            } catch (fetchErr) {
                lrclibFailed = true;
            }

            // Normalize duration
            let durationSec = 0;
            if (typeof currentTrack.duration === "number") {
                durationSec =
                    currentTrack.duration > 1000
                        ? currentTrack.duration / 1000
                        : currentTrack.duration;
            } else if (typeof currentTrack.duration_ms === "number") {
                durationSec = currentTrack.duration_ms / 1000;
            }

            const trackForMatching = {
                artist: artistName,
                duration: durationSec || 0,
            };

            const bestMatch = findBestMatch(results, trackForMatching);

            if (bestMatch) {
                let data = bestMatch;

                // If search result doesn't have lyrics, try fetching by ID
                if (!bestMatch.syncedLyrics && !bestMatch.plainLyrics) {
                    try {
                        const lyricsRes = await fetch(
                            `https://lrclib.net/api/get/${bestMatch.id}`,
                        );
                        if (lyricsRes.ok) {
                            data = await lyricsRes.json();
                        }
                    } catch (fetchErr) {
                        // ignore
                    }
                }

                if (data.syncedLyrics) {
                    syncedLyrics = parseSyncedLyrics(data.syncedLyrics);
                } else if (data.plainLyrics) {
                    lyrics = data.plainLyrics;
                } else {
                    lyrics = "Lyrics not available";
                }
            } else if (lrclibFailed || results.length === 0) {
                // Fallback: Try lyrics.ovh API (plain lyrics only)
                try {
                    const ovhRes = await fetch(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(cleanedTitle)}`,
                    );

                    if (ovhRes.ok) {
                        const ovhData = await ovhRes.json();
                        if (ovhData.lyrics) {
                            lyrics = ovhData.lyrics;
                        } else {
                            lyrics = "Lyrics not found for this track";
                        }
                    } else {
                        lyrics = "Lyrics not found for this track";
                    }
                } catch (ovhErr) {
                    lyrics = "Lyrics not found for this track";
                }
            } else {
                lyrics = "Lyrics not found for this track";
            }
        } catch (err) {
            console.error("Lyrics error:", err);
            error = "Failed to load lyrics";
            lyrics = "";
            syncedLyrics = [];
        } finally {
            isLoading = false;
        }
    }

    function parseSyncedLyrics(syncedText) {
        const lines = syncedText.split("\n");
        const parsed = [];

        for (const line of lines) {
            // Match format [mm:ss.xx] or [mm:ss]
            const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)$/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const centiseconds = parseInt(match[3]);
                const text = match[4];

                const timeInSeconds =
                    minutes * 60 + seconds + centiseconds / 100;
                parsed.push({ time: timeInSeconds, text });
            }
        }

        return parsed;
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

    <!-- Lyrics Foreground Layer -->
    <div class="relative z-10 flex flex-col h-full overflow-hidden p-4">
        <div
            class="flex-1 overflow-y-auto flex flex-col items-center w-full scrollbar-hide text-center"
            bind:this={lyricsContainer}
        >
            {#if isLoading}
                <div
                    class="flex flex-col items-center justify-center p-8 gap-4 text-[var(--text-muted)]"
                >
                    <div
                        class="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--text-primary)] rounded-full animate-spin"
                    ></div>
                    <p>Loading lyrics...</p>
                </div>
            {:else if error}
                <p class="text-red-400 p-8">{error}</p>
            {:else if syncedLyrics.length > 0}
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
            {:else if lyrics}
                <pre
                    class="font-sans text-base leading-loose whitespace-pre-wrap text-[var(--text-primary)] p-4">{lyrics}</pre>
            {:else if currentTrack}
                <p class="text-[var(--text-muted)] p-8">No lyrics available</p>
            {:else}
                <p class="text-[var(--text-muted)] p-8">
                    Play a track to see lyrics
                </p>
            {/if}
        </div>
    </div>
</div>
