<script>
    import { onMount, onDestroy } from "svelte";
    import { api } from "./lib/api.js";
    import { toast } from "./lib/stores/toast.js";
    import Player from "./lib/components/Player.svelte";
    import Home from "./lib/components/Home.svelte";
    import Search from "./lib/components/Search.svelte";
    import Queue from "./lib/components/Queue.svelte";
    import Lyrics from "./lib/components/Lyrics.svelte";
    import PlaylistSidebar from "./lib/components/PlaylistSidebar.svelte";
    import SettingsModal from "./lib/components/SettingsModal.svelte";
    import WelcomeModal from "./lib/components/WelcomeModal.svelte";
    import PlaylistModal from "./lib/components/PlaylistModal.svelte";
    import Toast from "./lib/components/Toast.svelte";

    let queue = [];
    let currentIndex = 0;
    let currentTrack = null;
    let playerComponent;
    let currentTime = 0; // For lyrics sync
    let analyser = null; // AudioContext analyser for visualizer

    let activeTab = "home"; // 'home' or 'playlists'

    // Settings and modals state
    let showSettings = false;
    let showSearch = false; // Search view toggle in left panel
    let visualizerEnabled = false;
    let theme = "dark";
    let compactMode = false;
    let audioQuality = "normal";

    // Welcome modal state
    let showWelcome = false;
    let allPlaylists = [];

    // Playlist modal state
    let showPlaylistModal = false;
    let selectedPlaylist = null;

    // Listening history
    let listeningHistory = [];

    // Auto-queue recommendations state
    let autoQueueTrackIds = []; // Track IDs that were auto-added
    let autoQueueFetching = false; // Prevent concurrent fetches
    let lastAutoQueueBaseTrack = null; // Track that recommendations are based on

    // Load settings and check welcome modal
    onMount(async () => {
        // Load all settings from localStorage
        const saved = localStorage.getItem("visualizerEnabled");
        if (saved !== null) {
            visualizerEnabled = saved === "true";
        }

        const savedTheme = localStorage.getItem("theme");
        if (savedTheme) {
            theme = savedTheme;
            document.documentElement.setAttribute("data-theme", theme);

            // Sync with Electron window frame
            try {
                const { ipcRenderer } = window.require("electron");
                ipcRenderer.invoke("set-theme", theme);
            } catch (e) {
                console.warn("Electron IPC not available");
            }
        }

        const savedCompact = localStorage.getItem("compactMode");
        if (savedCompact) {
            compactMode = savedCompact === "true";
            document.documentElement.classList.toggle("compact", compactMode);
        }

        const savedQuality = localStorage.getItem("audioQuality");
        if (savedQuality) {
            audioQuality = savedQuality;
        }

        // Load listening history
        const savedHistory = localStorage.getItem("listeningHistory");
        if (savedHistory) {
            try {
                listeningHistory = JSON.parse(savedHistory);
            } catch (err) {
                console.error("Failed to parse history", err);
                listeningHistory = [];
            }
        }

        // Load playlists for welcome modal
        try {
            allPlaylists = await api.getPlaylists();
        } catch (err) {
            console.error("Failed to load playlists", err);
        }

        // Check if welcome modal should show
        const hideWelcome = localStorage.getItem("hideWelcome");
        if (hideWelcome !== "true") {
            showWelcome = true;
        }
    });

    // Enable AudioContext when visualizer is turned on
    $: if (visualizerEnabled && playerComponent) {
        playerComponent.enableVisualizer();
    }

    onDestroy(() => {
        // No GridStack destruction needed
    });

    function handlePlaylistSelect(event) {
        const playlist = event.detail;
        if (playlist.type === "link") {
            toast.info("External playlist loading coming soon!");
        } else if (playlist.tracks && playlist.tracks.length > 0) {
            queue = [...playlist.tracks];
            playTrack(0);
        } else {
            toast.info("This playlist is empty.");
        }
    }

    function addToQueue(track) {
        // Prevent duplicates (check both manual and auto-added)
        const exists = queue.some((t) => t.id === track.id);
        if (exists) {
            toast.info("Track already in queue");
            return;
        }

        // Clear auto-recommendations when manually adding
        clearAutoRecommendations();

        queue = [...queue, track];

        // Auto-play if queue was empty
        if (queue.length === 1) {
            playTrack(0);
        } else {
            toast.success("Added to queue");
            // Refresh recommendations based on the newly added track
            fetchAutoRecommendations(track);
        }
    }

    function saveToHistory(track) {
        if (!track) return;

        // Create history entry
        const historyEntry = {
            id: track.id,
            name: track.name,
            artists: track.artists,
            albumArt: track.albumArt,
            playedAt: new Date().toISOString(),
            isYouTube: track.isYouTube,
            youtubeUrl: track.youtubeUrl,
            duration: track.duration,
        };

        // Remove duplicates (same track ID)
        listeningHistory = listeningHistory.filter((t) => t.id !== track.id);

        // Add to beginning
        listeningHistory = [historyEntry, ...listeningHistory];

        // Limit to 50 tracks
        if (listeningHistory.length > 50) {
            listeningHistory = listeningHistory.slice(0, 50);
        }

        // Save to localStorage
        localStorage.setItem(
            "listeningHistory",
            JSON.stringify(listeningHistory),
        );
    }

    function playTrack(index, isFromQueueClick = false) {
        if (index >= 0 && index < queue.length) {
            const previousIndex = currentIndex;
            currentIndex = index;
            currentTrack = queue[index];
            saveToHistory(currentTrack);

            // Add more recommendations when changing tracks
            // (unless it's the same track as before)
            if (previousIndex !== index) {
                console.log(
                    "[AutoQueue] Track changed, adding recommendations for:",
                    currentTrack.name,
                );
                // Reset lastAutoQueueBaseTrack to allow fetching new recommendations
                lastAutoQueueBaseTrack = null;
                fetchAutoRecommendations(currentTrack);
            }
        }
    }

    function removeFromQueue(index) {
        queue = queue.filter((_, i) => i !== index);

        // Adjust current index if needed
        if (index < currentIndex) {
            currentIndex--;
        } else if (index === currentIndex) {
            if (queue.length > 0) {
                currentIndex = Math.min(currentIndex, queue.length - 1);
                currentTrack = queue[currentIndex];
            } else {
                currentTrack = null;
                currentIndex = 0;
            }
        }
    }

    function clearQueue() {
        queue = [];
        currentTrack = null;
        currentIndex = 0;
        // Also clear auto-queue tracking
        autoQueueTrackIds = [];
        lastAutoQueueBaseTrack = null;
    }

    function handleTrackEnd() {
        // Auto-play next track
        handleNext();
    }

    function handleNext() {
        if (currentIndex < queue.length - 1) {
            playTrack(currentIndex + 1);
        }
    }

    function handlePrevious() {
        if (currentIndex > 0) {
            playTrack(currentIndex - 1);
        }
    }

    // Save-to-playlist modal (from Queue)
    let showSaveToPlaylistModal = false;
    let trackToSave = null;
    let playlists = [];

    async function openPlaylistModal(track) {
        trackToSave = track;
        try {
            playlists = await api.getPlaylists();
            playlists = playlists.filter((p) => p.type !== "link");
            showSaveToPlaylistModal = true;
        } catch (err) {
            console.error("Failed to load playlists", err);
            toast.error("Failed to load playlists");
        }
    }

    async function saveToPlaylist(playlistId) {
        if (!trackToSave) return;
        try {
            await api.addTrackToPlaylist(playlistId, trackToSave);
            showSaveToPlaylistModal = false;
            toast.success("Saved to playlist!");
        } catch (err) {
            console.error("Failed to save to playlist", err);
            toast.error(err.message || "Failed to save.");
        }
    }

    function closePlaylistModal2() {
        showSaveToPlaylistModal = false;
        trackToSave = null;
    }

    function openSettings() {
        showSettings = true;
    }

    function closeSettings() {
        showSettings = false;
    }

    function clearListeningHistory() {
        listeningHistory = [];
        localStorage.removeItem("listeningHistory");
    }

    // Auto-queue recommendation functions
    async function fetchAutoRecommendations(baseTrack) {
        if (!baseTrack || autoQueueFetching) return;
        if (lastAutoQueueBaseTrack?.id === baseTrack.id) return; // Already fetched for this track

        autoQueueFetching = true;
        lastAutoQueueBaseTrack = baseTrack;

        try {
            console.log(
                "[AutoQueue] Fetching recommendations for:",
                baseTrack.name,
                baseTrack.isYouTube ? "(YouTube)" : "(Spotify)",
            );

            let result;

            // If YouTube track, use YouTube recommendations
            if (baseTrack.isYouTube) {
                result = await api.getRecommendations(baseTrack.id, {
                    limit: 30,
                    isYouTube: true,
                    name: baseTrack.name,
                    artist: baseTrack.artist || baseTrack.artists,
                });
            } else {
                // Spotify tracks use artist top tracks (simplified, working)
                result = await api.getRecommendations(baseTrack.id);
            }

            if (result.tracks && result.tracks.length > 0) {
                // Filter out tracks already in queue (including current track)
                const existingIds = new Set(queue.map((t) => t.id));
                const newTracks = result.tracks
                    .filter((t) => !existingIds.has(t.id))
                    .slice(0, 10);

                if (newTracks.length > 0) {
                    // Mark these as auto-added
                    const newIds = newTracks.map((t) => t.id);
                    autoQueueTrackIds = [...autoQueueTrackIds, ...newIds];

                    // Add to queue
                    queue = [...queue, ...newTracks];
                    console.log(
                        "[AutoQueue] Added",
                        newTracks.length,
                        "recommendations",
                    );
                }
            }
        } catch (err) {
            console.error("[AutoQueue] Failed to fetch recommendations:", err);
        } finally {
            autoQueueFetching = false;
        }
    }

    // Atomic refresh: fetch new recommendations first, then replace old ones
    async function refreshAutoRecommendations(baseTrack) {
        if (!baseTrack || autoQueueFetching) return;

        autoQueueFetching = true;

        try {
            console.log(
                "[AutoQueue] Refreshing recommendations for:",
                baseTrack.name,
                baseTrack.isYouTube ? "(YouTube)" : "(Spotify)",
            );

            let result;

            // If YouTube track, use YouTube recommendations
            if (baseTrack.isYouTube) {
                result = await api.getRecommendations(baseTrack.id, {
                    limit: 30,
                    isYouTube: true,
                    name: baseTrack.name,
                    artist: baseTrack.artist || baseTrack.artists,
                });
            } else {
                // Spotify tracks use artist top tracks (simplified, working)
                result = await api.getRecommendations(baseTrack.id);
            }

            if (result.tracks && result.tracks.length > 0) {
                // Get manual tracks (non-auto) up to current position
                const manualTracks = queue
                    .slice(0, currentIndex + 1)
                    .filter((t) => !autoQueueTrackIds.includes(t.id));
                // Also include current track
                const currentQueueUpToNow = queue.slice(0, currentIndex + 1);

                // Filter recommendations to avoid duplicates with current queue
                const currentIds = new Set(
                    currentQueueUpToNow.map((t) => t.id),
                );
                const newTracks = result.tracks
                    .filter((t) => !currentIds.has(t.id))
                    .slice(0, 10);

                if (newTracks.length > 0) {
                    // Atomically replace: keep tracks up to current, add new recommendations
                    queue = [...currentQueueUpToNow, ...newTracks];

                    // Update tracking
                    autoQueueTrackIds = newTracks.map((t) => t.id);
                    lastAutoQueueBaseTrack = baseTrack;

                    console.log(
                        "[AutoQueue] Replaced with",
                        newTracks.length,
                        "new recommendations",
                    );
                }
            }
        } catch (err) {
            console.error(
                "[AutoQueue] Failed to refresh recommendations:",
                err,
            );
        } finally {
            autoQueueFetching = false;
        }
    }

    function clearAutoRecommendations() {
        if (autoQueueTrackIds.length === 0) return;

        console.log(
            "[AutoQueue] Clearing",
            autoQueueTrackIds.length,
            "auto-added tracks",
        );

        // Remove auto-added tracks from queue
        const autoSet = new Set(autoQueueTrackIds);
        queue = queue.filter((t) => !autoSet.has(t.id));

        // Clear tracking
        autoQueueTrackIds = [];
        lastAutoQueueBaseTrack = null;
    }

    function checkAutoQueueNeeded() {
        // Check if we need to fetch recommendations
        // Condition: queue has songs but no more tracks after current (or all remaining are auto-added)
        if (!currentTrack) return false;

        const remainingManual = queue
            .slice(currentIndex + 1)
            .filter((t) => !autoQueueTrackIds.includes(t.id));
        return remainingManual.length === 0;
    }

    function handleToggleVisualizer(event) {
        visualizerEnabled = event.detail;
        // Enable AudioContext when visualizer is turned on (analyser is synced via bind:analyser)
        if (visualizerEnabled && playerComponent) {
            playerComponent.enableVisualizer();
        }
    }

    function handleThemeChange(event) {
        theme = event.detail;
        console.log("Theme changed to:", theme);
        document.documentElement.setAttribute("data-theme", theme);

        // Sync with Electron window frame
        try {
            const { ipcRenderer } = window.require("electron");
            ipcRenderer.invoke("set-theme", theme);
        } catch (e) {
            console.warn("Electron IPC not available");
        }
    }

    function handleCompactModeChange(event) {
        compactMode = event.detail;
        console.log("Compact mode:", compactMode);
        document.documentElement.classList.toggle("compact", compactMode);
    }

    function handleAudioQualityChange(event) {
        audioQuality = event.detail;
        console.log("Audio quality changed to:", audioQuality);
    }
    function closeWelcome() {
        showWelcome = false;
    }

    function handleWelcomePlaylistSelect(playlist) {
        if (playlist.type === "link") {
            toast.info("External playlist loading coming soon!");
        } else if (playlist.tracks && playlist.tracks.length > 0) {
            queue = [...playlist.tracks];
            playTrack(0);
        } else {
            toast.info("This playlist is empty.");
        }
    }

    function handleWelcomeTrackAction(event) {
        const track = event.detail;
        addToQueue(track);
        if (event.type === "play") {
            playTrack(queue.length - 1);
        }
    }

    // Playlist modal handlers
    function handlePlaylistView(event) {
        selectedPlaylist = event.detail;
        showPlaylistModal = true;
    }

    function handlePlaylistPlayAll(event) {
        const tracks = event.detail.tracks;
        if (tracks && tracks.length > 0) {
            // Clear queue and add all tracks
            queue = [...tracks];
            currentIndex = 0;
            playTrack(0);
            toast.success(
                `Playing ${tracks.length} tracks from "${selectedPlaylist?.name}"`,
            );
        }
    }

    function handlePlaylistTrack(event) {
        const track = event.detail;
        addToQueue(track);
        playTrack(queue.length - 1);
    }

    function closePlaylistModal() {
        showPlaylistModal = false;
        // Don't clear selectedPlaylist immediately for animation
        setTimeout(() => (selectedPlaylist = null), 300);
    }
</script>

<main>
    <header>
        <div class="logo-container">
            <img
                src={theme === "light" ? "./logo-light.png" : "./logo.png"}
                alt="Logo"
                class="app-logo"
            />
        </div>
        <button class="icon-btn" onclick={openSettings} aria-label="Settings">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                />
            </svg>
        </button>
    </header>

    <div class="layout">
        <div class="left-panel">
            <div class="tabs">
                <button
                    class="tab-btn {activeTab === 'home' ? 'active' : ''}"
                    onclick={() => (activeTab = "home")}>Home</button
                >
                <button
                    class="tab-btn {activeTab === 'playlists' ? 'active' : ''}"
                    onclick={() => (activeTab = "playlists")}>Library</button
                >
            </div>

            <div class="panel-content">
                {#if activeTab === "home"}
                    <Home
                        history={listeningHistory}
                        {currentTrack}
                        bind:showSearch
                        onPlay={(track) => {
                            // Check if track already exists in queue
                            const existingIndex = queue.findIndex(
                                (t) => t.id === track.id,
                            );
                            if (existingIndex !== -1) {
                                // Track already in queue - just play it
                                playTrack(existingIndex);
                            } else {
                                // Manual play of new track - clear auto-recs first
                                clearAutoRecommendations();
                                // Add to queue and play
                                queue = [...queue, track];
                                playTrack(queue.length - 1);
                            }
                        }}
                        onAdd={addToQueue}
                    />
                {:else}
                    <PlaylistSidebar on:view={handlePlaylistView} />
                {/if}
            </div>
        </div>

        <div class="center-panel">
            <Player
                bind:this={playerComponent}
                bind:currentTrack
                bind:queue
                bind:currentTime
                bind:analyser
                onTrackEnd={handleTrackEnd}
                onNext={handleNext}
                onPrevious={handlePrevious}
            />

            <Lyrics
                {currentTrack}
                {currentTime}
                {analyser}
                {visualizerEnabled}
            />
        </div>

        <div class="right-panel">
            <Queue
                {queue}
                {currentIndex}
                {autoQueueTrackIds}
                onPlay={playTrack}
                onRemove={removeFromQueue}
                onClear={clearQueue}
                onSave={openPlaylistModal}
            />
        </div>
    </div>

    {#if showSaveToPlaylistModal}
        <div
            class="modal-overlay"
            role="button"
            tabindex="0"
            onclick={closePlaylistModal2}
            onkeydown={(e) => e.key === "Escape" && closePlaylistModal2()}
        >
            <div
                class="modal"
                role="dialog"
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
                                class="playlist-btn"
                                onclick={() => saveToPlaylist(playlist.id)}
                            >
                                {playlist.name} ({playlist.tracks.length} tracks)
                            </button>
                        {/each}
                    {/if}
                </div>
                <button class="btn-cancel" onclick={closePlaylistModal2}
                    >Cancel</button
                >
            </div>
        </div>
    {/if}

    <WelcomeModal
        isOpen={showWelcome}
        playlists={allPlaylists}
        onPlaylistSelect={handleWelcomePlaylistSelect}
        on:close={closeWelcome}
        on:play={handleWelcomeTrackAction}
        on:add={handleWelcomeTrackAction}
    />

    <PlaylistModal
        bind:isOpen={showPlaylistModal}
        playlist={selectedPlaylist}
        on:close={closePlaylistModal}
        on:play={handlePlaylistPlayAll}
        on:playTrack={handlePlaylistTrack}
    />

    <SettingsModal
        isOpen={showSettings}
        bind:visualizerEnabled
        bind:theme
        bind:compactMode
        bind:audioQuality
        on:close={closeSettings}
        on:clearHistory={clearListeningHistory}
        on:toggleVisualizer={handleToggleVisualizer}
        on:themeChange={handleThemeChange}
        on:compactModeChange={handleCompactModeChange}
        on:audioQualityChange={handleAudioQualityChange}
    />

    <Toast />
</main>

<style>
    main {
        height: 100vh;
        padding: var(--spacing-lg);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }

    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-md);
        flex-shrink: 0;
    }

    .logo-container {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
    }

    .app-logo {
        width: 48px;
        height: 48px;
        border-radius: 12px;
    }

    .icon-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .layout {
        display: grid;
        grid-template-columns: 1fr 2fr 1fr;
        gap: var(--spacing-sm); /* Tight spacing everywhere */
        flex: 1;
        min-height: 0;
        min-width: 900px; /* Prevent layout collapse */
    }

    .left-panel,
    .center-panel,
    .right-panel {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm); /* Tight internal spacing */
        overflow: hidden;
        min-width: 0; /* Allow flex shrink */
    }

    .center-panel {
        gap: var(--spacing-sm);
        min-width: 400px;
        display: flex;
        flex-direction: column;
        height: 100%; /* Tambah ini */
        overflow: hidden;
    }

    .left-panel {
        margin-top: 2px;
        min-width: 250px;
        /* Gap covered by general rule */
    }
    .right-panel {
        min-width: 250px;
    }

    @media (max-width: 1200px) {
        .layout {
            grid-template-columns: 300px 1fr 300px;
            min-width: 800px;
        }
    }

    @media (max-width: 900px) {
        .layout {
            grid-template-columns: 1fr 1.5fr;
            min-width: 600px;
        }

        .right-panel {
            grid-column: 1 / -1;
        }
    }

    @media (max-width: 768px) {
        .layout {
            grid-template-columns: 1fr;
        }

        .left-panel,
        .center-panel,
        .right-panel {
            grid-column: 1;
        }
    }
    .tabs {
        display: flex;
        gap: var(--spacing-sm);
        margin-bottom: 0; /* Remove margin, rely on parent flex gap */
        background: var(--bg-tertiary);
        padding: 4px;
        border-radius: var(--radius-md);
    }

    .tab-btn {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        padding: 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }

    .tab-btn.active {
        background: var(--bg-secondary);
        color: var(--text-primary);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .panel-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
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

    .modal-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: var(--spacing-md);
    }

    .playlist-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: var(--spacing-sm);
        border-radius: var(--radius-md);
        cursor: pointer;
        text-align: left;
        transition: all var(--transition-fast);
    }

    .playlist-btn:hover {
        background: var(--bg-hover);
        border-color: var(--accent);
    }

    .btn-cancel {
        width: 100%;
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        padding: var(--spacing-sm);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .btn-cancel:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
</style>
