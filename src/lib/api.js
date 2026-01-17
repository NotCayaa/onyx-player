const API_BASE = 'http://localhost:3000';

export const api = {
    async searchTracks(query, limit = 20) {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        return res.json();
    },

    async getTrack(trackId) {
        const res = await fetch(`${API_BASE}/track/${trackId}`);
        return res.json();
    },

    async getRecommendations(trackId, options = 30) {
        let limit = 30;
        let isYouTube = false;
        let name = '';
        let artist = '';

        if (typeof options === 'object') {
            limit = options.limit || 30;
            isYouTube = options.isYouTube || false;
            name = options.name || '';
            artist = options.artist || '';
        } else {
            limit = options;
        }

        const queryParams = new URLSearchParams({
            limit,
            isYouTube,
            name: name || '',
            artist: artist || ''
        });

        const res = await fetch(`${API_BASE}/recommendations/${trackId}?${queryParams.toString()}`);
        return res.json();
    },

    async getNewReleases(limit = 20, history = []) {
        const historyParam = history.length > 0 ? `&history=${encodeURIComponent(JSON.stringify(history))}` : '';
        const res = await fetch(`${API_BASE}/new-releases?limit=${limit}${historyParam}`);
        return res.json();
    },

    async getStreamUrl(trackId, trackMetadata = null) {
        const payload = { trackId };

        // If it's a YouTube track, include metadata to skip Spotify lookup
        if (trackMetadata?.isYouTube) {
            payload.isYouTube = true;
            payload.track = trackMetadata;
        }

        const res = await fetch(`${API_BASE}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.json();
    },

    async prefetchTracks(tracks) {
        const res = await fetch(`${API_BASE}/prefetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks })
        });
        return res.json();
    },

    async searchYouTube(query, limit = 10) {
        const res = await fetch(`${API_BASE}/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        return res.json();
    },

    async getYouTubePlaylist(playlistId) {
        const res = await fetch(`${API_BASE}/youtube/playlist/${playlistId}`);
        return res.json();
    },

    async clearCache() {
        const res = await fetch(`${API_BASE}/cache/clear`, { method: 'POST' });
        return res.json();
    },

    // Playlist Methods
    async getPlaylists() {
        const res = await fetch(`${API_BASE}/playlists`);
        return res.json();
    },

    async createPlaylist(name, type = 'local', url = '') {
        const res = await fetch(`${API_BASE}/playlists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, url })
        });
        return res.json();
    },

    async deletePlaylist(id) {
        const res = await fetch(`${API_BASE}/playlists/${id}`, { method: 'DELETE' });
        return res.json();
    },

    async addTrackToPlaylist(playlistId, track) {
        const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track })
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to add track');
        }

        return res.json();
    },

    async removeTrackFromPlaylist(playlistId, index) {
        const res = await fetch(`${API_BASE}/playlists/${playlistId}/tracks/${index}`, { method: 'DELETE' });
        return res.json();
    },

    async reorderPlaylist(playlistId, fromIndex, toIndex) {
        const res = await fetch(`${API_BASE}/playlists/${playlistId}/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromIndex, toIndex })
        });
        return res.json();
    },

    async updatePlaylist(playlistId, updates) {
        const res = await fetch(
            `${API_BASE}/playlists/${playlistId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            },
        );
        return res.json();
    },

    async uploadPlaylistCover(playlistId, formData) {
        const res = await fetch(`${API_BASE}/playlists/${playlistId}/cover`, {
            method: 'POST',
            body: formData // FormData sends multipart/form-data automatically
        });
        return res.json();
    },

    async getSpotifyPlaylist(playlistId) {
        const res = await fetch(`${API_BASE}/spotify/playlist/${playlistId}`);
        return res.json();
    },

    async clearCache() {
        const res = await fetch(`${API_BASE}/cache/clear`, {
            method: 'POST'
        });
        return res.json();
    }
};
