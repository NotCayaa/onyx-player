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

        // Preferences (Persisted)
        this.preferences = {
            dataSaver: false
        };

        this.ensureCacheDir();
        this.load();
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    // --- Preferences ---
    getPreference(key) {
        return this.preferences[key];
    }

    setPreference(key, value) {
        this.preferences[key] = value;
        this.save();
    }

    load() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));

                // Restore preferences
                if (data.preferences) {
                    this.preferences = { ...this.preferences, ...data.preferences };
                }

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

                console.log(`[Cache] Loaded ${this.trackMetadata.size} tracks, ${this.youtubeUrls.size} YT URLs, ${this.learningCache.size} matches, DataSaver: ${this.preferences.dataSaver}`);
            }
        } catch (error) {
            console.error('[Cache] Error loading cache:', error.message);
        }
    }

    save() {
        try {
            const data = {
                preferences: this.preferences,
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

        // Delete all downloaded files
        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                files.forEach(file => {
                    if (file.endsWith('.webm')) {
                        fs.unlinkSync(path.join(this.cacheDir, file));
                    }
                });
            }
            console.log('[Cache] All metadata and downloaded files cleared');
        } catch (error) {
            console.error('[Cache] Failed to clear physical files:', error.message);
        }
    }

    // --- Disk Cache Management ---

    getCacheFilePath(videoId) {
        // We use .webm as the standard container for opus audio from yt-dlp
        return path.join(this.cacheDir, `${videoId}.webm`);
    }

    async cleanupCache(maxFiles = 20) {
        try {
            const files = fs.readdirSync(this.cacheDir)
                .filter(file => file.endsWith('.webm'))
                .map(file => {
                    const filePath = path.join(this.cacheDir, file);
                    return {
                        path: filePath,
                        time: fs.statSync(filePath).mtime.getTime()
                    };
                })
                .sort((a, b) => a.time - b.time); // Oldest first

            if (files.length > maxFiles) {
                const toDelete = files.slice(0, files.length - maxFiles);
                toDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    // console.log(`[Cache] Cleaned up old file: ${path.basename(file.path)}`);
                });
                console.log(`[Cache] Cleanup removed ${toDelete.length} old tracks.`);
            }
        } catch (error) {
            console.error('[Cache] Cleanup failed:', error.message);
        }
    }
}

export default new CacheManager();
