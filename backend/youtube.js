import youtubedl from 'youtube-dl-exec';
import { YouTube } from 'youtube-sr';
import cache from './cache.js';
import fs from 'fs';
import path from 'path';

class YouTubeService {
    constructor() {
        this.activeDownloads = new Set();
    }

    async searchTrack(trackName, artistName) {

        const startTime = Date.now();
        const clean = (str) => str
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        let query = `${clean(trackName)} ${clean(artistName)}`;
        console.log(`[YouTube] Trying query: "${query}"`);

        let results = [];
        try {
            results = await YouTube.search(query, { limit: 15, type: 'video' });
        } catch (err) {
            console.warn(`[YouTube] Primary search failed:`, err.message);

            // Fallback strategy chain
            const officialQuery = `${query} official`;
            try {
                results = await YouTube.search(officialQuery, { limit: 15, type: 'video' });
            } catch (err1) {
                const asciiQuery = query.replace(/[^\x00-\x7F]/g, '');
                try {
                    if (asciiQuery.trim().length > 2) {
                        results = await YouTube.search(asciiQuery, { limit: 15, type: 'video' });
                    } else {
                        throw new Error('ASCII query too short');
                    }
                } catch (err2) {
                    const simpleQuery = `${clean(trackName)} song`;
                    try {
                        results = await YouTube.search(simpleQuery, { limit: 10, type: 'video' });
                    } catch (err3) {
                        const plainQuery = clean(trackName);
                        try {
                            results = await YouTube.search(plainQuery, { limit: 10, type: 'video' });
                        } catch (err4) {
                            // Ultimate Fallback: yt-dlp search
                            try {
                                const ytdlpQuery = `ytsearch1:${clean(trackName)} ${clean(artistName)}`;
                                const output = await youtubedl(ytdlpQuery, {
                                    dumpSingleJson: true,
                                    noWarnings: true,
                                    preferFreeFormats: true,
                                    flatPlaylist: true
                                });

                                if (output && output.entries && output.entries.length > 0) {
                                    const video = output.entries[0];
                                    return {
                                        videoId: video.id,
                                        title: video.title,
                                        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
                                        duration: video.duration * 1000,
                                        url: video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`
                                    };
                                }
                                throw new Error('yt-dlp returned no results');
                            } catch (err5) {
                                console.error('[YouTube] All search attempts failed');
                                throw new Error('Search failed');
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
        const targetTitleNoSpace = targetTitle.replace(/\s/g, '');
        const targetArtist = clean(artistName).toLowerCase();

        // Filter and Score results
        const filtered = results.filter(video => {
            const title = video.title.toLowerCase();
            const channel = video.channel?.name?.toLowerCase() || '';
            const unwantedKeywords = [
                'reaction', 'reacts', 'reacting', 'review', 'reviews', 'reviewing',
                'tutorial', 'lesson', 'how to', 'cover', 'covered',
                'piano version', 'guitar version', 'nightcore', 'slowed', 'reverb',
                'compilation', 'playlist', 'mix', 'full album'
            ];
            return !unwantedKeywords.some(k => title.includes(k) || channel.includes(k));
        });

        const candidates = filtered.length > 0 ? filtered : results;

        const scored = candidates.map(video => {
            const title = clean(video.title).toLowerCase();
            const titleNoSpace = title.replace(/\s/g, '');
            const rawTitle = video.title.toLowerCase();
            const channel = clean(video.channel?.name || '').toLowerCase();
            let score = 0;

            if (title.includes(targetTitle) || titleNoSpace.includes(targetTitleNoSpace)) score += 100;
            else score -= 500;

            if (rawTitle.includes('official')) score += 50;
            if (rawTitle.includes('official audio')) score += 50;
            if (rawTitle.includes('official music video')) score += 50;
            if (rawTitle.includes('details')) score -= 10;

            if (channel.includes('vevo')) score += 50;
            if (video.channel?.name?.includes(' - Topic')) score += 80;
            if (channel.includes(targetArtist)) score += 100;

            if (video.views > 1000000) score += 50;
            if (video.views > 10000000) score += 30;

            if (rawTitle.includes('reaction') || rawTitle.includes('reacts')) score -= 1000;
            if (rawTitle.includes('review')) score -= 1000;
            if (rawTitle.includes('cover')) score -= 500;
            if (rawTitle.includes('live')) score -= 50;
            if (rawTitle.includes('remix')) score -= 50;

            return { video, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];

        console.log(`[YouTube] Selected: "${best.video.title}" (Score: ${best.score})`);

        return {
            videoId: best.video.id,
            title: best.video.title,
            thumbnail: best.video.thumbnail?.url,
            duration: best.video.duration,
            url: best.video.url
        };
    }

    async resolveMatch(spotifyTrackId, trackName, artistName) {
        const learnedVideoId = cache.getLearnedMatch(spotifyTrackId);
        if (learnedVideoId) {
            console.log(`[YouTube] Using learned match for ${spotifyTrackId}: ${learnedVideoId}`);
            return learnedVideoId;
        }

        console.log(`[YouTube] Searching for: ${trackName} - ${artistName}`);
        const result = await this.searchTrack(trackName, artistName);
        cache.setLearnedMatch(spotifyTrackId, result.videoId);
        return result.videoId;
    }

    async downloadTrack(videoId) {
        // 0. Check Data Saver Mode
        if (cache.getPreference('dataSaver')) {
            // console.log(`[YouTube] SKIP: Data Saver Mode is ON. Skipping download for ${videoId}`);
            return;
        }

        const targetPath = cache.getCacheFilePath(videoId);

        // 1. Check active downloads (Race Condition Fix)
        if (this.activeDownloads.has(videoId)) {
            console.log(`[YouTube] SKIP: Download already in progress for ${videoId}`);
            return;
        }

        // 2. Check existence
        if (fs.existsSync(targetPath)) {
            // console.log(`[YouTube] Download skipped, cache exists for ${videoId}`);
            return;
        }

        this.activeDownloads.add(videoId);
        console.log(`[YouTube] Starting background download for ${videoId}`);

        try {
            await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
                output: targetPath,
                format: 'bestaudio/best', // Relaxed
                noCheckCertificates: true,
                noWarnings: true,
                noPlaylist: true,
                extractorArgs: 'youtube:player_client=android'
            });
            console.log(`[YouTube] Download complete for ${videoId}`);

            cache.cleanupCache();
        } catch (error) {
            console.error(`[YouTube] Download failed for ${videoId}:`, error.message);
        } finally {
            this.activeDownloads.delete(videoId);
        }
    }

    async prefetchTrack(spotifyTrackId, trackName, artistName) {
        try {
            console.log(`[YouTube] Prefetching: ${trackName} - ${artistName}`);

            // 1. Resolve ID
            const videoId = await this.resolveMatch(spotifyTrackId, trackName, artistName);

            // 2. Trigger Background Download
            this.downloadTrack(videoId);

        } catch (error) {
            console.error(`[YouTube] Prefetch failed for ${spotifyTrackId}:`, error.message);
        }
    }

    async prefetchYouTubeVideo(videoId, title) {
        try {
            console.log(`[YouTube] Prefetching Direct Video: ${title} (${videoId})`);
            // Trigger Background Download directly
            this.downloadTrack(videoId);
        } catch (error) {
            console.error(`[YouTube] Direct Prefetch failed for ${videoId}:`, error.message);
        }
    }

    async getRecommendations(videoId, trackName, artistName) {
        const clean = (str) => {
            if (!str) return '';
            return str.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        };

        try {
            // Strategy 1: Direct related videos
            try {
                const video = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`);
                if (video && video.videos && video.videos.length > 0) {
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
            } catch (err) { /* ignore */ }

            // Strategy 2: Search fallback
            let query = '';
            let results = [];

            if (trackName) {
                query = `${clean(trackName)} ${clean(artistName)}`.trim();
                try { results = await YouTube.search(query, { limit: 20, type: 'video' }); } catch (e) { }
            }

            if (results.length < 10 && trackName) {
                query = clean(trackName);
                try {
                    const broad = await YouTube.search(query, { limit: 20, type: 'video' });
                    // Merge unique
                    const ids = new Set(results.map(r => r.id));
                    broad.forEach(v => {
                        if (!ids.has(v.id)) { results.push(v); ids.add(v.id); }
                    });
                } catch (e) { }
            }

            const blockedTerms = ['reaction', 'react', 'review', 'reacting', 'first time', 'listening to'];
            const filtered = results.filter(v => {
                const titleLower = v.title?.toLowerCase() || '';
                return !blockedTerms.some(term => titleLower.includes(term));
            });

            const deduped = [];
            const ids = new Set();
            for (const v of filtered) {
                if (v.id !== videoId && !ids.has(v.id)) {
                    deduped.push(v);
                    ids.add(v.id);
                }
            }

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
