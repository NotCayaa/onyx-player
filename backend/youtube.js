import youtubedl from 'youtube-dl-exec';
import { YouTube } from 'youtube-sr';
import cache from './cache.js';

class YouTubeService {
    async searchTrack(trackName, artistName) {
        const startTime = Date.now();
        // Helper to clean strings for comparison AND query
        const clean = (str) => str
            .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep Letters, Numbers, Space (Unicode aware)
            .replace(/\s+/g, ' ')
            .trim();

        // Query 1: Full Sanitized Name (e.g. "TAKO TAKOVER Ninomae Inanis")
        let query = `${clean(trackName)} ${clean(artistName)}`;

        console.log(`[YouTube] Trying query: "${query}"`);

        let results = [];
        try {
            results = await YouTube.search(query, { limit: 15, type: 'video' });
        } catch (err) {
            console.warn(`[YouTube] Primary search failed for "${query}":`, err.message);

            // Fallback 1: Try adding "official" to force music layout (helps with parser)
            const officialQuery = `${query} official`;
            try {
                console.log(`[YouTube] Trying Official fallback: "${officialQuery}"`);
                results = await YouTube.search(officialQuery, { limit: 15, type: 'video' });
            } catch (err1) {
                console.warn(`[YouTube] Official fallback failed:`, err1.message);

                // Fallback 2: ASCII only
                const asciiQuery = query.replace(/[^\x00-\x7F]/g, '');
                console.log(`[YouTube] Trying ASCII fallback: "${asciiQuery}"`);

                try {
                    if (asciiQuery.trim().length > 2) {
                        results = await YouTube.search(asciiQuery, { limit: 15, type: 'video' });
                    } else {
                        throw new Error('ASCII query too short');
                    }
                } catch (err2) {
                    console.error(`[YouTube] ASCII fallback failed:`, err2.message);

                    // Fallback 3: Simple Track Name + "song" (to avoid ambiguous short terms like "I I I")
                    const simpleQuery = `${clean(trackName)} song`;
                    try {
                        console.log(`[YouTube] Trying simple+song fallback: "${simpleQuery}"`);
                        results = await YouTube.search(simpleQuery, { limit: 10, type: 'video' });
                    } catch (err3) {
                        // Last resort: Just the track name plain
                        const plainQuery = clean(trackName);
                        try {
                            console.log(`[YouTube] Trying plain fallback: "${plainQuery}"`);
                            results = await YouTube.search(plainQuery, { limit: 10, type: 'video' });
                        } catch (err4) {
                            console.warn('[YouTube] All library searches failed. Trying yt-dlp fallback...');
                            // Ultimate Fallback: yt-dlp search
                            try {
                                const ytdlpStart = Date.now();
                                const ytdlpQuery = `ytsearch1:${clean(trackName)} ${clean(artistName)}`;
                                const output = await youtubedl(ytdlpQuery, {
                                    dumpSingleJson: true,
                                    noWarnings: true,
                                    preferFreeFormats: true,
                                    flatPlaylist: true // Faster
                                });
                                console.log(`[YouTube] yt-dlp search took ${Date.now() - ytdlpStart}ms`);

                                if (output && output.entries && output.entries.length > 0) {
                                    // yt-dlp search result
                                    const video = output.entries[0];
                                    console.log(`[YouTube-DLP] Found: "${video.title}" (${video.id})`);

                                    // Return immediately, bypassing scoring (yt-dlp ranking is usually decent)
                                    return {
                                        videoId: video.id,
                                        title: video.title,
                                        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
                                        duration: video.duration * 1000, // yt-dlp returns seconds
                                        url: video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`
                                    };
                                } else if (output && output.id) {
                                    // Single video result (rare for search but possible)
                                    console.log(`[YouTube-DLP] Found: "${output.title}"`);
                                    return {
                                        videoId: output.id,
                                        title: output.title,
                                        thumbnail: output.thumbnail,
                                        duration: output.duration * 1000,
                                        url: output.webpage_url
                                    };
                                }
                                throw new Error('yt-dlp returned no results');
                            } catch (err5) {
                                console.error('[YouTube] yt-dlp fallback failed:', err5.message);
                                throw new Error('All search attempts failed including yt-dlp');
                            }
                        }
                    }
                }
            }
        }

        if (!results || results.length === 0) {
            throw new Error('No YouTube results found');
        }

        const targetTitle = clean(trackName).toLowerCase();
        // Remove spaces for strict comparison (handles "I I I" vs "III")
        const targetTitleNoSpace = targetTitle.replace(/\s/g, '');
        const targetArtist = clean(artistName).toLowerCase();

        // Filter out unwanted content
        const filtered = results.filter(video => {
            const title = video.title.toLowerCase();
            const channel = video.channel?.name?.toLowerCase() || '';

            // Exclude obvious non-music content
            const unwantedKeywords = [
                'reaction', 'reacts', 'reacting',
                'review', 'reviews', 'reviewing',
                'tutorial', 'lesson', 'how to',
                'cover', 'covered',
                'piano version', 'guitar version',
                'nightcore', 'slowed', 'reverb',
                'compilation', 'playlist',
                'mix', 'full album'
            ];

            if (unwantedKeywords.some(keyword => title.includes(keyword) || channel.includes(keyword))) {
                return false;
            }

            return true;
        });

        // If all results were filtered out, use original results but penalize heavily
        const candidates = filtered.length > 0 ? filtered : results;

        // Score and prioritize results
        const scored = candidates.map(video => {
            const title = clean(video.title).toLowerCase();
            const titleNoSpace = title.replace(/\s/g, ''); // For "III" match

            const rawTitle = video.title.toLowerCase();
            const channel = clean(video.channel?.name || '').toLowerCase();
            let score = 0;

            // CRITICAL: Title Relevance (Loose match allows "III" == "I I I")
            if (title.includes(targetTitle) || titleNoSpace.includes(targetTitleNoSpace)) {
                score += 100; // Base score
            } else {
                score -= 500;
            }

            // Boost official content
            if (rawTitle.includes('official')) score += 50;
            if (rawTitle.includes('official audio')) score += 50;
            if (rawTitle.includes('official music video')) score += 50;
            if (rawTitle.includes('details')) score -= 10;

            // Boost verified/known channels
            if (channel.includes('vevo')) score += 50;
            if (video.channel?.name?.includes(' - Topic')) score += 80;

            // Artist match (Strong boost)
            if (channel.includes(targetArtist)) score += 100;

            // View Count Boost (Popularity filter)
            // video.views is usually a number in youtube-sr
            if (video.views > 1000000) score += 50; // > 1M views
            if (video.views > 10000000) score += 30; // > 10M views

            // HEAVY PENALTIES for unwanted stuff (failsafe if passed filter)
            if (rawTitle.includes('reaction') || rawTitle.includes('reacts')) score -= 1000;
            if (rawTitle.includes('review')) score -= 1000;
            if (rawTitle.includes('cover')) score -= 500;
            if (rawTitle.includes('live')) score -= 50;
            if (rawTitle.includes('remix')) score -= 50;

            // Spam penalty
            if (video.title.includes('〰') || video.title.includes('😵')) score -= 200;

            return { video, score };
        });

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        const best = scored[0];
        const duration = Date.now() - startTime;
        console.log(`[YouTube] Search completed in ${duration}ms: "${trackName}" by "${artistName}"`);
        console.log(`[YouTube] Selected: "${best.video.title}" (Score: ${best.score})`);

        return {
            videoId: best.video.id,
            title: best.video.title,
            thumbnail: best.video.thumbnail?.url,
            duration: best.video.duration,
            url: best.video.url
        };
    }

    async getStreamUrl(videoId) {
        const startTime = Date.now();
        // Check in-memory cache first
        const cachedUrl = cache.getStreamCache(videoId);
        if (cachedUrl) {
            // console.log(`[YouTube] Stream cache hit for ${videoId}`);
            return cachedUrl;
        }

        try {
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            // Use yt-dlp to get best audio format URL
            console.log(`[YouTube] Fetching stream URL for ${videoId}...`);
            const info = await youtubedl(videoUrl, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                noPlaylist: true, // Don't scan entire playlist if URL has &list
                forceIpv4: true, // Force IPv4 to avoid IPv6 timeouts
                addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'],
            });

            const duration = Date.now() - startTime;
            console.log(`[YouTube] Stream URL fetched in ${duration}ms for ${videoId}`);

            // Get audio-only or best format
            const audioFormat = info.formats.find(f => f.acodec !== 'none' && f.vcodec === 'none') || info.formats[0];
            const streamUrl = audioFormat.url;

            // Save to in-memory cache
            cache.setStreamCache(videoId, streamUrl);

            return streamUrl;
        } catch (error) {
            console.error('[YouTube] Stream URL error:', error.message);
            throw new Error('Failed to get stream URL');
        }
    }

    async getTrackStreamUrl(spotifyTrackId, trackName, artistName) {
        // Check learning cache for video ID
        const learnedVideoId = cache.getLearnedMatch(spotifyTrackId);
        let videoId;

        if (learnedVideoId) {
            console.log(`[YouTube] Using learned match for ${spotifyTrackId}: ${learnedVideoId}`);
            videoId = learnedVideoId;
        } else {
            // Search YouTube
            console.log(`[YouTube] Searching for: ${trackName} - ${artistName}`);
            const result = await this.searchTrack(trackName, artistName);
            videoId = result.videoId;

            // Save to learning cache
            cache.setLearnedMatch(spotifyTrackId, videoId);
        }

        // Always fetch fresh stream URL (YouTube URLs expire in minutes!)
        console.log(`[YouTube] Fetching fresh stream URL for ${videoId}`);
        const streamUrl = await this.getStreamUrl(videoId);

        return { url: streamUrl, cached: false };
    }

    async prefetchTrack(spotifyTrackId, trackName, artistName) {
        try {
            console.log(`[YouTube] Prefetching: ${trackName} - ${artistName}`);
            await this.getTrackStreamUrl(spotifyTrackId, trackName, artistName);
            console.log(`[YouTube] Prefetch complete for ${spotifyTrackId}`);
        } catch (error) {
            console.error(`[YouTube] Prefetch failed for ${spotifyTrackId}:`, error.message);
        }
    }

    async prefetchYouTubeVideo(videoId, title) {
        try {
            console.log(`[YouTube] Prefetching Direct Video: ${title} (${videoId})`);
            // Directly fetch/cache the stream URL using the known ID
            await this.getStreamUrl(videoId);
            console.log(`[YouTube] Direct Prefetch complete for ${videoId}`);
        } catch (error) {
            console.error(`[YouTube] Direct Prefetch failed for ${videoId}:`, error.message);
        }
    }
    async getRecommendations(videoId, trackName, artistName) {
        // Helper to clean strings properties similar to searchTrack (preserves text, removes symbols)
        const clean = (str) => {
            if (!str) return '';
            return str
                .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep Letters, Numbers, Space (Unicode aware)
                .replace(/\s+/g, ' ')
                .trim();
        };

        try {
            console.log(`[YouTube] Fetching recommendations for video: ${videoId}`);

            // Strategy 1: Try to get direct related videos from metadata
            try {
                const video = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`);

                if (video && video.videos && video.videos.length > 0) {
                    console.log(`[YouTube] Found ${video.videos.length} related videos directly.`);
                    return video.videos.map(v => ({
                        id: v.id,
                        name: v.title,
                        artists: v.channel?.name || "Unknown",
                        albumArt: v.thumbnail?.url || v.thumbnail,
                        duration: v.duration,
                        isYouTube: true,
                        youtubeUrl: v.url
                    }));
                }
            } catch (err) {
                console.warn(`[YouTube] Failed to get video details for related: ${err.message}`);
            }

            // Strategy 2: Fallback to Search with multiple stages (Spotify-like flow)
            // User requested robust fallback logic

            let query = '';
            let results = [];

            // Stage 1: Specific Context (Clean Title + Clean Channel)
            if (trackName) {
                const cleanTitle = clean(trackName);
                const cleanChannel = clean(artistName);

                query = `${cleanTitle} ${cleanChannel}`.trim();
                console.log(`[YouTube] Recs Stage 1 (Specific): "${query}"`);

                try {
                    results = await YouTube.search(query, { limit: 20, type: 'video' });
                } catch (e) { console.warn(`[YouTube] Stage 1 failed: ${e.message}`); }
            }

            // Stage 2: Broad Context (Clean Title only)
            // If Stage 1 returned few/no results, try broader search
            if (results.length < 10 && trackName) {
                const cleanTitle = clean(trackName);
                // append "song" or "music" to guide youtube context if needed, but "Cover" usually stays in title
                query = cleanTitle;
                console.log(`[YouTube] Recs Stage 2 (Broad) triggered (Stage 1 found ${results.length}): "${query}"`);

                try {
                    const broadResults = await YouTube.search(query, { limit: 20, type: 'video' });

                    // Merge unique results
                    const existingIds = new Set(results.map(r => r.id));
                    for (const vid of broadResults) {
                        if (!existingIds.has(vid.id)) {
                            results.push(vid);
                            existingIds.add(vid.id);
                        }
                    }
                } catch (e) { console.warn(`[YouTube] Stage 2 failed: ${e.message}`); }
            }

            // Stage 3: Raw Fallback
            // If we still have few results after Stage 2, try raw title search as last resort
            if (results.length < 10 && trackName) {
                console.log(`[YouTube] Recs Stage 3 (Raw) triggered (Current count ${results.length}): "${trackName}"`);
                try {
                    const rawResults = await YouTube.search(trackName, { limit: 20, type: 'video' });

                    // Merge unique results
                    const existingIds = new Set(results.map(r => r.id));
                    for (const vid of rawResults) {
                        if (!existingIds.has(vid.id)) {
                            results.push(vid);
                            existingIds.add(vid.id);
                        }
                    }
                } catch (e) { console.warn(`[YouTube] Stage 3 failed: ${e.message}`); }
            }

            console.log(`[YouTube] Recommendation search found ${results.length} results.`);

            // Filter out unwanted content (reactions, reviews) but NOT covers (user has karaoke playlist)
            const blockedTerms = ['reaction', 'react', 'review', 'reacting', 'first time', 'listening to'];
            const filtered = results.filter(v => {
                const titleLower = v.title?.toLowerCase() || '';
                return !blockedTerms.some(term => titleLower.includes(term));
            });
            console.log(`[YouTube] After filtering reactions/reviews: ${filtered.length}`);

            // Normalize function to create comparable track name
            const normalize = (str) => (str || '')
                .toLowerCase()
                .replace(/[\(\[\{].*?[\)\]\}]/g, '') // Remove parentheses content
                .replace(/official|music video|mv|lyric|lyrics|audio|hd|4k|full|ver\.|version/gi, '')
                .replace(/[^\p{L}\p{N}\s]/gu, '') // Keep only letters, numbers, spaces
                .replace(/\s+/g, ' ')
                .trim();

            // Dedup by normalized title (prioritize Topic channels, then first seen)
            const seenTitles = new Map();
            const deduped = [];

            for (const v of filtered) {
                if (v.id === videoId) continue; // Skip current video

                const normTitle = normalize(v.title);
                const channelName = v.channel?.name || '';
                const isTopic = channelName.includes('- Topic') || channelName.includes(' - トピック');

                if (!seenTitles.has(normTitle)) {
                    seenTitles.set(normTitle, { video: v, isTopic });
                    deduped.push(v);
                } else if (isTopic && !seenTitles.get(normTitle).isTopic) {
                    // Replace with Topic channel version
                    const existingIdx = deduped.findIndex(d => normalize(d.title) === normTitle);
                    if (existingIdx >= 0) {
                        deduped[existingIdx] = v;
                        seenTitles.set(normTitle, { video: v, isTopic: true });
                    }
                }
            }

            console.log(`[YouTube] After dedup by title: ${deduped.length}`);

            return deduped.map(v => ({
                id: v.id,
                name: v.title,
                artists: v.channel?.name || "Unknown",
                albumArt: v.thumbnail?.url || v.thumbnail,
                duration: v.duration,
                isYouTube: true,
                youtubeUrl: v.url
            }));

        } catch (error) {
            console.error(`[YouTube] Recommendations failed:`, error.message);
            return [];
        }
    }
}

export default new YouTubeService();
