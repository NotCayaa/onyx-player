<script>
    import { onMount } from "svelte";
    import Visualizer from "./Visualizer.svelte";

    export let currentTrack = null;
    export let currentTime = 0; // Audio playback time in seconds
    export let analyser = null; // AudioContext analyser for visualizer
    export let visualizerEnabled = false; // Toggle visualizer background

    // Debug logging
    $: console.log("[Lyrics] analyser:", analyser);
    $: console.log("[Lyrics] visualizerEnabled:", visualizerEnabled);

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

        // If even the best match is > 5 seconds off, it might be wrong.
        // But for now, we'll be lenient given the "Not Available" issue.
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
            const query = `${cleanedTitle} ${currentTrack.artist}`;

            console.log(`[Lyrics] Searching for: "${query}"`);

            const res = await fetch(
                `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
            );
            const results = await res.json();

            // Use track duration for matching (Spotify usage relies on user's track metadata)
            // We assume currentTrack.duration is in seconds (it is usually from YouTube/Spotify)
            // If not available, we might skip duration check.
            // Note: currentTrack from App.svelte -> Player -> Lyrics usually has duration property (from api).
            // However, let's verify if currentTrack has duration.
            // If it doesn't, we can try to use the audio duration if loaded, but robust fallback is needed.
            // Let's assume passed track object has duration (usually from search/playlist).

            // Normalize duration to seconds
            // Some sources provide 'duration' in ms, others in s.
            // Spotify/Home usually provides 'duration' as ms.
            // lrclib uses seconds.
            let durationSec = 0;

            if (typeof currentTrack.duration === "number") {
                // If > 1000, assume ms
                if (currentTrack.duration > 1000) {
                    durationSec = currentTrack.duration / 1000;
                } else {
                    durationSec = currentTrack.duration;
                }
            } else if (typeof currentTrack.duration_ms === "number") {
                durationSec = currentTrack.duration_ms / 1000;
            }

            console.log(`[Lyrics] Target track duration: ${durationSec}s`);

            // Fallback for duration if missing or 0
            const trackForMatching = {
                artist: currentTrack.artists || currentTrack.artist || "",
                duration: durationSec || 0,
            };

            const bestMatch = findBestMatch(results, trackForMatching);

            if (bestMatch) {
                console.log(
                    `[Lyrics] Found matching lyrics: "${bestMatch.trackName}" (Length: ${bestMatch.duration}s)`,
                );
                // Get full lyrics if needed, but search result usually has them?
                // lrclib search results DO contain lyrics fields usually, but let's be safe.
                // If the fields are missing, fetch by ID.
                let data = bestMatch;
                if (!bestMatch.syncedLyrics && !bestMatch.plainLyrics) {
                    const lyricsRes = await fetch(
                        `https://lrclib.net/api/get/${bestMatch.id}`,
                    );
                    data = await lyricsRes.json();
                }

                if (data.syncedLyrics) {
                    syncedLyrics = parseSyncedLyrics(data.syncedLyrics);
                } else if (data.plainLyrics) {
                    lyrics = data.plainLyrics;
                } else {
                    lyrics = "Lyrics not available";
                }
            } else {
                console.log("[Lyrics] No suitable match found.");
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
                lyricsContainer.querySelector(".lyric-line.active");
            if (activeElement) {
                activeElement.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
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

<div class="lyrics">
    <!-- Visualizer Background Layer -->
    {#if visualizerEnabled && analyser}
        <div class="visualizer-background">
            <Visualizer {analyser} enabled={true} />
        </div>
    {/if}

    <!-- Lyrics Foreground Layer -->
    <div class="lyrics-foreground">
        <h3>Lyrics</h3>

        <div class="lyrics-content" bind:this={lyricsContainer}>
            {#if isLoading}
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading lyrics...</p>
                </div>
            {:else if error}
                <p class="error">{error}</p>
            {:else if syncedLyrics.length > 0}
                <div class="synced-lyrics">
                    {#each syncedLyrics as line, index}
                        <div
                            class="lyric-line"
                            class:active={index === activeLyricIndex}
                            class:upcoming={index === activeLyricIndex + 1}
                        >
                            {line.text || "♪"}
                        </div>
                    {/each}
                </div>
            {:else if lyrics}
                <pre class="lyrics-text">{lyrics}</pre>
            {:else if currentTrack}
                <p class="no-lyrics">No lyrics available</p>
            {:else}
                <p class="no-lyrics">Play a track to see lyrics</p>
            {/if}
        </div>
    </div>
</div>

<style>
    .lyrics {
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        padding: var(--spacing-lg);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        height: 100%;
        overflow: hidden;
        position: relative;
    }

    .visualizer-background {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        opacity: 0.4;
        pointer-events: none;
        z-index: 0;
        border-radius: var(--radius-lg);
        overflow: hidden;
    }

    .lyrics-foreground {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        height: 100%;
        overflow: hidden;
    }

    /* Hide scrollbar for Chrome, Safari and Opera */
    .lyrics-content::-webkit-scrollbar {
        display: none;
    }

    /* Hide scrollbar for IE, Edge and Firefox */
    .lyrics-content {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }

    h3 {
        margin: 0;
    }

    .lyrics-content {
        flex: 1;
        overflow-y: auto;
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-xl);
        gap: var(--spacing-md);
    }

    .lyrics-text {
        font-family: inherit;
        font-size: 1rem;
        line-height: 2;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: var(--text-primary);
        margin: 0;
    }

    .no-lyrics,
    .error {
        text-align: center;
        padding: var(--spacing-xl);
        color: var(--text-secondary);
    }

    .error {
        color: #ff6b6b;
    }

    .synced-lyrics {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
    }

    .lyric-line {
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        transition: all 0.3s ease;
        opacity: 0.4;
        font-size: 1rem;
        line-height: 1.6;
        text-align: center;
    }

    .lyric-line.active {
        opacity: 1;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--accent);
        transform: scale(1.05);
    }

    .lyric-line.upcoming {
        opacity: 0.7;
    }
</style>
