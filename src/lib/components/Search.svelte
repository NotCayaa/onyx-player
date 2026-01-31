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

<div class="flex flex-col gap-3 p-4">
  <!-- Tabs -->
  <div class="flex gap-1 p-1 bg-[var(--bg-tertiary)] rounded-xl">
    <button
      class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all
             {activeTab === 'spotify'
        ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
      onclick={() => switchTab("spotify")}
    >
      Spotify
    </button>
    <button
      class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all
             {activeTab === 'youtube'
        ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
      onclick={() => switchTab("youtube")}
    >
      YouTube
    </button>
  </div>

  <!-- Search Input -->
  <div class="relative">
    <input
      type="text"
      bind:value={query}
      oninput={handleInput}
      placeholder={activeTab === "spotify"
        ? "Search songs..."
        : "Search videos..."}
      class="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
    />
    {#if isSearching}
      <div class="absolute right-4 top-1/2 -translate-y-1/2">
        <div
          class="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin"
        ></div>
      </div>
    {/if}
  </div>

  <!-- Playlist Import -->
  <div class="flex gap-2">
    <input
      type="text"
      bind:value={playlistUrl}
      placeholder={activeTab === "spotify"
        ? "Spotify playlist URL..."
        : "YouTube playlist URL..."}
      class="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-white/20 transition-colors"
    />
    <button
      class="px-4 py-2.5 bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white text-black text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
      onclick={activeTab === "spotify" ? importSpotifyPlaylist : importPlaylist}
      disabled={isLoadingPlaylist || !playlistUrl.trim()}
    >
      {isLoadingPlaylist ? "..." : "Import"}
    </button>
  </div>

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

  <div
    class="flex flex-col gap-1 mt-2 max-h-[200px] overflow-y-auto scrollbar-hide"
  >
    {#if results.length > 0}
      {#each results as track}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group"
          onclick={() => onPlay(track)}
        >
          <img
            src={track.albumArt}
            alt={track.name}
            class="w-10 h-10 rounded-lg object-cover"
          />
          <div class="flex-1 min-w-0">
            <div class="text-white text-sm truncate">{track.name}</div>
            <div class="text-neutral-400 text-xs truncate">{track.artists}</div>
          </div>
          <div
            class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              class="p-1.5 rounded-lg hover:bg-[var(--bg-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              onclick={(e) => {
                e.stopPropagation();
                onAdd(track);
              }}
              title="Add to Queue"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
            <button
              class="p-1.5 rounded-lg hover:bg-[var(--bg-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              onclick={(e) => {
                e.stopPropagation();
                openPlaylistModal(track);
              }}
              title="Save to Playlist"
            >
              <svg
                width="14"
                height="14"
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
      <p class="text-neutral-500 text-sm text-center py-4">No results found</p>
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
