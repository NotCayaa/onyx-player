<script>
    import { onMount, onDestroy } from "svelte";
    import Recommendations from "./Recommendations.svelte";
    import Search from "./Search.svelte";
    import { api } from "../api.js";

    export let history = [];
    export let onPlay = (track) => {};
    export let onAdd = (track) => {};
    export let onSave = (track) => {};
    export let currentTrack = null;
    export let showSearch = false;

    let greeting = "";
    let userName = "";
    let newReleases = [];
    let loadingReleases = false;
    let activeMenu = null; // Track ID with open menu
    let showPlaylistModal = false;
    let selectedTrackForSave = null;

    function updateGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) greeting = "Good Morning";
        else if (hour < 18) greeting = "Good Afternoon";
        else greeting = "Good Evening";
    }

    onMount(() => {
        updateGreeting();
        userName = localStorage.getItem("username") || "...";

        // Listen for username changes from Settings
        window.addEventListener("storage", handleStorageChange);

        // Fetch new releases
        fetchNewReleases();

        // Close menu on outside click
        const closeMenu = (e) => {
            // Don't close if clicking on menu button or menu itself
            if (
                e.target.closest(".card-menu-btn") ||
                e.target.closest(".card-menu")
            ) {
                return;
            }
            activeMenu = null;
        };
        document.addEventListener("click", closeMenu);

        return () => {
            document.removeEventListener("click", closeMenu);
        };
    });

    onDestroy(() => {
        window.removeEventListener("storage", handleStorageChange);
    });

    function handleStorageChange() {
        userName = localStorage.getItem("username") || "...";
    }

    async function fetchNewReleases() {
        loadingReleases = true;
        try {
            const result = await api.getNewReleases(10, history.slice(0, 5));
            newReleases = result.tracks || [];
        } catch (error) {
            console.error("Failed to fetch new releases:", error);
            newReleases = [];
        } finally {
            loadingReleases = false;
        }
    }

    function playTrack(track) {
        // Ensure artist field is present for Lyrics component
        if (!track.artist && track.artists) {
            track.artist = track.artists.split(",")[0];
        }
        onPlay(track);
    }

    function toggleMenu(trackId, event) {
        event.stopPropagation();
        activeMenu = activeMenu === trackId ? null : trackId;
    }

    function addToQueue(track, event) {
        event.stopPropagation();
        onAdd(track);
        activeMenu = null;
    }

    function openSaveModal(track, event) {
        event.stopPropagation();
        onSave(track);
        activeMenu = null;
    }

    function scrollLeft(e) {
        const wrapper = e.target.closest(".scroll-wrapper");
        const container = wrapper.querySelector(".horizontal-scroll");
        container.scrollBy({ left: -200, behavior: "smooth" });
    }

    function scrollRight(e) {
        const wrapper = e.target.closest(".scroll-wrapper");
        const container = wrapper.querySelector(".horizontal-scroll");
        container.scrollBy({ left: 200, behavior: "smooth" });
    }
</script>

<div class="home">
    <!-- Panel Header with Greeting and Search Button -->
    <div class="panel-header">
        <h2 class="greeting">{greeting}, {userName}!</h2>
        <button
            class="search-toggle-btn"
            onclick={() => (showSearch = !showSearch)}
            class:active={showSearch}
            aria-label="Toggle Search"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                />
            </svg>
        </button>
    </div>

    <!-- Original Search Component (Compact) -->
    {#if showSearch}
        <div class="search-section-compact">
            <Search {onAdd} {onPlay} />
        </div>
    {/if}

    <!-- Sections Container -->
    <div class="sections-container">
        <!-- Jump Back In -->
        {#if history.length > 0}
            <section class="section">
                <h3 class="section-title">Jump Back In</h3>
                <div class="scroll-wrapper">
                    <button
                        class="scroll-arrow scroll-arrow-left"
                        onclick={scrollLeft}
                        aria-label="Scroll left"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                            />
                        </svg>
                    </button>
                    <div class="horizontal-scroll">
                        {#each history.slice(0, 8) as track}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                class="card"
                                class:menu-active={activeMenu === track.id}
                                onclick={() => playTrack(track)}
                            >
                                <img
                                    src={track.albumArt}
                                    alt={track.name}
                                    class="card-image"
                                />
                                <div class="card-info">
                                    <div class="card-title">{track.name}</div>
                                    <div class="card-subtitle">
                                        {track.artists}
                                    </div>
                                </div>

                                <!-- Menu Button -->
                                <button
                                    class="card-menu-btn"
                                    onclick={(e) => toggleMenu(track.id, e)}
                                    aria-label="More options"
                                >
                                    <svg
                                        width="3"
                                        height="13"
                                        viewBox="0 0 4 16"
                                        fill="currentColor"
                                    >
                                        <circle cx="2" cy="2" r="1.5" />
                                        <circle cx="2" cy="8" r="1.5" />
                                        <circle cx="2" cy="14" r="1.5" />
                                    </svg>
                                </button>

                                <!-- Menu Dropdown -->
                                {#if activeMenu === track.id}
                                    <div class="card-menu">
                                        <button
                                            onclick={(e) =>
                                                addToQueue(track, e)}
                                        >
                                            <span>➕</span> Add to Queue
                                        </button>
                                        <button
                                            onclick={(e) =>
                                                openSaveModal(track, e)}
                                        >
                                            <span>💾</span> Save to Playlist
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <button
                        class="scroll-arrow scroll-arrow-right"
                        onclick={scrollRight}
                        aria-label="Scroll right"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                            />
                        </svg>
                    </button>
                </div>
            </section>
        {/if}

        <!-- Discover More -->
        <section class="section">
            <h3 class="section-title">Discover More</h3>
            <div class="scroll-wrapper">
                <button
                    class="scroll-arrow scroll-arrow-left"
                    onclick={scrollLeft}
                    aria-label="Scroll $2"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                        />
                    </svg>
                </button>
                {#if currentTrack}
                    <div class="horizontal-scroll">
                        <Recommendations
                            track={currentTrack}
                            {onPlay}
                            {onAdd}
                            {onSave}
                            horizontal={true}
                        />
                    </div>
                {:else if history.length > 0}
                    <div class="horizontal-scroll">
                        <Recommendations
                            track={history[0]}
                            {onPlay}
                            {onAdd}
                            {onSave}
                            horizontal={true}
                        />
                    </div>
                {:else}
                    <div class="empty-message">
                        <p>Play a track to get personalized recommendations</p>
                    </div>
                {/if}
                <button
                    class="scroll-arrow scroll-arrow-right"
                    onclick={scrollRight}
                    aria-label="Scroll $2"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                        />
                    </svg>
                </button>
            </div>
        </section>

        <!-- New Releases -->
        <section class="section">
            <h3 class="section-title">New Releases</h3>
            <div class="scroll-wrapper">
                <button
                    class="scroll-arrow scroll-arrow-left"
                    onclick={scrollLeft}
                    aria-label="Scroll $2"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                        />
                    </svg>
                </button>
                {#if loadingReleases}
                    <div class="section-loading">
                        <div class="spinner"></div>
                        <p>Loading new releases...</p>
                    </div>
                {:else if newReleases.length > 0}
                    <div class="horizontal-scroll">
                        {#each newReleases as track}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                class="card"
                                class:menu-active={activeMenu === track.id}
                                onclick={() => playTrack(track)}
                            >
                                <img
                                    src={track.albumArt}
                                    alt={track.name}
                                    class="card-image"
                                />
                                <div class="card-info">
                                    <div class="card-title">{track.name}</div>
                                    <div class="card-subtitle">
                                        {track.artists}
                                    </div>
                                </div>

                                <!-- Menu Button -->
                                <button
                                    class="card-menu-btn"
                                    onclick={(e) => toggleMenu(track.id, e)}
                                    aria-label="More options"
                                >
                                    <svg
                                        width="3"
                                        height="13"
                                        viewBox="0 0 4 16"
                                        fill="currentColor"
                                    >
                                        <circle cx="2" cy="2" r="1.5" />
                                        <circle cx="2" cy="8" r="1.5" />
                                        <circle cx="2" cy="14" r="1.5" />
                                    </svg>
                                </button>

                                <!-- Menu Dropdown -->
                                {#if activeMenu === track.id}
                                    <div class="card-menu">
                                        <button
                                            onclick={(e) =>
                                                addToQueue(track, e)}
                                        >
                                            <span>➕</span> Add to Queue
                                        </button>
                                        <button
                                            onclick={(e) =>
                                                openSaveModal(track, e)}
                                        >
                                            <span>💾</span> Save to Playlist
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="section-loading">
                        <p>No new releases available</p>
                    </div>
                {/if}
                <button
                    class="scroll-arrow scroll-arrow-right"
                    onclick={scrollRight}
                    aria-label="Scroll $2"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                        />
                    </svg>
                </button>
            </div>
        </section>
    </div>
</div>

<style>
    .home {
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: var(--spacing-md);
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        overflow: hidden;
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--spacing-sm);
        flex-shrink: 0;
    }

    .greeting {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .search-toggle-btn {
        background: var(--bg-tertiary);
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-xs);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .search-toggle-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .search-toggle-btn.active {
        background: var(--accent-primary);
        color: white;
    }

    /* Compact Search Section */
    .search-section-compact {
        margin-bottom: var(--spacing-sm);
        flex-shrink: 0;
        font-size: 0.875rem;
        max-height: 350px;
        overflow-y: auto;
    }

    .search-section-compact :global(.search) {
        padding: var(--spacing-sm);
        font-size: 0.875rem;
    }

    .search-section-compact :global(input) {
        font-size: 0.8125rem;
        padding: var(--spacing-xs) var(--spacing-sm);
    }

    .search-section-compact :global(button) {
        font-size: 0.8125rem;
        padding: var(--spacing-xs) var(--spacing-sm);
    }

    .sections-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        overflow-y: auto;
        min-height: 0;
        scrollbar-width: none;
    }

    .sections-container::-webkit-scrollbar {
        display: none;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
        flex-shrink: 0;
        min-height: 180px;
    }

    .section-title {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--text-primary);
        flex-shrink: 0;
    }

    /* Scroll Wrapper with Arrows */
    .scroll-wrapper {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
    }

    .scroll-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.7);
        border: none;
        color: white;
        width: 32px;
        z-index: 2000;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        pointer-events: none; /* Prevent blocking clicks when hidden */
        transition:
            opacity var(--transition-fast),
            background var(--transition-fast);
    }

    .scroll-wrapper:hover .scroll-arrow {
        opacity: 1;
        pointer-events: auto; /* Enable clicks only when visible */
    }

    .scroll-arrow:hover {
        background: rgba(0, 0, 0, 0.9);
    }

    .scroll-arrow:disabled {
        display: none;
    }

    .scroll-arrow-left {
        left: 4px;
    }

    .scroll-arrow-right {
        right: 4px;
    }

    .horizontal-scroll {
        flex: 1;
        display: flex;
        gap: var(--spacing-sm);
        overflow-x: auto;
        overflow-y: hidden;
        padding-top: 8px; /* Space for hover effect */
        padding-bottom: var(--spacing-xs);
        scrollbar-width: none;
    }

    .horizontal-scroll::-webkit-scrollbar {
        display: none;
    }

    .card {
        min-width: 90px;
        max-width: 90px;
        cursor: pointer;
        transition:
            transform var(--transition-fast),
            z-index 0s;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

    .card:hover {
        transform: translateY(-4px);
    }

    .card-image {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        display: block;
        border-radius: var(--radius-md);
    }

    .card-info {
        padding: 0;
        overflow: hidden;
    }

    .card-title {
        font-weight: 500;
        font-size: 0.75rem;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
    }

    .card-subtitle {
        font-size: 0.6875rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .empty-message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        /* background removed */
        border-radius: var(--radius-md);
    }

    .section-loading {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-xl);
        gap: var(--spacing-md);
        color: var(--text-secondary);
        font-size: 0.875rem;
        text-align: center;
    }

    .empty-message p {
        margin: 0;
    }

    /* Context Menu */
    .card {
        position: relative;
        overflow: visible;
        transition: z-index 0s; /* Instant z-index change */
    }

    .card:hover {
        z-index: 100;
        transform: translateY(-4px);
    }

    .card.menu-active {
        z-index: 500; /* Higher than hover to keep menu on top */
    }

    .card-image {
        border-radius: var(--radius-md);
    }

    .card-menu-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        border-radius: 50%;
        width: 21px;
        height: 21px;
        padding: 0;
        opacity: 0;
        transition: all var(--transition-fast);
        cursor: pointer;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .card:hover .card-menu-btn {
        opacity: 1;
    }

    .card-menu-btn:hover {
        background: rgba(0, 0, 0, 0.95);
        transform: scale(1.05); /* Reduced scale slightly */
    }

    .card-menu {
        position: absolute;
        top: 40px;
        left: 8px; /* Changed from right to prevent left clipping */
        background: var(--bg-tertiary);
        border: 1px solid var(--bg-hover);
        border-radius: var(--radius-sm);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        z-index: 100;
        min-width: 180px;
        overflow: hidden;
    }

    .card-menu button {
        width: 100%;
        padding: var(--spacing-sm) var(--spacing-md);
        text-align: left;
        background: transparent;
        border: none;
        color: var(--text-primary);
        cursor: pointer;
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        transition: background var(--transition-fast);
    }

    .card-menu button:hover {
        background: var(--bg-hover);
    }

    .card-menu button span {
        font-size: 1rem;
    }
</style>
