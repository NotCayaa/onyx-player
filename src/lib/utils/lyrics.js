
// Cache for lyrics: key = trackId, value = { lyrics, syncedLyrics, timestamp }
const lyricsCache = new Map();

// Helper to clean title for better search results
function cleanTitle(title) {
    if (!title) return "";
    return title
        .replace(/\(Official Video\)/gi, "")
        .replace(/\(Official Music Video\)/gi, "")
        .replace(/\(Lyrics\)/gi, "")
        .replace(/\(Official Lyric Video\)/gi, "")
        .replace(/\(Feat\..*?\)/gi, "")
        .replace(/\(ft\..*?\)/gi, "")
        .replace(/\[.*?\]/g, "")
        .replace(/\s+-\s+.*$/, "")
        .trim();
}

// Helper to parse synced lyrics
function parseSyncedLyrics(syncedText) {
    const lines = syncedText.split("\n");
    const parsed = [];

    for (const line of lines) {
        // Match format [mm:ss.xx] or [mm:ss]
        const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2})\]\s*(.*)$/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const hundredths = parseInt(match[3]);
            const time = minutes * 60 + seconds + hundredths / 100;
            const text = match[4].trim();

            if (text) {
                parsed.push({ time, text });
            }
        }
    }
    return parsed;
}

// Heuristic to detect "messy" or bad lyrics
function isMessyLyrics(text) {
    if (!text) return true;

    // Too long usually means it includes credits, descriptions, etc. 
    // especially for unsynced lyrics. Synced lyrics are usually fine even if long.
    if (text.length > 5000) return true;

    // Check for excessive repetitive non-lyrical content or weird formatting
    // This is a simple heuristic
    const lines = text.split('\n');
    if (lines.length > 150) return true; // Too many lines for a typical song

    return false;
}

function findBestMatch(results, track) {
    if (!results || results.length === 0) return null;

    // Filter by artist first (loose match)
    const artistMatches = results.filter(
        (r) =>
            r.artistName.toLowerCase().includes(track.artist.toLowerCase()) ||
            track.artist.toLowerCase().includes(r.artistName.toLowerCase())
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

export async function fetchLyrics(track) {
    if (!track) return { lyrics: "", syncedLyrics: [] };

    const trackId = track.id || track.videoId || track.name;

    // Check cache first
    if (lyricsCache.has(trackId)) {
        return lyricsCache.get(trackId);
    }

    const cleanedTitle = cleanTitle(track.name);
    const artistName = track.artists || track.artist || "";
    const query = `${cleanedTitle} ${artistName}`;

    let lyrics = "";
    let syncedLyrics = [];
    let lrclibFailed = false;

    try {
        // Try lrclib.net first (supports synced lyrics)
        let results = [];
        try {
            const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
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
        if (typeof track.duration === "number") {
            durationSec = track.duration > 1000 ? track.duration / 1000 : track.duration;
        } else if (typeof track.duration_ms === "number") {
            durationSec = track.duration_ms / 1000;
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
                    const lyricsRes = await fetch(`https://lrclib.net/api/get/${bestMatch.id}`);
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
                const plain = data.plainLyrics;
                if (!isMessyLyrics(plain)) {
                    lyrics = plain;
                } else {
                    lyrics = "Lyrics not available (messy/unsynced)";
                }
            } else {
                lyrics = "Lyrics not available";
            }
        } else if (lrclibFailed || results.length === 0) {
            // Fallback: Try lyrics.ovh API (plain lyrics only)
            try {
                const ovhRes = await fetch(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(cleanedTitle)}`
                );

                if (ovhRes.ok) {
                    const ovhData = await ovhRes.json();
                    if (ovhData.lyrics && !isMessyLyrics(ovhData.lyrics)) {
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
        console.error("Lyrics fetching error:", err);
        lyrics = "Failed to load lyrics";
    }

    const result = { lyrics, syncedLyrics };
    lyricsCache.set(trackId, result);
    return result;
}

export async function prefetchLyrics(tracks) {
    if (!tracks || !Array.isArray(tracks)) return;

    // Limit concurrency to avoid rate limits
    // Fetch one by one is safer for simple implementation
    for (const track of tracks) {
        const trackId = track.id || track.videoId || track.name;
        if (!lyricsCache.has(trackId)) {
            // Fire and forget, but await briefly to space requests if needed
            fetchLyrics(track).catch(err => console.warn("Prefetch failed for", track.name, err));
            // Small delay to be nice to API
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
