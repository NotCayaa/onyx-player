<script>
    import { createEventDispatcher } from "svelte";
    import { api } from "../api.js";
    import { fade, fly } from "svelte/transition";

    export let isOpen = false;
    export let playlists = [];
    export let onPlaylistSelect = () => {};

    const dispatch = createEventDispatcher();

    let searchQuery = "";
    let searchType = "spotify";
    let searchResults = [];
    let isSearching = false;
    let dontShowAgain = false;

    // Dynamic placeholder
    $: searchPlaceholder =
        searchType === "spotify"
            ? "Search songs or paste Spotify URL..."
            : "Search songs or paste YouTube URL...";

    function close(action) {
        if (dontShowAgain) {
            localStorage.setItem("hideWelcome", "true");
        }
        if (action === "browse") {
            dispatch("browse");
        }
        dispatch("close");
    }

    async function handleSearch() {
        if (!searchQuery.trim()) return;

        isSearching = true;
        try {
            if (searchType === "spotify") {
                const data = await api.searchTracks(searchQuery);
                searchResults = data.tracks || [];
            } else {
                const data = await api.searchYouTube(searchQuery);
                searchResults = (data.videos || []).map((video) => ({
                    id: video.id,
                    name: video.title,
                    artists: video.channel,
                    albumArt: video.thumbnail,
                    duration: video.duration,
                    isYouTube: true,
                    youtubeUrl: video.url,
                }));
            }
        } catch (err) {
            console.error("Search error:", err);
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    function handlePlaylistClick(playlist) {
        onPlaylistSelect(playlist);
        close();
    }

    function handleTrackSelect(track, action) {
        dispatch(action, track);
        close();
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            close();
        }
    }
</script>

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="modal-backdrop"
        onclick={handleBackdropClick}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="modal"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <div class="modal-header">
                <h1>Welcome to Onyx Player</h1>
                <p>Start listening to your favorite music</p>
                <button class="close-btn" onclick={close} aria-label="Close">
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                        />
                    </svg>
                </button>
            </div>

            <div class="modal-content">
                <!-- Quick Search -->
                <section class="search-section">
                    <h3>Quick Search</h3>
                    <div class="search-tabs">
                        <button
                            class="tab-btn {searchType === 'spotify'
                                ? 'active'
                                : ''}"
                            onclick={() => (searchType = "spotify")}
                        >
                            Spotify
                        </button>
                        <button
                            class="tab-btn {searchType === 'youtube'
                                ? 'active'
                                : ''}"
                            onclick={() => (searchType = "youtube")}
                        >
                            YouTube
                        </button>
                    </div>

                    <div class="search-input-wrapper">
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            bind:value={searchQuery}
                            onkeydown={(e) =>
                                e.key === "Enter" && handleSearch()}
                            class="search-input"
                        />
                        <button onclick={handleSearch} class="search-btn">
                            Search
                        </button>
                    </div>

                    {#if isSearching}
                        <div class="loading">
                            <div class="spinner"></div>
                            <p>Searching...</p>
                        </div>
                    {:else if searchResults.length > 0}
                        <div class="search-results">
                            {#each searchResults.slice(0, 5) as track}
                                <div class="result-item">
                                    <img
                                        src={track.albumArt}
                                        alt={track.name}
                                        class="result-art"
                                    />
                                    <div class="result-info">
                                        <div class="result-name">
                                            {track.name}
                                        </div>
                                        <div class="result-artist">
                                            {track.artists}
                                        </div>
                                    </div>
                                    <button
                                        onclick={() =>
                                            handleTrackSelect(track, "play")}
                                        class="play-btn"
                                        aria-label="Play {track.name}"
                                    >
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </section>

                <!-- Recent Playlists -->
                {#if playlists.length > 0}
                    <section class="playlists-section">
                        <h3>Your Playlists</h3>
                        <div class="playlist-list">
                            {#each playlists.slice(0, 5) as playlist}
                                <button
                                    class="playlist-item"
                                    onclick={() =>
                                        handlePlaylistClick(playlist)}
                                >
                                    <span class="playlist-icon">
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                            />
                                        </svg>
                                    </span>
                                    <span class="playlist-name">
                                        {playlist.name}
                                    </span>
                                    <span class="playlist-count">
                                        ({playlist.tracks?.length || 0})
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </section>
                {/if}
            </div>

            <div class="modal-footer">
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={dontShowAgain} />
                    <span>Don't show this again</span>
                </label>
                <button class="browse-btn" onclick={() => close("browse")}>
                    Browse Library
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    }

    .modal {
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.4s;
    }

    @keyframes slideUp {
        from {
            transform: translateY(30px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .modal-header {
        position: relative;
        padding: var(--spacing-xl);
        text-align: center;
        border-bottom: 1px solid var(--bg-tertiary);
    }

    .close-btn {
        position: absolute;
        top: var(--spacing-md);
        right: var(--spacing-md);
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-xs);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
    }

    .close-btn:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
    }

    h1 {
        margin: 0 0 var(--spacing-sm) 0;
        font-size: 2rem;
        color: var(--text-primary);
    }

    .modal-header p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 1rem;
    }

    .modal-content {
        overflow-y: auto;
        padding: var(--spacing-lg);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xl);
    }

    section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }

    h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--text-primary);
    }

    .search-tabs {
        display: flex;
        gap: var(--spacing-sm);
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
    }

    .search-input-wrapper {
        display: flex;
        gap: var(--spacing-sm);
    }

    .search-input {
        flex: 1;
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: var(--spacing-sm) var(--spacing-md);
        border-radius: var(--radius-md);
        font-size: 1rem;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--accent-primary);
    }

    .search-btn {
        background: var(--accent-primary);
        color: white;
        border: none;
        padding: var(--spacing-sm) var(--spacing-lg);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }

    .search-btn:hover {
        background: var(--accent-hover);
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-xl);
        gap: var(--spacing-md);
    }

    .search-results {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
        max-height: 200px;
        overflow-y: auto;
    }

    .result-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-sm);
        transition: background 0.2s;
    }

    .result-item:hover {
        background: var(--bg-hover);
    }

    .result-art {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-sm);
        object-fit: cover;
    }

    .result-info {
        flex: 1;
        min-width: 0;
    }

    .result-name {
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .result-artist {
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .play-btn {
        background: var(--accent-primary);
        color: white;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .play-btn:hover {
        transform: scale(1.1);
        background: var(--accent-hover);
    }

    .playlist-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

    .playlist-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
    }

    .playlist-item:hover {
        background: var(--bg-hover);
        border-color: var(--accent-primary);
    }

    .playlist-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
    }

    .playlist-name {
        flex: 1;
        color: var(--text-primary);
        font-weight: 500;
    }

    .playlist-count {
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .modal-footer {
        padding: var(--spacing-lg);
        border-top: 1px solid var(--bg-tertiary);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .checkbox-label input {
        cursor: pointer;
        accent-color: var(--accent-primary);
    }

    .browse-btn {
        background: var(--accent-primary);
        color: white;
        border: none;
        padding: var(--spacing-sm) var(--spacing-xl);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-weight: 500;
        font-size: 1rem;
        transition: all 0.2s;
    }

    .browse-btn:hover {
        background: var(--accent-hover);
        transform: translateY(-1px);
    }
</style>
