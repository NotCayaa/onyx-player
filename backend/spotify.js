import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';
import cache from './cache.js';

dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Base Data Directory (Use env var from Electron or fallback to local)
const BASE_DATA_DIR = process.env.APP_DATA_DIR
    ? path.join(process.env.APP_DATA_DIR, 'onyx-data')
    : __dirname;

const CONFIG_PATH = path.join(BASE_DATA_DIR, 'config.json');

// Ensure base dir exists
if (!fs.existsSync(BASE_DATA_DIR)) {
    fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
}

class SpotifyService {
    constructor() {
        this.loadConfig();
        this.spotify = new SpotifyWebApi({
            clientId: this.clientId,
            clientSecret: this.clientSecret
        });

        this.tokenExpiresAt = 0;
    }

    loadConfig() {
        // Default to environment variables
        this.clientId = process.env.SPOTIFY_CLIENT_ID;
        this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

        // Try to load from config.json
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
                if (config.spotifyClientId) this.clientId = config.spotifyClientId;
                if (config.spotifyClientSecret) this.clientSecret = config.spotifyClientSecret;
                console.log('[Spotify] Loaded credentials from config.json');
            }
        } catch (error) {
            console.error('[Spotify] Failed to load config.json:', error.message);
        }
    }

    async updateCredentials(clientId, clientSecret) {
        if (!clientId || !clientSecret) {
            throw new Error('Both Client ID and Client Secret are required');
        }

        this.clientId = clientId;
        this.clientSecret = clientSecret;

        // Update instance
        this.spotify.setClientId(clientId);
        this.spotify.setClientSecret(clientSecret);

        // Save to config.json
        try {
            let config = {};
            if (fs.existsSync(CONFIG_PATH)) {
                config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            }
            config.spotifyClientId = clientId;
            config.spotifyClientSecret = clientSecret;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
            console.log('[Spotify] Saved new credentials to config.json');
        } catch (error) {
            console.error('[Spotify] Failed to save config.json:', error.message);
            throw new Error('Failed to save configuration');
        }

        // Force re-auth
        this.tokenExpiresAt = 0;
        await this.ensureAuth();
    }

    async withRetry(operation, maxRetries = 1) {
        let lastError;
        for (let i = 0; i <= maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                // Retry only on network errors or 5xx server errors
                if (i < maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || (error.statusCode >= 500 && error.statusCode < 600))) {
                    const delay = 500 * (i + 1);
                    console.warn(`[Spotify] Operation failed, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error; // Throw other errors immediately
            }
        }
        throw lastError;
    }

    async ensureAuth() {
        if (Date.now() < this.tokenExpiresAt) {
            return; // Token still valid
        }

        try {
            await this.withRetry(async () => {
                const data = await this.spotify.clientCredentialsGrant();
                this.spotify.setAccessToken(data.body.access_token);
                this.tokenExpiresAt = Date.now() + (data.body.expires_in * 1000) - 60000; // Refresh 1min before expiry
                console.log('[Spotify] Access token refreshed');
            });
        } catch (error) {
            console.error('[Spotify] Auth error after retries:', error.message);
            throw new Error('Failed to authenticate with Spotify');
        }
    }

    async searchTracks(query, limit = 20) {
        await this.ensureAuth();

        try {
            const result = await this.withRetry(() => this.spotify.searchTracks(query, { limit }));
            const tracks = result.body.tracks.items.map(track => ({
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                albumArt: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                previewUrl: track.preview_url,
                spotifyUrl: track.external_urls.spotify
            }));

            // Cache track metadata
            tracks.forEach(track => {
                cache.setTrack(track.id, track);
            });

            return tracks;
        } catch (error) {
            console.error('[Spotify] Search error:', error.message);
            throw new Error('Failed to search tracks');
        }
    }

    async getTrack(trackId) {
        // Check cache first
        const cached = cache.getTrack(trackId);
        if (cached) {
            console.log(`[Spotify] Cache hit for track ${trackId}`);
            return cached;
        }

        await this.ensureAuth();

        try {
            const result = await this.withRetry(() => this.spotify.getTrack(trackId));
            const track = result.body;

            const metadata = {
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                albumArt: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                previewUrl: track.preview_url,
                spotifyUrl: track.external_urls.spotify
            };

            cache.setTrack(trackId, metadata);
            return metadata;
        } catch (error) {
            console.error('[Spotify] Get track error:', error.message);
            throw new Error('Failed to get track info');
        }
    }

    async getRecommendations(seedTrackId, limit = 10) {
        // Check cache first (1 hour TTL)
        const cacheKey = `recommendations:${seedTrackId}:${limit}`;
        const cached = cache.getGeneric(cacheKey);
        if (cached) {
            console.log(`[Spotify] Cache hit for recommendations ${seedTrackId}`);
            return cached;
        }

        await this.ensureAuth();

        try {
            // Get seed track info to extract artist
            const seedTrack = await this.getTrack(seedTrackId);
            const artistId = seedTrack.artistId || (await this.withRetry(() => this.spotify.getTrack(seedTrackId))).body.artists[0].id;

            // Parallel API calls for efficiency
            const [recommendations, artistTopTracks, relatedArtists] = await Promise.all([
                // 1. Spotify recommendations
                this.withRetry(() => this.spotify.getRecommendations({
                    seed_tracks: [seedTrackId],
                    limit: Math.ceil(limit * 0.5) // 50% from recommendations
                })).catch(() => ({ body: { tracks: [] } })),

                // 2. Artist's top tracks
                this.withRetry(() => this.spotify.getArtistTopTracks(artistId, 'US'))
                    .catch(() => ({ body: { tracks: [] } })),

                // 3. Related artists
                this.withRetry(() => this.spotify.getArtistRelatedArtists(artistId))
                    .catch(() => ({ body: { artists: [] } }))
            ]);

            // Collect all tracks
            let allTracks = [];

            // Add Spotify recommendations (50%)
            const recTracks = recommendations.body.tracks || [];
            allTracks.push(...recTracks.slice(0, Math.ceil(limit * 0.5)));

            // Add artist's popular tracks (25%) - excluding seed track
            const topTracks = (artistTopTracks.body.tracks || [])
                .filter(t => t.id !== seedTrackId)
                .slice(0, Math.ceil(limit * 0.25));
            allTracks.push(...topTracks);

            // Add related artists' top tracks (25%)
            if (relatedArtists.body.artists && relatedArtists.body.artists.length > 0) {
                const relatedArtist = relatedArtists.body.artists[0];
                const relatedTopTracks = await this.withRetry(() => this.spotify.getArtistTopTracks(relatedArtist.id, 'US'))
                    .catch(() => ({ body: { tracks: [] } }));
                const related = (relatedTopTracks.body.tracks || []).slice(0, Math.ceil(limit * 0.25));
                allTracks.push(...related);
            }

            // Remove duplicates and limit
            const seen = new Set();
            const uniqueTracks = allTracks.filter(track => {
                if (seen.has(track.id) || track.id === seedTrackId) return false;
                seen.add(track.id);
                return true;
            }).slice(0, limit);

            // Format tracks
            const tracks = uniqueTracks.map(track => ({
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                albumArt: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                previewUrl: track.preview_url,
                spotifyUrl: track.external_urls.spotify
            }));

            // Cache track metadata
            tracks.forEach(track => {
                cache.setTrack(track.id, track);
            });

            // Cache recommendations for 1 hour
            cache.setGeneric(cacheKey, tracks, 60 * 60 * 1000);

            return tracks;
        } catch (error) {
            console.error('[Spotify] Recommendations error:', error.message);
            throw new Error('Failed to get recommendations');
        }
    }

    async getNewReleases(userHistory = [], limit = 20) {
        // Check cache first (1 hour TTL)
        const cacheKey = 'new-releases';
        const cached = cache.getGeneric(cacheKey);
        if (cached) {
            console.log('[Spotify] Cache hit for new releases');
            return cached;
        }

        await this.ensureAuth();

        try {
            // Get global new releases
            const newReleasesResult = await this.withRetry(() => this.spotify.getNewReleases({ limit: 50 }));
            const allAlbums = newReleasesResult.body.albums.items;

            let finalTracks = [];

            // If user has history, personalize recommendations
            if (userHistory && userHistory.length > 0) {
                // Get tracks from all new albums in CHUNKS to avoid network congestion
                const allAlbumsToFetch = allAlbums.slice(0, 20);
                const chunkSize = 5;
                let allTracks = [];

                for (let i = 0; i < allAlbumsToFetch.length; i += chunkSize) {
                    const chunk = allAlbumsToFetch.slice(i, i + chunkSize);
                    const chunkPromises = chunk.map(album =>
                        this.withRetry(() => this.spotify.getAlbumTracks(album.id, { limit: 3 }))
                            .then(res => res.body.items.map(track => ({
                                ...track,
                                album: {
                                    name: album.name,
                                    images: album.images
                                },
                                artists: album.artists
                            })))
                            .catch(err => {
                                console.warn(`[Spotify] Failed to fetch tracks for album ${album.name}: ${err.message}`);
                                return [];
                            })
                    );

                    const chunkResults = await Promise.all(chunkPromises);
                    allTracks.push(...chunkResults.flat());

                    // Small delay between chunks to be nice
                    if (i + chunkSize < allAlbumsToFetch.length) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }

                // Shuffle and limit
                finalTracks = allTracks
                    .sort(() => Math.random() - 0.5)
                    .slice(0, limit);
            } else {
                // No history - return popular new releases
                const allAlbumsToFetch = allAlbums.slice(0, 10);
                const chunkPromises = allAlbumsToFetch.map(album =>
                    this.withRetry(() => this.spotify.getAlbumTracks(album.id, { limit: 2 }))
                        .then(res => res.body.items.map(track => ({
                            ...track,
                            album: {
                                name: album.name,
                                images: album.images
                            },
                            artists: album.artists
                        })))
                        .catch(() => [])
                );

                const tracksArrays = await Promise.all(chunkPromises);
                finalTracks = tracksArrays.flat().slice(0, limit);
            }

            // Format tracks
            const tracks = finalTracks.map(track => ({
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                artists: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                albumArt: track.album.images[0]?.url || null,
                duration: track.duration_ms,
                previewUrl: track.preview_url,
                spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
            }));

            // Cache track metadata
            tracks.forEach(track => {
                cache.setTrack(track.id, track);
            });

            // Cache new releases for 1 hour
            cache.setGeneric(cacheKey, tracks, 60 * 60 * 1000);

            return tracks;
        } catch (error) {
            console.error('[Spotify] New releases error:', error.message);
            // Return empty array on error
            return [];
        }
    }

    async getPlaylist(playlistId) {
        await this.ensureAuth();

        try {
            // Fetch playlist info and first 100 tracks
            const result = await this.withRetry(() => this.spotify.getPlaylist(playlistId)); // default limit is usually 100
            let allItems = result.body.tracks.items;
            const total = result.body.tracks.total;

            // Pagination: Fetch next 100 tracks (Limit 200 total)
            if (total > 100) {
                const extra = await this.withRetry(() => this.spotify.getPlaylistTracks(playlistId, {
                    offset: 100,
                    limit: 100
                }));
                if (extra.body.items.length > 0) {
                    allItems = allItems.concat(extra.body.items);
                }
            }

            const tracks = allItems
                .filter(item => item.track) // Filter null tracks
                .map(item => {
                    const track = item.track;
                    // ... existing mapping logic ...
                    return {
                        id: track.id,
                        name: track.name,
                        artist: track.artists[0].name,
                        artists: track.artists.map(a => a.name).join(', '),
                        album: track.album.name,
                        albumArt: track.album.images[0]?.url || null,
                        duration: track.duration_ms,
                        previewUrl: track.preview_url,
                        spotifyUrl: track.external_urls.spotify
                    };
                });

            // Cache track metadata
            tracks.forEach(track => {
                cache.setTrack(track.id, track);
            });

            return {
                id: result.body.id,
                name: result.body.name,
                description: result.body.description,
                image: result.body.images[0]?.url,
                tracks
            };
        } catch (error) {
            console.error('[Spotify] Get playlist error:', error.message);
            throw new Error('Failed to get playlist');
        }
    }
}

export default new SpotifyService();
