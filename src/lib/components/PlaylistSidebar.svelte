<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { api } from "../api.js";
    import { toast } from "../stores/toast.js";
    import ConfirmationModal from "./ConfirmationModal.svelte";
    import PlaylistEditor from "./PlaylistEditor.svelte";

    const dispatch = createEventDispatcher();

    let playlists = [];
    let newPlaylistName = "";
    let isCreating = false;
    let editMode = false;

    onMount(async () => {
        await loadPlaylists();
    });

    async function loadPlaylists() {
        try {
            playlists = await api.getPlaylists();
        } catch (err) {
            console.error("Failed to load playlists", err);
        }
    }

    async function createPlaylist() {
        console.log("Attempting to create playlist:", newPlaylistName);
        if (!newPlaylistName.trim()) {
            console.log("Empty name, aborting.");
            return;
        }

        try {
            const playlist = await api.createPlaylist(newPlaylistName);
            console.log("Playlist created:", playlist);
            playlists = [...playlists, playlist];
            newPlaylistName = "";
            isCreating = false;
            toast.success("Playlist created!");
        } catch (err) {
            console.error("Failed to create playlist", err);
            toast.error("Error creating playlist: " + err.message);
        }
    }

    let showDeleteModal = false;
    let playlistToDelete = null;

    function promptDelete(playlist) {
        playlistToDelete = playlist;
        showDeleteModal = true;
    }

    async function confirmDelete() {
        if (!playlistToDelete) return;

        try {
            await api.deletePlaylist(playlistToDelete.id);
            playlists = playlists.filter((p) => p.id !== playlistToDelete.id);
            toast.success("Playlist deleted");
        } catch (err) {
            console.error("Failed to delete playlist", err);
            toast.error("Failed to delete playlist");
        } finally {
            showDeleteModal = false;
            playlistToDelete = null;
        }
    }

    function cancelDelete() {
        showDeleteModal = false;
        playlistToDelete = null;
    }

    function viewPlaylist(playlist) {
        dispatch("view", playlist);
    }

    let showEditor = false;
    let playlistToEdit = null;

    function openEditor(playlist) {
        if (playlist.type === "link") {
            toast.error("Cannot edit external playlists");
            return;
        }
        playlistToEdit = playlist;
        showEditor = true;
    }

    function closeEditor() {
        showEditor = false;
        playlistToEdit = null;
        loadPlaylists();
    }

    function movePlaylistUp(index) {
        if (index === 0) return;
        const newPlaylists = [...playlists];
        [newPlaylists[index - 1], newPlaylists[index]] = [
            newPlaylists[index],
            newPlaylists[index - 1],
        ];
        playlists = newPlaylists;
        // TODO: Save order to backend
    }

    function movePlaylistDown(index) {
        if (index === playlists.length - 1) return;
        const newPlaylists = [...playlists];
        [newPlaylists[index], newPlaylists[index + 1]] = [
            newPlaylists[index + 1],
            newPlaylists[index],
        ];
        playlists = newPlaylists;
        // TODO: Save order to backend
    }
</script>

<div class="flex flex-col h-full w-full overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 pb-2">
        <h3
            class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest pl-2"
        >
            Playlists
        </h3>
        <div class="flex gap-1">
            <button
                class="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-all"
                aria-label="Edit Playlists"
                onclick={() => (editMode = !editMode)}
                title={editMode ? "Done Editing" : "Edit Playlists"}
            >
                {#if editMode}
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
                        />
                    </svg>
                {:else}
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                        />
                    </svg>
                {/if}
            </button>
            <button
                class="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-all"
                aria-label="Create Playlist"
                onclick={() => (isCreating = !isCreating)}
                title="Create New Playlist"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
            </button>
        </div>
    </div>

    <!-- Create Form -->
    {#if isCreating}
        <div
            class="mx-4 mb-2 p-1 bg-[var(--bg-hover)] rounded-lg flex items-center border border-[var(--border)]"
        >
            <!-- svelte-ignore a11y-autofocus -->
            <input
                type="text"
                placeholder="Name..."
                bind:value={newPlaylistName}
                onkeydown={(e) => e.key === "Enter" && createPlaylist()}
                class="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm px-2 py-1 focus:outline-none placeholder:text-[var(--text-muted)]"
                autoFocus
            />
            <button
                class="bg-[var(--text-primary)] text-[var(--bg-primary)] px-3 py-1 rounded text-xs font-bold hover:opacity-80 transition-opacity"
                onclick={createPlaylist}
            >
                Add
            </button>
        </div>
    {/if}

    <!-- Playlist List -->
    <div
        class="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-0.5 custom-scrollbar w-full"
    >
        {#if playlists.length === 0}
            <div
                class="text-center p-4 text-sm text-[var(--text-muted)] italic"
            >
                No playlists yet
            </div>
        {:else}
            {#each playlists as playlist}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="group relative flex items-center rounded-xl bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all p-2 cursor-pointer mb-2"
                    class:bg-white-10={false}
                >
                    <button
                        class="flex-1 flex items-center gap-3 text-left overflow-hidden"
                        onclick={() => viewPlaylist(playlist)}
                    >
                        <!-- Cover/Icon -->
                        {#if playlist.type !== "link" && (playlist.coverPath || (playlist.tracks && playlist.tracks.length > 0 && playlist.tracks[0].albumArt))}
                            <img
                                src={playlist.coverPath
                                    ? `http://localhost:3000${playlist.coverPath}`
                                    : playlist.tracks[0].albumArt}
                                alt={playlist.name}
                                class="w-14 h-14 rounded-lg object-cover shadow-md flex-shrink-0"
                            />
                        {:else}
                            <div
                                class="w-14 h-14 rounded-lg bg-[var(--bg-active)] flex items-center justify-center flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors"
                            >
                                {#if playlist.type === "link"}
                                    <svg
                                        width="28"
                                        height="28"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                                        />
                                    </svg>
                                {:else}
                                    <svg
                                        width="28"
                                        height="28"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                        />
                                    </svg>
                                {/if}
                            </div>
                        {/if}
                        <span
                            class="text-base font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors"
                        >
                            {playlist.name}
                        </span>
                    </button>

                    <!-- Edit Controls -->
                    {#if editMode && playlist.type !== "link"}
                        <div
                            class="flex items-center gap-1 ml-2"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <button
                                class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
                                onclick={() =>
                                    movePlaylistUp(playlists.indexOf(playlist))}
                                disabled={playlists.indexOf(playlist) === 0}
                                title="Move up"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path d="M7 14l5-5 5 5z" /></svg
                                >
                            </button>
                            <button
                                class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
                                onclick={() =>
                                    movePlaylistDown(
                                        playlists.indexOf(playlist),
                                    )}
                                disabled={playlists.indexOf(playlist) ===
                                    playlists.length - 1}
                                title="Move down"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path d="M7 10l5 5 5-5z" /></svg
                                >
                            </button>
                            <button
                                class="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--bg-active)] transition-colors"
                                onclick={() => promptDelete(playlist)}
                                aria-label="Delete Playlist"
                                title="Delete Playlist"
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path
                                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                    /></svg
                                >
                            </button>
                        </div>
                    {:else}
                        <!-- Count -->
                        <div
                            class="ml-auto text-xs text-[var(--text-muted)] font-mono tracking-wider tabular-nums group-hover:text-[var(--text-secondary)]"
                        >
                            {playlist.tracks?.length || 0}
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>
</div>

<ConfirmationModal
    isOpen={showDeleteModal}
    title="Delete Playlist"
    message={`Are you sure you want to delete "${playlistToDelete?.name || "this playlist"}"?`}
    on:confirm={confirmDelete}
    on:cancel={cancelDelete}
/>

{#if showEditor}
    <PlaylistEditor bind:playlist={playlistToEdit} on:close={closeEditor} />
{/if}

<style>
    /* Custom Scrollbar */
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: var(--text-muted);
    }
</style>
