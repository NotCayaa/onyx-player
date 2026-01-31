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
        class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
        onclick={handleBackdropClick}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[var(--bg-secondary)] border border-[var(--border)] backdrop-blur-3xl rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[slideUp_0.4s]"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <!-- Header -->
            <div
                class="p-8 pb-4 text-center relative border-b border-[var(--border-light)]"
            >
                <button
                    class="absolute top-4 right-4 p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    onclick={close}
                    aria-label="Close"
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        ><path
                            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                        /></svg
                    >
                </button>
                <h1
                    class="text-3xl font-bold text-[var(--text-primary)] mb-2 tracking-tight"
                >
                    Welcome to Onyx
                </h1>
                <p class="text-[var(--text-secondary)]">
                    Start listening to your favorite music
                </p>
            </div>

            <!-- Scrollable Content -->
            <div
                class="flex-1 overflow-y-auto p-8 pt-6 flex flex-col gap-8 custom-scrollbar"
            >
                <!-- Search Section -->
                <section class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <h3
                            class="text-lg font-bold text-[var(--text-primary)]"
                        >
                            Quick Search
                        </h3>
                        <!-- Search Type Toggle -->
                        <div
                            class="flex p-1 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-light)] filter backdrop-blur-md"
                        >
                            <button
                                class="px-3 py-1 text-xs font-semibold rounded-md transition-all {searchType ===
                                'spotify'
                                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                                onclick={() => (searchType = "spotify")}
                            >
                                Spotify
                            </button>
                            <button
                                class="px-3 py-1 text-xs font-semibold rounded-md transition-all {searchType ===
                                'youtube'
                                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                                onclick={() => (searchType = "youtube")}
                            >
                                YouTube
                            </button>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <div class="relative flex-1 group">
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                bind:value={searchQuery}
                                onkeydown={(e) =>
                                    e.key === "Enter" && handleSearch()}
                                class="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-light)] focus:bg-[var(--bg-secondary)] transition-all font-sans"
                            />
                            <div
                                class="absolute inset-0 rounded-xl ring-1 ring-[var(--border-light)] pointer-events-none group-focus-within:ring-[var(--border)] transition-all"
                            ></div>
                        </div>
                        <button
                            onclick={handleSearch}
                            class="bg-[var(--text-primary)] text-[var(--bg-primary)] px-6 py-3 rounded-xl font-bold hover:bg-[var(--text-secondary)] active:scale-95 transition-all shadow-lg"
                        >
                            Search
                        </button>
                    </div>

                    {#if isSearching}
                        <div
                            class="flex flex-col items-center justify-center py-8 gap-3 text-neutral-500"
                        >
                            <div
                                class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"
                            ></div>
                            <span class="text-sm">Searching...</span>
                        </div>
                    {:else if searchResults.length > 0}
                        <div class="flex flex-col gap-2 mt-2">
                            {#each searchResults.slice(0, 5) as track}
                                <div
                                    class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group"
                                >
                                    <img
                                        src={track.albumArt}
                                        alt={track.name}
                                        class="w-12 h-12 rounded-lg object-cover shadow-sm"
                                    />
                                    <div class="flex-1 min-w-0">
                                        <div
                                            class="text-[var(--text-primary)] font-medium truncate"
                                        >
                                            {track.name}
                                        </div>
                                        <div
                                            class="text-sm text-[var(--text-secondary)] truncate"
                                        >
                                            {track.artists}
                                        </div>
                                    </div>
                                    <button
                                        onclick={() =>
                                            handleTrackSelect(track, "play")}
                                        class="w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                                        aria-label="Play"
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path d="M8 5v14l11-7z" /></svg
                                        >
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </section>

                <!-- Recent Playlists -->
                {#if playlists.length > 0}
                    <section class="flex flex-col gap-3">
                        <h3
                            class="text-lg font-bold text-[var(--text-primary)]"
                        >
                            Your Playlists
                        </h3>
                        <div class="grid grid-cols-2 gap-2">
                            {#each playlists.slice(0, 4) as playlist}
                                <button
                                    class="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] hover:bg-[var(--bg-hover)] hover:border-[var(--border)] transition-all text-left group"
                                    onclick={() =>
                                        handlePlaylistClick(playlist)}
                                >
                                    {#if playlist.coverPath || (playlist.tracks && playlist.tracks.length > 0 && playlist.tracks[0].albumArt)}
                                        <img
                                            src={playlist.coverPath
                                                ? `http://localhost:3000${playlist.coverPath}`
                                                : playlist.tracks[0].albumArt}
                                            alt={playlist.name}
                                            class="w-10 h-10 rounded-lg object-cover shadow-sm"
                                        />
                                    {:else}
                                        <div
                                            class="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            <svg
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                ><path
                                                    d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                                /></svg
                                            >
                                        </div>
                                    {/if}
                                    <div class="flex-1 min-w-0">
                                        <div
                                            class="text-[var(--text-primary)] font-medium truncate text-sm"
                                        >
                                            {playlist.name}
                                        </div>
                                        <div
                                            class="text-xs text-[var(--text-secondary)]"
                                        >
                                            {playlist.tracks?.length || 0} tracks
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </section>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="p-6 border-t border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-between"
            >
                <label
                    class="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                    <input
                        type="checkbox"
                        bind:checked={dontShowAgain}
                        class="rounded border-[var(--border-light)] bg-[var(--bg-secondary)] checked:bg-[var(--text-primary)] text-[var(--bg-primary)] focus:ring-0 checked:border-[var(--text-primary)]"
                    />
                    <span>Don't show for now</span>
                </label>
                <button
                    class="text-[var(--text-primary)] hover:text-[var(--text-primary)]/80 font-medium text-sm px-4 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-all border border-transparent hover:border-[var(--border-light)]"
                    onclick={() => close("browse")}
                >
                    Browse Full Library →
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Custom Scrollbar for this component */
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    /* Animation */
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
</style>
