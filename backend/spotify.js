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
                this.accessToken = data.body.access_token; // Store for direct fetch
                this.tokenExpiresAt = Date.now() + (data.body.expires_in * 1000) - 60000; // Refresh 1min before expiry
                console.log('[Spotify] Access token refreshed');
            });
        } catch (error) {
            console.error('[Spotify] Auth error after retries:', error.message);
            throw new Error('Failed to authenticate with Spotify');
        }
    }

    // Direct fetch to Spotify API - bypasses library for debugging
    async getRecommendationsDirect(seedTrackId, seedArtistId, limit = 10) {
        await this.ensureAuth();

        const params = new URLSearchParams({
            seed_tracks: seedTrackId,
            seed_artists: seedArtistId,
            limit: limit.toString(),
            market: 'US'
        });

        const url = `https://api.spotify.com/v1/recommendations?${params.toString()}`;
        console.log(`[Spotify Recs] Direct fetch URL: ${url}`);

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            console.log(`[Spotify Recs] Response status: ${response.status} ${response.statusText}`);

            // Get raw text first to see what we're getting
            const text = await response.text();

            if (!text || text.length === 0) {
                console.error('[Spotify Recs] Empty response body');
                return { tracks: [] };
            }

            if (!response.ok) {
                console.error('[Spotify Recs] Error response:', text);
                return { tracks: [] };
            }

            const data = JSON.parse(text);
            console.log(`[Spotify Recs] Direct fetch returned ${data.tracks?.length || 0} tracks`);
            return data;
        } catch (err) {
            console.error('[Spotify Recs] Direct fetch failed:', err.message);
            return { tracks: [] };
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
        // Check cache first (30 min TTL - shorter to allow variety)
        const cacheKey = `recommendations:v3:${seedTrackId}:${limit}`;
        const cached = cache.getGeneric(cacheKey);
        if (cached) {
            console.log(`[Spotify] Cache hit for recommendations ${seedTrackId}`);
            return cached;
        }

        await this.ensureAuth();

        try {
            // Get full track info from Spotify API to get artists array with IDs
            const trackResult = await this.withRetry(() => this.spotify.getTrack(seedTrackId));
            const artistId = trackResult.body.artists[0].id;
            const artistName = trackResult.body.artists[0].name;
            console.log(`[Spotify Recs] Seed track: "${trackResult.body.name}" by "${artistName}"`);

            // Just get artist's top tracks - simple and works
            const artistTopTracks = await this.withRetry(() =>
                this.spotify.getArtistTopTracks(artistId, 'US')
            );

            // Filter out seed track and limit
            const topTracks = (artistTopTracks.body.tracks || [])
                .filter(t => t.id !== seedTrackId)
                .slice(0, limit);

            console.log(`[Spotify Recs] Got ${topTracks.length} tracks from artist "${artistName}"`);

            // Format tracks
            const tracks = topTracks.map(track => ({
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

            // Cache recommendations for 30 min
            cache.setGeneric(cacheKey, tracks, 30 * 60 * 1000);

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
