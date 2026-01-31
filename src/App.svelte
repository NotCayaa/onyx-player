<script>
    import { onMount, onDestroy } from "svelte";
    import { api } from "./lib/api.js";
    import { toast } from "./lib/stores/toast.js";
    import Player from "./lib/components/Player.svelte";
    import Home from "./lib/components/Home.svelte";
    import Search from "./lib/components/Search.svelte";
    import Queue from "./lib/components/Queue.svelte";
    import Lyrics from "./lib/components/Lyrics.svelte";
    import ZenMode from "./lib/components/ZenMode.svelte";
    import PlaylistSidebar from "./lib/components/PlaylistSidebar.svelte";
    import SettingsModal from "./lib/components/SettingsModal.svelte";
    import WelcomeModal from "./lib/components/WelcomeModal.svelte";
    import PlaylistModal from "./lib/components/PlaylistModal.svelte";
    import Toast from "./lib/components/Toast.svelte";
    import ColorThief from "colorthief";

    let queue = [];
    let currentIndex = 0;
    let currentTrack = null;

    // Background Color Logic
    const colorThief = new ColorThief();
    let lastProcessedArt = null;

    async function updateThemeColor(track) {
        if (!track?.albumArt || track.albumArt === lastProcessedArt) return;
        lastProcessedArt = track.albumArt;

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            // Use proxy to avoid CORS issues
            const proxyUrl = `http://localhost:3000/proxy/image?url=${encodeURIComponent(track.albumArt)}`;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = proxyUrl;
            });

            const color = colorThief.getColor(img);
            if (color) {
                const [r, g, b] = color;

                // Calculate brightness
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;

                // If extract color is too dark (e.g. black album cover), use Green to keep glass effect visible
                if (brightness < 50) {
                    document.documentElement.style.setProperty(
                        "--dominant-rgb",
                        "34, 197, 94",
                    );
                } else {
                    document.documentElement.style.setProperty(
                        "--dominant-rgb",
                        `${r}, ${g}, ${b}`,
                    );
                }
            }
        } catch (err) {
            console.error("Failed to extract color:", err);
            // Fallback to Green
            document.documentElement.style.setProperty(
                "--dominant-rgb",
                "34, 197, 94",
            );
        }
    }

    // React to track changes
    $: if (currentTrack) {
        updateThemeColor(currentTrack);
    }
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
    let showLyrics = false; // New V3 State: Toggle between Queue/Lyrics in Right Panel
    let showZenMode = false; // Zen Mode state
    let isPlaying = false; // Track play state for ZenMode
    let lyricsComponent; // Reference to Lyrics component for synced lyrics data
    let syncedLyrics = []; // Synced lyrics data from Lyrics component
    let volume = 1; // Volume state for ZenMode sync

    // Listening history
    let listeningHistory = [];

    // Auto-queue recommendations state
    let autoQueueTrackIds = []; // Track IDs that were auto-added
    let autoQueueFetching = false; // Prevent concurrent fetches
    let lastAutoQueueBaseTrack = null; // Track that recommendations are based on

    // Load settings and check welcome modal
    onMount(async () => {
        // Force default green background on start
        document.documentElement.style.setProperty(
            "--dominant-rgb",
            "34, 197, 94",
        );

        // Load all settings from localStorage
        const saved = localStorage.getItem("visualizerEnabled");
        if (saved !== null) {
            visualizerEnabled = saved === "true";
        }

        const savedTheme = localStorage.getItem("theme");
        if (savedTheme) {
            theme = savedTheme;
            document.documentElement.setAttribute("data-theme", theme);
            // Apply body class for CSS variables
            document.body.classList.toggle("light", theme === "light");

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
        // Clear queue only, keep current track playing
        if (currentTrack && queue.length > 0) {
            queue = [queue[currentIndex]]; // Keep only current track
            currentIndex = 0;
        } else {
            queue = [];
            currentIndex = 0;
        }
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

    function handleShuffle() {
        if (queue.length <= 1) return;

        // Fisher-Yates shuffle, keeping current track at index 0
        const currentTrackItem = queue[currentIndex];
        const otherTracks = queue.filter((_, i) => i !== currentIndex);

        for (let i = otherTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }

        // Put current track at start, rest shuffled after
        queue = [currentTrackItem, ...otherTracks];
        currentIndex = 0;
    }

    function handleStop() {
        // Stop current track only, keep queue intact
        currentTrack = null;
        currentTime = 0;
        // Queue remains - user can resume later by clicking a track in queue
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
        // Apply body class for CSS variables
        document.body.classList.toggle("light", theme === "light");

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

<main
    class="h-screen w-screen bg-transparent text-[var(--text-primary)] flex flex-col overflow-hidden box-border font-sans antialiased selection:bg-white/20"
>
    <!-- Header removed for V3 Layout -->

    <!-- Main Layout -->
    <main
        class="flex-1 grid grid-cols-[80px_1fr_400px] gap-4 p-2 pt-2 h-full relative z-10 transition-all duration-300"
        class:compact={compactMode}
    >
        <!-- LEFT PANEL (Nav Rail) -->
        <div
            class="flex flex-col gap-4 min-h-0 items-stretch py-4 px-3 bg-[var(--bg-primary)] rounded-3xl border border-[var(--border)] backdrop-blur-xl"
        >
            <div class="mb-4">
                <img
                    src={theme === "light" ? "./logo-light.png" : "./logo.png"}
                    alt="Logo"
                    class="w-full h-full rounded-xl shadow-lg shadow-green-500/20"
                />
            </div>

            <!-- Nav Buttons -->
            <button
                class="w-full h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group relative {activeTab ===
                'home'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-lg shadow-white/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)]'}"
                onclick={() => (activeTab = "home")}
                title="Home"
            >
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    ><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg
                >
                {#if activeTab === "home"}
                    <div
                        class="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-l-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    ></div>
                {/if}
            </button>

            <button
                class="w-full h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group relative {activeTab ===
                'playlists'
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-lg shadow-white/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)]'}"
                onclick={() => (activeTab = "playlists")}
                title="Library"
            >
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    ><path
                        d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"
                    /></svg
                >
                {#if activeTab === "playlists"}
                    <div
                        class="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-l-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    ></div>
                {/if}
            </button>

            <div class="flex-1"></div>

            <button
                class="w-full h-14 rounded-2xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-all duration-300"
                onclick={openSettings}
                title="Settings"
            >
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    ><path
                        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                    /></svg
                >
            </button>
        </div>

        <!-- CENTER PANEL (Main Content) -->
        <div class="flex flex-col gap-4 min-h-0 overflow-hidden relative">
            <!-- Glass Container -->
            <div
                class="flex-1 overflow-hidden bg-[var(--bg-primary)] rounded-3xl border border-[var(--border)] backdrop-blur-xl relative transition-all duration-500"
            >
                {#if activeTab === "home"}
                    <Home
                        history={listeningHistory}
                        {currentTrack}
                        bind:showSearch
                        onPlay={(track) => {
                            const existingIndex = queue.findIndex(
                                (t) => t.id === track.id,
                            );
                            if (existingIndex !== -1) {
                                playTrack(existingIndex);
                            } else {
                                clearAutoRecommendations();
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

        <!-- RIGHT PANEL (Now Playing) -->
        <div class="flex flex-col gap-4 min-h-0 overflow-hidden">
            <!-- Circular Player -->
            <div
                class="bg-[var(--bg-primary)] rounded-3xl border border-[var(--border)] backdrop-blur-xl p-6 flex flex-col items-center justify-center transition-all duration-500"
            >
                <Player
                    bind:this={playerComponent}
                    bind:currentTrack
                    bind:queue
                    bind:currentTime
                    bind:analyser
                    bind:isPlaying
                    bind:volume
                    onTrackEnd={handleTrackEnd}
                    onNext={handleNext}
                    onPrevious={handlePrevious}
                    onShuffle={handleShuffle}
                    onStop={handleStop}
                />
            </div>

            <!-- Tabs (Queue/Lyrics) -->
            <div
                class="flex-1 flex flex-col overflow-hidden relative bg-[var(--bg-primary)] rounded-3xl border border-[var(--border)]"
            >
                <!-- Panel Toggles -->
                <div class="flex p-2 gap-2 border-b border-[var(--border)]">
                    <button
                        class="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all {showLyrics
                            ? 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                            : 'bg-[var(--bg-active)] text-[var(--text-primary)]'}"
                        onclick={() => (showLyrics = false)}>Queue</button
                    >
                    <button
                        class="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all {!showLyrics
                            ? 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                            : 'bg-[var(--bg-active)] text-[var(--text-primary)]'}"
                        onclick={() => (showLyrics = true)}>Lyrics</button
                    >
                </div>

                <div class="flex-1 overflow-hidden relative">
                    <!-- Keep both mounted to preserve state, toggle visibility -->
                    <div class={showLyrics ? "hidden" : "h-full"}>
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
                    <div class={showLyrics ? "h-full" : "hidden"}>
                        <Lyrics
                            bind:this={lyricsComponent}
                            {currentTrack}
                            {currentTime}
                            {analyser}
                            {visualizerEnabled}
                            on:openZenMode={(e) => {
                                syncedLyrics = e.detail.syncedLyrics;
                                showZenMode = true;
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    </main>

    <!-- Modals -->
    {#if showSaveToPlaylistModal}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            role="button"
            tabindex="0"
            onclick={closePlaylistModal2}
            onkeydown={(e) => e.key === "Escape" && closePlaylistModal2()}
        >
            <div
                class="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
                role="dialog"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                tabindex="-1"
            >
                <h3 class="text-xl font-bold mb-4 text-[var(--text-primary)]">
                    Save to Playlist
                </h3>
                <div
                    class="flex flex-col gap-2 max-h-60 overflow-y-auto mb-4 custom-scrollbar"
                >
                    {#if playlists.length === 0}
                        <p class="text-neutral-500 text-center py-4">
                            No local playlists found.
                        </p>
                    {:else}
                        {#each playlists as playlist}
                            <button
                                class="text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-neutral-200"
                                onclick={() => saveToPlaylist(playlist.id)}
                            >
                                <span class="font-medium text-white block"
                                    >{playlist.name}</span
                                >
                                <span class="text-xs text-neutral-500"
                                    >{playlist.tracks.length} tracks</span
                                >
                            </button>
                        {/each}
                    {/if}
                </div>
                <button
                    class="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
                    onclick={closePlaylistModal2}>Cancel</button
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

    {#if showZenMode}
        <ZenMode
            {currentTrack}
            {currentTime}
            {analyser}
            {isPlaying}
            {queue}
            {volume}
            on:close={() => (showZenMode = false)}
            on:previous={handlePrevious}
            on:next={handleNext}
            on:togglePlay={() => playerComponent?.togglePlay()}
            on:volumeChange={(e) => playerComponent?.setVolumeValue(e.detail)}
            on:seek={(e) => playerComponent?.seekTo(e.detail)}
            on:shuffle={handleShuffle}
            on:stop={handleStop}
        />
    {/if}
</main>
