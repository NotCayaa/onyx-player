<script>
  import { api } from "../api.js";
  import { toast } from "../stores/toast.js";

  export let onAdd = (track) => {};
  export let onPlay = (track) => {};

  let query = "";
  let results = [];
  let isSearching = false;
  let searchTimeout;
  let activeTab = "spotify";

  let searchMode = "track"; // 'track' | 'playlist'

  // Import options modal
  let showImportModal = false;
  let importedPlaylistData = null;
  let isImportLoading = false;

  async function search() {
    if (!query.trim()) {
      results = [];
      return;
    }

    isSearching = true;
    console.log(`Searching ${activeTab} (${searchMode}) for: "${query}"`);

    try {
      if (activeTab === "spotify") {
        if (searchMode === "playlist") {
          // Extract ID from URL: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
          const match = query.match(/playlist\/([a-zA-Z0-9]+)/);
          if (match) {
            const playlistId = match[1];
            toast.info("Importing Spotify Playlist...");
            const data = await api.getSpotifyPlaylist(playlistId);
            if (data.error) {
              toast.error("Failed to load playlist: " + data.error);
              results = [];
            } else {
              results = data.tracks || [];
              toast.success(
                `Loaded ${results.length} tracks from "${data.name}"`,
              );
            }
          } else {
            toast.error("Invalid Spotify Playlist URL");
            results = [];
          }
        } else {
          // Track Search
          const data = await api.searchTracks(query);
          console.log("Search results:", data); // Debug Log
          if (data.error) {
            toast.error("Search failed: " + data.error);
            results = [];
          } else {
            results = data.tracks || [];
          }
        }
      } else {
        // YouTube Search
        const data = await api.searchYouTube(query);
        if (data.error) {
          toast.error("YouTube search failed: " + data.error);
        }
        results = (data.videos || []).map((video) => ({
          id: video.id,
          name: video.title,
          artist: video.channel,
          album: "",
          albumArt: video.thumbnail,
          duration: video.duration,
          isYouTube: true,
          youtubeUrl: video.url,
        }));
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Search error: " + error.message);
      results = [];
    } finally {
      isSearching = false;
    }
  }

  // ... (rest of code)

  async function importSpotifyPlaylist() {
    if (!playlistUrl.trim()) return;

    // Extract ID: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) {
      toast.error("Invalid Spotify playlist URL");
      return;
    }

    // Show modal immediately with loading state
    showImportModal = true;
    isImportLoading = true;
    importedPlaylistData = null;

    const playlistId = match[1];

    try {
      const data = await api.getSpotifyPlaylist(playlistId);
      if (data.error) {
        toast.error(data.error);
        showImportModal = false;
      } else {
        // Data loaded, show options
        importedPlaylistData = data;
        playlistUrl = ""; // Clear input
      }
    } catch (err) {
      console.error("Failed to import Spotify playlist", err);
      toast.error("Import failed: " + err.message);
      showImportModal = false;
    } finally {
      isImportLoading = false;
    }
  }

  async function handlePlayNow() {
    if (!importedPlaylistData) return;
    const tracks = importedPlaylistData.tracks || [];
    results = tracks;
    tracks.forEach((track) => onAdd(track));
    toast.success(
      `Added ${tracks.length} tracks from "${importedPlaylistData.name}" to queue!`,
    );
    showImportModal = false;
    importedPlaylistData = null;
  }

  async function handleSavePlaylist() {
    if (!importedPlaylistData) return;
    try {
      const newPlaylist = await api.createPlaylist(importedPlaylistData.name);
      // Add all tracks to the new playlist
      for (const track of importedPlaylistData.tracks) {
        await api.addTrackToPlaylist(newPlaylist.id, track);
      }
      toast.success(
        `Saved "${importedPlaylistData.name}" with ${importedPlaylistData.tracks.length} tracks!`,
      );
      showImportModal = false;
      importedPlaylistData = null;
    } catch (err) {
      console.error("Failed to save playlist", err);
      toast.error("Failed to save playlist: " + err.message);
    }
  }

  function closeImportModal() {
    showImportModal = false;
    importedPlaylistData = null;
  }

  async function importPlaylist() {
    if (!playlistUrl.trim()) return;

    // Extract ID from YouTube URL
    const match = playlistUrl.match(/[?&]list=([^&]+)/);
    if (!match) {
      toast.error("Invalid YouTube playlist URL");
      return;
    }

    // Show modal immediately with loading state
    showImportModal = true;
    isImportLoading = true;
    importedPlaylistData = null;

    const playlistId = match[1];

    try {
      const data = await api.getYouTubePlaylist(playlistId);
      if (data.error) {
        toast.error(data.error);
        showImportModal = false;
      } else {
        // Data loaded, show options
        // Transform YouTube videos to track format
        const tracks = (data.videos || []).map((video) => ({
          id: video.id,
          name: video.title,
          artists: video.channel || "Unknown",
          artist: video.channel || "Unknown",
          album: "",
          albumArt: video.thumbnail || "",
          duration: video.duration,
          isYouTube: true,
          youtubeUrl: video.url,
        }));

        importedPlaylistData = {
          name: data.title || "YouTube Playlist",
          tracks: tracks,
        };
        playlistUrl = ""; // Clear input
      }
    } catch (err) {
      console.error("Failed to import YouTube playlist", err);
      toast.error("Failed to import playlist: " + err.message);
      showImportModal = false;
    } finally {
      isImportLoading = false;
    }
  }

  // ...

  async function saveToPlaylist(playlistId) {
    if (!trackToSave) return;
    try {
      await api.addTrackToPlaylist(playlistId, trackToSave);
      showPlaylistModal = false;
      toast.success("Saved to playlist!");
    } catch (err) {
      console.error("Failed to save to playlist", err);
      toast.error("Failed to save.");
    }
  }

  function handleInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(search, 300);
  }

  function addTrack(track) {
    onAdd(track);
  }

  function switchTab(tab) {
    activeTab = tab;
    results = [];
    query = "";
  }

  let playlistUrl = "";
  let isLoadingPlaylist = false;
  let showPlaylistModal = false;
  let trackToSave = null;
  let playlists = [];

  async function openPlaylistModal(track) {
    trackToSave = track;
    try {
      playlists = await api.getPlaylists();
      // Filter out 'link' types if we only want to save to local playlists
      playlists = playlists.filter((p) => p.type !== "link");
      showPlaylistModal = true;
    } catch (err) {
      console.error("Failed to load playlists", err);
    }
  }

  function closePlaylistModal() {
    showPlaylistModal = false;
    trackToSave = null;
  }
</script>

<div class="search">
  <h3 class="search-header">Search</h3>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === "spotify"}
      onclick={() => switchTab("spotify")}
    >
      Spotify
    </button>
    <button
      class="tab"
      class:active={activeTab === "youtube"}
      onclick={() => switchTab("youtube")}
    >
      YouTube
    </button>
  </div>

  <div class="search-input-container">
    <input
      type="text"
      bind:value={query}
      oninput={handleInput}
      placeholder={activeTab === "spotify"
        ? "Search Spotify Songs..."
        : "Search YouTube Videos..."}
      class="search-input"
    />
    {#if isSearching}
      <div class="spinner-wrapper">
        <div class="spinner"></div>
      </div>
    {/if}
  </div>

  {#if activeTab === "spotify"}
    <div class="playlist-import">
      <input
        type="text"
        bind:value={playlistUrl}
        placeholder="Paste Spotify Playlist URL..."
        class="search-input"
      />
      <button
        class="btn-secondary"
        onclick={importSpotifyPlaylist}
        disabled={isLoadingPlaylist || !playlistUrl.trim()}
      >
        {isLoadingPlaylist ? "Importing..." : "Import Playlist"}
      </button>
    </div>
  {/if}

  {#if activeTab === "youtube"}
    <div class="playlist-import">
      <input
        type="text"
        bind:value={playlistUrl}
        placeholder="Paste YouTube playlist URL..."
        class="search-input"
      />
      <button
        class="btn-secondary"
        onclick={importPlaylist}
        disabled={isLoadingPlaylist || !playlistUrl.trim()}
      >
        {isLoadingPlaylist ? "Importing..." : "Import Playlist"}
      </button>
    </div>
  {/if}

  {#if showPlaylistModal}
    <div
      class="modal-overlay"
      role="button"
      tabindex="0"
      onclick={closePlaylistModal}
      onkeydown={(e) => e.key === "Escape" && closePlaylistModal()}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        tabindex="-1"
      >
        <h3>Save to Playlist</h3>
        <div class="modal-list">
          {#if playlists.length === 0}
            <p>No local playlists found.</p>
          {:else}
            {#each playlists as playlist}
              <button
                class="modal-item"
                onclick={() => saveToPlaylist(playlist.id)}
              >
                {playlist.name} ({playlist.tracks.length} tracks)
              </button>
            {/each}
          {/if}
        </div>
        <button class="btn-cancel" onclick={closePlaylistModal}>Cancel</button>
      </div>
    </div>
  {/if}

  <div class="results">
    {#if results.length > 0}
      {#each results as track}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="track-item" onclick={() => onPlay(track)}>
          <img src={track.albumArt} alt={track.name} class="track-thumb" />
          <div class="track-info">
            <div class="track-name">{track.name}</div>
            <div class="track-artist">{track.artists}</div>
          </div>
          <div class="track-actions">
            <button
              class="btn-icon add-btn"
              onclick={(e) => {
                e.stopPropagation();
                onAdd(track);
              }}
              title="Add to Queue"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
            <button
              class="btn-icon add-btn"
              onclick={(e) => {
                e.stopPropagation();
                openPlaylistModal(track);
              }}
              title="Save to Playlist"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    {:else if query && !isSearching}
      <p class="no-results">No results found</p>
    {/if}
  </div>
</div>

{#if showImportModal}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    onclick={closeImportModal}
    onkeydown={(e) => e.key === "Escape" && closeImportModal()}
  >
    <div
      class="modal import-modal"
      role="dialog"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      tabindex="-1"
    >
      <h3>Import Playlist</h3>
      {#if isImportLoading}
        <div class="modal-loading">
          <div class="spinner"></div>
          <p>Loading playlist...</p>
        </div>
      {:else}
        <p class="modal-playlist-info">
          "{importedPlaylistData?.name}" - {importedPlaylistData?.tracks
            ?.length || 0} tracks
        </p>
        <p class="modal-description">Choose what to do to this playlist:</p>
        <div class="modal-actions">
          <button class="btn-action btn-play" onclick={handlePlayNow}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play Now
          </button>
          <button class="btn-action btn-save" onclick={handleSavePlaylist}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
              />
            </svg>
            Save Playlist
          </button>
        </div>
        <button class="btn-cancel" onclick={closeImportModal}>Cancel</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    height: 100%;
    overflow: hidden;
  }

  .search-header {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .tabs {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
    background: var(--bg-tertiary);
    padding: 4px;
    border-radius: var(--radius-md);
  }

  .tab {
    flex: 1;
    padding: var(--spacing-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .tab.active {
    background: var(--bg-secondary);
    color: var(--text-primary);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .search-input-container {
    position: relative;
    -webkit-app-region: no-drag;
  }

  .search-input {
    width: 100%;
    font-size: 1rem;
    -webkit-app-region: no-drag; /* Double safety */
  }

  .search-input-container .spinner-wrapper {
    position: absolute;
    right: var(--spacing-md);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none; /* Let clicks pass through */
  }

  /* Empty rule removed */

  .results {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
    /* Button Reset */
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
    font-family: inherit;
    color: inherit;
    -webkit-app-region: no-drag; /* Ensure unclickable in drag zones */
    position: relative; /* Context for absolute actions */
    /* overflow: hidden; Removed to prevent clipping issues */
  }

  /* ... existing hover rule ... */

  .track-item:hover {
    background: var(--bg-hover);
  }

  .track-thumb {
    width: 48px;
    height: 48px;
    min-width: 48px; /* Prevent shrink */
    min-height: 48px; /* Prevent shrink */
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0; /* Critical for flex containers */
  }

  .track-info {
    flex: 1;
    min-width: 0;
  }

  .track-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-artist {
    font-size: 0.875rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-actions {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 2px; /* Very tight gap */
    padding: 0 8px;
    background: linear-gradient(
      to right,
      transparent,
      var(--bg-hover) 10%,
      var(--bg-hover) 100%
    ); /* Stronger gradient */
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none; /* Ignore clicks when hidden */
    z-index: 10;
  }

  .track-item:hover .track-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .add-btn {
    opacity: 0;
    transition: opacity var(--transition-fast);
    padding: 4px; /* Reduced padding */
    border-radius: 50%; /* Circle look */
    display: flex; /* Center SVG */
    align-items: center;
    justify-content: center;
  }

  .add-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--accent);
  }

  .track-item:hover .add-btn {
    opacity: 1;
  }

  .no-results {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-secondary);
  }

  .playlist-import {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    margin-top: var(--spacing-sm);
  }

  .playlist-import button {
    white-space: nowrap;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    background: var(--bg-secondary);
    padding: var(--spacing-lg);
    border-radius: var(--radius-lg);
    width: 300px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .modal h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .modal-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    overflow-y: auto;
  }

  .modal-item {
    background: var(--bg-tertiary);
    border: none;
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
  }

  .modal-item:hover {
    background: var(--accent-primary);
    color: white;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--text-secondary);
    color: var(--text-secondary);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
  }

  .btn-cancel:hover {
    border-color: var(--text-primary);
    color: var(--text-primary);
  }

  /* Modal Base Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: var(--bg-secondary);
    width: 90%;
    max-width: 400px;
    padding: var(--spacing-lg);
    border-radius: var(--radius-lg);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
  }

  .modal h3 {
    margin: 0 0 var(--spacing-md) 0;
  }

  /* Import Options Modal */
  .import-modal {
    max-width: 450px;
  }

  .modal-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    gap: var(--spacing-md);
  }

  .modal-loading p {
    color: var(--text-secondary);
    margin: 0;
  }

  .modal-playlist-info {
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--text-primary);
    margin: var(--spacing-md) 0;
    text-align: center;
  }

  .modal-description {
    color: var(--text-secondary);
    margin-bottom: var(--spacing-lg);
    text-align: center;
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  .btn-action {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-lg);
    border: 2px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 1rem;
    font-weight: 500;
  }

  .btn-action:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .btn-play:hover {
    border-color: var(--accent);
    background: linear-gradient(
      135deg,
      var(--bg-tertiary),
      rgba(var(--accent-rgb), 0.1)
    );
  }

  .btn-save:hover {
    border-color: #4caf50;
    background: linear-gradient(
      135deg,
      var(--bg-tertiary),
      rgba(76, 175, 80, 0.1)
    );
  }

  .btn-action svg {
    opacity: 0.8;
  }
</style>
