import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DATA_DIR = process.env.APP_DATA_DIR
    ? path.join(process.env.APP_DATA_DIR, 'onyx-data')
    : __dirname;

const DATA_DIR = path.join(BASE_DATA_DIR, 'cache');
const PLAYLIST_FILE = path.join(DATA_DIR, 'playlists.json');

// Ensure cache directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Ensure playlist file exists
if (!fs.existsSync(PLAYLIST_FILE)) {
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify([], null, 2));
}

function getPlaylists() {
    try {
        const data = fs.readFileSync(PLAYLIST_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function savePlaylists(playlists) {
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(playlists, null, 2));
}

// GET all playlists
router.get('/', (req, res) => {
    res.json(getPlaylists());
});

// POST create new playlist
router.post('/', (req, res) => {
    const { name, type = 'local', url = '' } = req.body;
    const playlists = getPlaylists();

    const newPlaylist = {
        id: Date.now().toString(),
        name: name || 'New Playlist',
        type, // 'local' or 'link' (spotify/youtube)
        url,
        tracks: [],
        coverPath: null, // Path to cover image
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    playlists.push(newPlaylist);
    savePlaylists(playlists);
    res.json(newPlaylist);
});

// DELETE playlist
router.delete('/:id', (req, res) => {
    let playlists = getPlaylists();
    playlists = playlists.filter(p => p.id !== req.params.id);
    savePlaylists(playlists);
    res.json({ success: true });
});

// POST add track to playlist
router.post('/:id/tracks', (req, res) => {
    const { track } = req.body;
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === req.params.id);

    if (playlist) {
        // Prevent duplicates
        const exists = playlist.tracks.some(t => t.id === track.id);
        if (exists) {
            return res.status(409).json({ error: 'Track already in playlist' });
        }
        playlist.tracks.push(track);
        savePlaylists(playlists);
        res.json(playlist);
    } else {
        res.status(404).json({ error: 'Playlist not found' });
    }
});

// DELETE remove track from playlist
router.delete('/:id/tracks/:index', (req, res) => {
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === req.params.id);

    if (playlist) {
        const index = parseInt(req.params.index);
        if (index >= 0 && index < playlist.tracks.length) {
            playlist.tracks.splice(index, 1);
            savePlaylists(playlists);
            res.json(playlist);
        } else {
            res.status(400).json({ error: 'Invalid track index' });
        }
    } else {
        res.status(404).json({ error: 'Playlist not found' });
    }
});

// PUT reorder tracks in playlist
router.put('/:id/reorder', (req, res) => {
    const { fromIndex, toIndex } = req.body;
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === req.params.id);

    if (playlist) {
        if (
            fromIndex >= 0 && fromIndex < playlist.tracks.length &&
            toIndex >= 0 && toIndex < playlist.tracks.length
        ) {
            const [track] = playlist.tracks.splice(fromIndex, 1);
            playlist.tracks.splice(toIndex, 0, track);
            savePlaylists(playlists);
            res.json(playlist);
        } else {
            res.status(400).json({ error: 'Invalid indices' });
        }
    } else {
        res.status(404).json({ error: 'Playlist not found' });
    }
});

// PUT update playlist metadata (e.g., name, tracks)
router.put('/:id', (req, res) => {
    const { name, tracks } = req.body;
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === req.params.id);

    if (playlist) {
        if (name) playlist.name = name;
        if (tracks && Array.isArray(tracks)) playlist.tracks = tracks;

        playlist.updatedAt = new Date().toISOString();
        savePlaylists(playlists);
        res.json(playlist);
    } else {
        res.status(404).json({ error: 'Playlist not found' });
    }
});

// POST upload cover image for playlist
// Note: This endpoint requires multer middleware to be set up in index.js
// The actual route will be: app.post('/playlists/:id/cover', upload.single('cover'), ...)
router.postCoverUpload = (req, res) => {
    const { id } = req.params;
    const playlists = getPlaylists();
    const playlist = playlists.find(p => p.id === id);

    if (!playlist) {
        return res.status(404).json({ error: 'Playlist not found' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Store relative path to cover
    const coverPath = `/covers/${req.file.filename}`;
    playlist.coverPath = coverPath;
    playlist.updatedAt = new Date().toISOString();

    savePlaylists(playlists);
    res.json({ coverPath, playlist });
};

export default router;
