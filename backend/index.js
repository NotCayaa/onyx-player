import express from 'express';
import youtubedlExec from 'youtube-dl-exec';
const { exec } = youtubedlExec;
import os from 'os';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import spotify from './spotify.js';
import youtube from './youtube.js';
import cache from './cache.js';
import playlist from './playlist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Base Data Directory
const BASE_DATA_DIR = process.env.APP_DATA_DIR
    ? path.join(process.env.APP_DATA_DIR, 'onyx-data')
    : __dirname;

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
const COVERS_DIR = path.join(BASE_DATA_DIR, 'covers');
const CACHE_DIR = path.join(BASE_DATA_DIR, 'cache');

[COVERS_DIR, CACHE_DIR].forEach(dirPath => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`[Init] Created directory: ${dirPath}`);
    }
});

// Multer configuration for cover uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, COVERS_DIR);
    },
    filename: (req, file, cb) => {
        const playlistId = req.params.id;
        const ext = path.extname(file.originalname);
        cb(null, `${playlistId}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Separate Multer config for data imports (JSON files)
const uploadImport = multer({
    dest: os.tmpdir(), // Use temp directory for intermediate storage
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.json') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON files are allowed for import'));
        }
    }
});

app.use(cors());
app.use(express.json());

// Serve cover images statically from the correct directory
app.use('/covers', express.static(COVERS_DIR));

// Cover upload endpoint (must be before app.use('/playlists'))
app.post('/playlists/:id/cover', upload.single('cover'), playlist.postCoverUpload);

// Data Import Endpoint
app.post('/import/data', uploadImport.single('file'), (req, res) => {
    try {
        const { type } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!['cache', 'playlist'].includes(type)) {
            // Clean up uploaded file if invalid type
            fs.unlinkSync(file.path);
            return res.status(400).json({ error: 'Invalid import type. Must be "cache" or "playlist".' });
        }

        const targetFile = type === 'cache' ? 'cache.json' : 'playlists.json';
        const targetPath = path.join(CACHE_DIR, targetFile);

        // Move uploaded file to target location (rename/overwrite)
        fs.renameSync(file.path, targetPath);
        console.log(`[Import] Imported ${type} to ${targetPath}`);

        // Reload cache if needed
        if (type === 'cache') {
            cache.load();
        }

        res.json({ message: `${type} imported successfully. Refresh app to see changes.` });
    } catch (error) {
        console.error('[Import] Error:', error);
        res.status(500).json({ error: 'Failed to import data' });
    }
});

// Data Export Endpoint
app.get('/export/data', (req, res) => {
    try {
        const { type } = req.query;
        if (!['cache', 'playlist'].includes(type)) {
            return res.status(400).json({ error: 'Invalid export type. Must be "cache" or "playlist".' });
        }

        const targetFile = type === 'cache' ? 'cache.json' : 'playlists.json';
        const filePath = path.join(CACHE_DIR, targetFile);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath);
    } catch (error) {
        console.error('[Export] Error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Image Proxy for CORS bypass (album art color extraction)
app.get('/proxy/image', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch image' });
        }

        const contentType = response.headers.get('content-type');
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('[Proxy] Error:', error);
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});

// Get Spotify Config (for Settings UI)
app.get('/config/spotify', (req, res) => {
    try {
        const configPath = path.join(BASE_DATA_DIR, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json({
                clientId: config.spotifyClientId || '',
                clientSecret: config.spotifyClientSecret || ''
            });
        } else {
            res.json({ clientId: '', clientSecret: '' });
        }
    } catch (error) {
        console.error('[Config] Error reading config:', error);
        res.status(500).json({ error: 'Failed to read config' });
    }
});

app.use('/playlists', playlist);

// Search tracks
app.get('/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q) {
            return res.json({ error: 'Query parameter "q" is required' });
        }

        const tracks = await spotify.searchTracks(q, parseInt(limit));
        res.json({ tracks });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get track info
app.get('/track/:id', async (req, res) => {
    try {
        const track = await spotify.getTrack(req.params.id);
        res.json({ track });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get Spotify playlist
app.get('/spotify/playlist/:id', async (req, res) => {
    try {
        const playlist = await spotify.getPlaylist(req.params.id);
        res.json(playlist);
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get recommendations
app.get('/recommendations/:trackId', async (req, res) => {
    try {
        const { limit = 10, isYouTube, name, artist } = req.query;

        if (isYouTube === 'true') {
            const tracks = await youtube.getRecommendations(req.params.trackId, name, artist);
            // Limit results manually since youtube-sr limit applies to search, not necessarily related
            res.json({ tracks: tracks.slice(0, parseInt(limit)) });
        } else {
            const tracks = await spotify.getRecommendations(req.params.trackId, parseInt(limit));
            res.json({ tracks });
        }
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get new releases
app.get('/new-releases', async (req, res) => {
    try {
        const { limit = 20, history } = req.query;
        const userHistory = history ? JSON.parse(history) : [];
        const tracks = await spotify.getNewReleases(userHistory, parseInt(limit));
        res.json({ tracks });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get YouTube stream URL for a Spotify track
app.post('/stream', async (req, res) => {
    try {
        const { trackId, isYouTube, youtubeUrl } = req.body;

        if (!trackId) {
            return res.json({ error: 'trackId is required' });
        }

        let videoId;

        // If it's a YouTube direct search result, use provided metadata
        if (isYouTube) {
            videoId = trackId;
        } else {
            // For Spotify tracks, get metadata and find YouTube
            const track = await spotify.getTrack(trackId);

            // Try cache first
            const learnedId = cache.getLearnedMatch(trackId);
            if (learnedId) {
                videoId = learnedId;
            } else {
                // Trigger search if not found
                await youtube.resolveMatch(trackId, track.name, track.artist);
                videoId = cache.getLearnedMatch(trackId);
            }
        }

        if (!videoId) {
            return res.json({ error: 'Could not resolve video ID' });
        }

        // HYBRID STRATEGY: Disk Cache -> Direct Stream Fallback

        // 1. Check if file exists in cache
        const cacheFilePath = cache.getCacheFilePath(videoId);

        if (fs.existsSync(cacheFilePath)) {
            // console.log(`[Stream] Serving from disk cache: ${videoId}`);
            // Serve static file directly from disk
            // We return a specific URL for serving the file to allow seeking
            return res.json({
                streamUrl: `http://localhost:${PORT}/stream/cache/${videoId}`,
                cached: true,
                track: req.body.track
            });
        }

        // 2. Fallback: Direct Stream (Live Pipe)
        // console.log(`[Stream] Cache miss, using direct stream for ${videoId}`);
        const directUrl = `http://localhost:${PORT}/stream/direct/${videoId}`;

        res.json({
            streamUrl: directUrl,
            cached: false,
            track: req.body.track
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// CACHE STREAM ENDPOINT (Serves downloaded file)
app.get('/stream/cache/:videoId', (req, res) => {
    const { videoId } = req.params;
    const filePath = cache.getCacheFilePath(videoId);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath); // Express handles range requests automatically
    } else {
        res.status(404).send('Cache file not found');
    }
});

// DIRECT STREAM ENDPOINT (Spawns yt-dlp binary)
app.get('/stream/direct/:videoId', (req, res) => {
    const { videoId } = req.params;
    console.log(`[Direct Stream] Spawning yt-dlp for ${videoId}`);

    try {
        const options = {
            output: '-',
            // Relaxed format: Try best audio, fallback to best video+audio (e.g. format 18)
            format: 'bestaudio/best',
            noCheckCertificates: true,
            // preferFreeFormats: true, // Removed: Might be prioritizing broken formats
            noPlaylist: true,
            noWarnings: true,
            // Force Android Client (Verified working via diagnostic)
            extractorArgs: 'youtube:player_client=android',
            // CRITICAL: Do NOT override User-Agent. 
            // Diagnostic showed success with default Desktop UA. 
            // Forcing Android UA caused 403s likely due to TLS mismatch.
        };

        /* 
        // Cookies removed based on successful diagnostic
        const cookiePath = path.join(process.cwd(), 'backend', 'cookies.txt');
        if (fs.existsSync(cookiePath)) {
            options.cookies = cookiePath;
        } 
        */

        // stream directly to response
        const subprocess = exec(
            `https://www.youtube.com/watch?v=${videoId}`,
            options
        );

        // Pipe stdout (audio binary) to response
        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', (data) => {
            // console.error(`[yt-dlp stderr] ${data}`); 
        });

        // Handle cleanup
        res.on('close', () => {
            console.log('[Direct Stream] Client closed connection, killing yt-dlp');
            subprocess.kill();
        });

    } catch (e) {
        console.error('[Direct Stream] Error:', e);
        if (!res.headersSent) res.status(500).send('Stream Error');
    }
});

// Prefetch next tracks
app.post('/prefetch', async (req, res) => {
    try {
        const { tracks } = req.body;

        if (!Array.isArray(tracks) || tracks.length === 0) {
            return res.json({ error: 'tracks array is required' });
        }

        // Start prefetching in background (don't await)
        for (const track of tracks) {
            // DIRECT YOUTUBE PREFETCH (No Search)
            if (track.isYouTube) {
                youtube.prefetchYouTubeVideo(track.id, track.name).catch(err => {
                    console.error(`[Prefetch] Direct failed for ${track.name}:`, err.message);
                });
                continue;
            }

            // SPOTIFY SEARCH PREFETCH
            // Use metadata from client to avoid extra Spotify API calls
            if (track.id && track.name) {
                youtube.prefetchTrack(
                    track.id,
                    track.name,
                    track.artists || track.artist || ''
                ).catch(err => {
                    console.error(`[Prefetch] Search failed for ${track.name}:`, err.message);
                });
            }
        }

        res.json({ message: `Prefetching ${tracks.length} tracks` });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// YouTube direct search
app.get('/youtube/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q) {
            return res.json({ error: 'Query parameter "q" is required' });
        }

        const { YouTube } = await import('youtube-sr');
        const results = await YouTube.search(q, { limit: parseInt(limit), type: 'video' });

        const videos = results.map(video => ({
            id: video.id,
            title: video.title,
            channel: video.channel?.name || 'Unknown',
            thumbnail: video.thumbnail?.url || null,
            duration: video.duration,
            url: video.url,
            views: video.views
        }));

        res.json({ videos });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Get YouTube playlist videos
app.get('/youtube/playlist/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        const youtubedl = (await import('youtube-dl-exec')).default;

        const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        console.log(`[YouTube] Fetching playlist: ${playlistId} via yt-dlp`);

        const output = await youtubedl(playlistUrl, {
            dumpSingleJson: true,
            flatPlaylist: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        const entries = output.entries || [];

        const videos = entries.map(video => ({
            id: video.id,
            title: video.title,
            channel: video.uploader || 'Unknown',
            thumbnail: video.thumbnail || video.thumbnails?.[0]?.url || null,
            duration: video.duration,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            isYouTube: true
        }));

        res.json({
            title: output.title || 'YouTube Playlist',
            videos
        });
    } catch (error) {
        console.error('[YouTube] Playlist error:', error);
        res.json({ error: 'Failed to fetch playlist' });
    }
});

// Clear cache
app.post('/cache/clear', (req, res) => {
    cache.clear();
    res.json({ message: 'Cache cleared' });
});

// Clear Spotify auth cache
app.post('/clear-cache', async (req, res) => {
    spotify.clearAuth();
    res.json({ message: 'Cache cleared successfully!' });
});

// Clear all cache (metadata, YouTube URLs, learned matches)
app.delete('/cache/clear', (req, res) => {
    try {
        cache.clear();
        res.json({
            success: true,
            message: 'All caches cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to clear cache'
        });
    }
});

// Update Spotify Credentials
app.post('/config/spotify', async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        await spotify.updateCredentials(clientId, clientSecret);
        res.json({ message: 'Spotify credentials updated successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Audio Proxy Endpoint - streams audio through localhost to bypass CORS for visualizer
app.get('/audio/proxy', async (req, res) => {
    // Manually extract 'url' from query string to avoid Express parsing issues with unencoded ampersands
    let url = req.query.url;

    // Robust fallback: Parse from full request URL if query param seems truncated or suspicious
    const fullUrl = req.url;
    if (fullUrl.includes('url=')) {
        const match = fullUrl.match(/[?&]url=([^&]*)/);
        const rawUrlParam = fullUrl.substring(fullUrl.indexOf('url=') + 4);
        if (rawUrlParam) {
            if (rawUrlParam.startsWith('http')) {
                url = rawUrlParam;
            }
        }
    }

    if (!url) {
        return res.status(400).json({ error: 'url parameter is required' });
    }

    url = String(url);

    if (url.startsWith('https%3A') || url.startsWith('http%3A')) {
        url = decodeURIComponent(url);
    }

    // Helper to safely strip param from URL
    const removeParam = (urlStr, param) => {
        return urlStr.replace(new RegExp(`[&?]${param}=[^&]*`, 'g'), '');
    };

    // Extract updated params if present
    if (url.includes('onyx_ua=')) url = removeParam(url, 'onyx_ua');
    if (url.includes('onyx_cookie=')) url = removeParam(url, 'onyx_cookie');

    console.log(`[Audio Proxy] Full Proxy URL: ${url}`);

    try {
        // Headers for direct proxy
        const headers = {
            'User-Agent': 'com.google.android.youtube/17.36.36 (Linux; U; Android 12; en_US) gzip',
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        } else {
            console.log('[Audio Proxy] Streaming audio...');
        }

        // Fetch audio from YouTube URL
        const response = await fetch(url, { headers });

        if (!response.ok && response.status !== 206) {
            console.error('[Audio Proxy] Upstream error:', response.status);
            return res.status(response.status).json({ error: 'Failed to fetch audio from upstream' });
        }

        // CORS headers for audio analysis
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Range');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

        // Forward content headers
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');

        if (contentType) res.set('Content-Type', contentType);
        if (contentLength) res.set('Content-Length', contentLength);
        if (contentRange) res.set('Content-Range', contentRange);
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'no-cache');

        res.status(response.status);

        // Pipe the audio stream directly to client
        const { Readable } = await import('stream');
        const nodeStream = Readable.fromWeb(response.body);
        nodeStream.pipe(res);

        nodeStream.on('error', (err) => {
            console.error('[Audio Proxy] Stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
            }
        });

    } catch (error) {
        console.error('[Audio Proxy] Error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to proxy audio' });
        }
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Music Player API',
        version: '1.0.0'
    });
});

app.listen(PORT, () => {
    console.log(`🎵 Music Player API running on http://localhost:${PORT}`);
});
