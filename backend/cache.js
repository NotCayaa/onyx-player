import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CacheManager {
    constructor() {
        const baseDataDir = process.env.APP_DATA_DIR
            ? path.join(process.env.APP_DATA_DIR, 'onyx-data')
            : __dirname; // relative to this file (backend dir) in dev

        this.cacheDir = path.join(baseDataDir, 'cache');
        this.cacheFile = path.join(this.cacheDir, 'cache.json');

        // In-memory caches
        this.trackMetadata = new Map(); // Spotify track metadata
        this.youtubeUrls = new Map();   // Spotify ID -> YT URL with expiry
        this.learningCache = new Map(); // Successful Spotify -> YT matches
        this.streamCache = new Map();   // YouTube Video ID -> Direct Stream URL (In-Memory Only)
        this.prefetchQueue = [];        // Queue of track IDs to prefetch

        this.ensureCacheDir();
        this.load();
    }

    // In-Memory Stream Cache (VideoID -> URL)
    setStreamCache(videoId, url) {
        this.streamCache.set(videoId, {
            url,
            expires: Date.now() + (6 * 60 * 60 * 1000) // 6 Hours validity
        });
    }

    getStreamCache(videoId) {
        const item = this.streamCache.get(videoId);
        if (!item) return null;

        if (Date.now() > item.expires) {
            this.streamCache.delete(videoId);
            return null;
        }
        return item.url;
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    load() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));

                // Restore caches from file
                if (data.trackMetadata) {
                    this.trackMetadata = new Map(Object.entries(data.trackMetadata));
                }
                if (data.youtubeUrls) {
                    // Filter out expired URLs
                    const now = Date.now();
                    const urls = Object.entries(data.youtubeUrls).filter(([_, value]) => {
                        return value.expiresAt > now;
                    });
                    this.youtubeUrls = new Map(urls);
                }
                if (data.learningCache) {
                    this.learningCache = new Map(Object.entries(data.learningCache));
                }

                console.log(`[Cache] Loaded ${this.trackMetadata.size} tracks, ${this.youtubeUrls.size} YT URLs, ${this.learningCache.size} learned matches`);
            }
        } catch (error) {
            console.error('[Cache] Error loading cache:', error.message);
        }
    }

    save() {
        try {
            const data = {
                trackMetadata: Object.fromEntries(this.trackMetadata),
                youtubeUrls: Object.fromEntries(this.youtubeUrls),
                learningCache: Object.fromEntries(this.learningCache),
                savedAt: new Date().toISOString()
            };

            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('[Cache] Error saving cache:', error.message);
        }
    }

    // Track metadata
    getTrack(trackId) {
        return this.trackMetadata.get(trackId);
    }

    setTrack(trackId, metadata) {
        this.trackMetadata.set(trackId, metadata);
        this.save();
    }

    // YouTube URLs with expiry
    getYoutubeUrl(trackId) {
        const cached = this.youtubeUrls.get(trackId);
        if (!cached) return null;

        if (cached.expiresAt < Date.now()) {
            console.log(`[Cache] YT URL expired for ${trackId}`);
            this.youtubeUrls.delete(trackId);
            return null;
        }

        return cached.url;
    }

    setYoutubeUrl(trackId, url, ttlHours = 6) {
        const expiresAt = Date.now() + (ttlHours * 60 * 60 * 1000);
        this.youtubeUrls.set(trackId, { url, expiresAt });
        this.save();
    }

    // Learning cache (successful Spotify -> YT matches)
    getLearnedMatch(trackId) {
        return this.learningCache.get(trackId);
    }

    setLearnedMatch(trackId, ytVideoId) {
        this.learningCache.set(trackId, ytVideoId);
        this.save();
    }

    // Prefetch queue management
    addToPrefetch(trackIds) {
        const newIds = trackIds.filter(id => !this.prefetchQueue.includes(id));
        this.prefetchQueue.push(...newIds);
    }

    getNextPrefetch() {
        return this.prefetchQueue.shift();
    }

    clearPrefetch() {
        this.prefetchQueue = [];
    }

    // Generic cache with TTL (in-memory only, not persisted)
    genericCache = new Map();

    getGeneric(key) {
        const item = this.genericCache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.genericCache.delete(key);
            return null;
        }
        return item.data;
    }

    setGeneric(key, data, ttlMs = 60 * 60 * 1000) {
        this.genericCache.set(key, {
            data,
            expiry: Date.now() + ttlMs
        });
    }

    // Clear all cache
    clear() {
        this.trackMetadata.clear();
        this.youtubeUrls.clear();
        this.learningCache.clear();
        this.prefetchQueue = [];
        this.save();
        console.log('[Cache] All caches cleared');
    }
}

export default new CacheManager();
