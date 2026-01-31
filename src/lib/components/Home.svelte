<script context="module">
    // Cache New Releases (1 Hour TTL)
    let releaseCache = {
        data: [],
        timestamp: 0,
    };
</script>

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
                e.target.closest(".menu-btn-trigger") ||
                e.target.closest(".menu-dropdown")
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
        // Check cache (TTL: 1 Hour)
        const ONE_HOUR = 60 * 60 * 1000;
        if (
            releaseCache.data.length > 0 &&
            Date.now() - releaseCache.timestamp < ONE_HOUR
        ) {
            newReleases = releaseCache.data;
            return;
        }

        loadingReleases = true;
        try {
            const result = await api.getNewReleases(10, history.slice(0, 5));
            newReleases = result.tracks || [];

            // Update cache
            releaseCache = {
                data: newReleases,
                timestamp: Date.now(),
            };
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

<div class="flex flex-col h-full bg-transparent overflow-hidden relative">
    <!-- Header -->
    <div
        class="flex items-center justify-between mb-4 flex-shrink-0 px-6 pt-6 pb-4"
    >
        <h2 class="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            {greeting}, {userName}!
        </h2>
        <button
            class="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors {showSearch
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)] shadow-sm'
                : ''}"
            onclick={() => (showSearch = !showSearch)}
            aria-label="Toggle Search"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                />
            </svg>
        </button>
    </div>

    <!-- Compact Search -->
    {#if showSearch}
        <div class="flex-shrink-0 mb-4 px-4 overflow-y-auto max-h-[350px]">
            <div
                class="border border-[var(--border)] rounded-2xl bg-[var(--bg-hover)] backdrop-blur-sm"
            >
                <Search {onAdd} {onPlay} />
            </div>
        </div>
    {/if}

    <!-- Content Sections -->
    <div
        class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-[var(--section-gap)] pb-6 px-[var(--inner-padding)]"
    >
        <!-- Jump Back In -->
        {#if history.length > 0}
            <section class="flex flex-col gap-3 min-h-[200px]">
                <h3 class="text-lg font-bold text-[var(--text-primary)] px-1">
                    Jump Back In
                </h3>
                <div class="scroll-wrapper relative group/scroll">
                    <!-- Left Arrow -->
                    <button
                        class="scroll-btn left-0"
                        onclick={scrollLeft}
                        aria-label="Scroll left"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            ><path
                                d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                            /></svg
                        >
                    </button>

                    <!-- Scroll Container -->
                    <div
                        class="horizontal-scroll flex gap-3 overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide px-1"
                    >
                        {#each history.slice(0, 8) as track}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                class="group relative flex flex-col gap-0 w-[var(--card-width)] min-w-[var(--card-width)] rounded-xl cursor-pointer transition-all hover:-translate-y-1 hover:z-20
                                       {activeMenu === track.id
                                    ? 'z-50'
                                    : 'z-0'}"
                                onclick={() => playTrack(track)}
                            >
                                <div
                                    class="relative w-full aspect-square overflow-hidden rounded-xl bg-[var(--bg-secondary)] shadow-lg"
                                >
                                    <img
                                        src={track.albumArt}
                                        alt={track.name}
                                        class="w-full h-full object-cover"
                                    />

                                    <!-- Overlay Play Button -->
                                    <div
                                        class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <button
                                            class="w-10 h-10 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center text-lg shadow-lg hover:scale-110 transition-transform"
                                            aria-label="Play {track.name}"
                                        >
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                ><path d="M8 5v14l11-7z" /></svg
                                            >
                                        </button>
                                    </div>

                                    <!-- Menu Button -->
                                    <button
                                        class="menu-btn-trigger absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/80 hover:scale-105 z-30
                                               {activeMenu === track.id
                                            ? 'opacity-100'
                                            : ''}"
                                        onclick={(e) => toggleMenu(track.id, e)}
                                        aria-label="More options"
                                    >
                                        <svg
                                            width="4"
                                            height="16"
                                            viewBox="0 0 4 16"
                                            fill="currentColor"
                                        >
                                            <circle cx="2" cy="2" r="1.5" />
                                            <circle cx="2" cy="8" r="1.5" />
                                            <circle cx="2" cy="14" r="1.5" />
                                        </svg>
                                    </button>
                                </div>

                                <div class="p-2 flex flex-col gap-0.5">
                                    <div
                                        class="font-semibold text-sm text-[var(--text-primary)] truncate"
                                        title={track.name}
                                    >
                                        {track.name}
                                    </div>
                                    <div
                                        class="text-xs text-[var(--text-secondary)] truncate"
                                    >
                                        {track.artists}
                                    </div>
                                </div>

                                <!-- Menu Dropdown -->
                                {#if activeMenu === track.id}
                                    <div
                                        class="menu-dropdown absolute top-10 right-2 left-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-[100] overflow-hidden flex flex-col min-w-[150px]"
                                    >
                                        <button
                                            class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
                                            onclick={(e) =>
                                                addToQueue(track, e)}
                                        >
                                            <span>➕</span> Add to Queue
                                        </button>
                                        <button
                                            class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
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

                    <!-- Right Arrow -->
                    <button
                        class="scroll-btn right-0"
                        onclick={scrollRight}
                        aria-label="Scroll right"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            ><path
                                d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                            /></svg
                        >
                    </button>
                </div>
            </section>
        {/if}

        <!-- Discover More -->
        <section class="flex flex-col gap-3 min-h-[220px]">
            <h3 class="text-lg font-bold text-[var(--text-primary)] px-1">
                Discover More
            </h3>
            <div class="scroll-wrapper relative group/scroll">
                <button
                    class="scroll-btn left-0"
                    onclick={scrollLeft}
                    aria-label="Scroll left"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        ><path
                            d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                        /></svg
                    >
                </button>

                <div
                    class="horizontal-scroll flex gap-3 overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide px-1"
                >
                    {#if currentTrack}
                        <Recommendations
                            track={currentTrack}
                            {onPlay}
                            {onAdd}
                            {onSave}
                            horizontal={true}
                        />
                    {:else if history.length > 0}
                        <Recommendations
                            track={history[0]}
                            {onPlay}
                            {onAdd}
                            {onSave}
                            horizontal={true}
                        />
                    {:else}
                        <div
                            class="flex items-center justify-center w-full h-32 text-neutral-500 text-sm"
                        >
                            <p>
                                Play a track to get personalized recommendations
                            </p>
                        </div>
                    {/if}
                </div>

                <button
                    class="scroll-btn right-0"
                    onclick={scrollRight}
                    aria-label="Scroll right"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        ><path
                            d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                        /></svg
                    >
                </button>
            </div>
        </section>

        <!-- New Releases -->
        <section class="flex flex-col gap-3 min-h-[220px]">
            <h3 class="text-lg font-bold text-[var(--text-primary)] px-1">
                New Releases
            </h3>
            <div class="scroll-wrapper relative group/scroll">
                <button
                    class="scroll-btn left-0"
                    onclick={scrollLeft}
                    aria-label="Scroll left"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        ><path
                            d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                        /></svg
                    >
                </button>

                <div
                    class="horizontal-scroll flex gap-3 overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide px-1"
                >
                    {#if loadingReleases}
                        <div
                            class="flex flex-col items-center justify-center w-full h-32 gap-3 text-neutral-500"
                        >
                            <div
                                class="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin"
                            ></div>
                            <p class="text-sm">Loading new releases...</p>
                        </div>
                    {:else if newReleases.length > 0}
                        {#each newReleases as track}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                class="group relative flex flex-col gap-0 w-[140px] min-w-[140px] rounded-xl cursor-pointer transition-all hover:-translate-y-1 hover:z-20
                                       {activeMenu === track.id
                                    ? 'z-50'
                                    : 'z-0'}"
                                onclick={() => playTrack(track)}
                            >
                                <div
                                    class="relative w-full aspect-square overflow-hidden rounded-xl bg-[var(--bg-secondary)] shadow-lg"
                                >
                                    <img
                                        src={track.albumArt}
                                        alt={track.name}
                                        class="w-full h-full object-cover"
                                    />

                                    <!-- Overlay Play Button -->
                                    <div
                                        class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <button
                                            class="w-10 h-10 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center text-lg shadow-lg hover:scale-110 transition-transform"
                                            aria-label="Play {track.name}"
                                        >
                                            <svg
                                                width="16"
                                                height="16"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                ><path d="M8 5v14l11-7z" /></svg
                                            >
                                        </button>
                                    </div>

                                    <!-- Menu Button -->
                                    <button
                                        class="menu-btn-trigger absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/80 hover:scale-105 z-10
                                               {activeMenu === track.id
                                            ? 'opacity-100'
                                            : ''}"
                                        onclick={(e) => toggleMenu(track.id, e)}
                                        aria-label="More options"
                                    >
                                        <svg
                                            width="4"
                                            height="16"
                                            viewBox="0 0 4 16"
                                            fill="currentColor"
                                        >
                                            <circle cx="2" cy="2" r="1.5" />
                                            <circle cx="2" cy="8" r="1.5" />
                                            <circle cx="2" cy="14" r="1.5" />
                                        </svg>
                                    </button>
                                </div>

                                <div class="p-2 flex flex-col gap-0.5">
                                    <div
                                        class="font-semibold text-sm text-[var(--text-primary)] truncate"
                                        title={track.name}
                                    >
                                        {track.name}
                                    </div>
                                    <div
                                        class="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    >
                                        {track.artists}
                                    </div>
                                </div>

                                <!-- Menu Dropdown -->
                                {#if activeMenu === track.id}
                                    <div
                                        class="menu-dropdown absolute top-10 right-2 left-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-[100] overflow-hidden flex flex-col min-w-[150px]"
                                    >
                                        <button
                                            class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
                                            onclick={(e) =>
                                                addToQueue(track, e)}
                                        >
                                            <span>➕</span> Add to Queue
                                        </button>
                                        <button
                                            class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors"
                                            onclick={(e) =>
                                                openSaveModal(track, e)}
                                        >
                                            <span>💾</span> Save to Playlist
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    {:else}
                        <div
                            class="flex items-center justify-center w-full h-32 text-neutral-500 text-sm"
                        >
                            <p>No new releases available</p>
                        </div>
                    {/if}
                </div>

                <button
                    class="scroll-btn right-0"
                    onclick={scrollRight}
                    aria-label="Scroll right"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        ><path
                            d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                        /></svg
                    >
                </button>
            </div>
        </section>
    </div>
</div>
