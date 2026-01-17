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

<div class="playlist-sidebar">
    <div class="header">
        <h3>Your Playlists</h3>
        <div class="header-actions">
            <button
                class="btn-icon"
                aria-label="Edit Playlists"
                onclick={() => (editMode = !editMode)}
                title={editMode ? "Done Editing" : "Edit Playlists"}
            >
                {#if editMode}
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
                        />
                    </svg>
                {:else}
                    <svg
                        width="20"
                        height="20"
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
                class="btn-icon"
                aria-label="Create Playlist"
                onclick={() => (isCreating = !isCreating)}
                title="Create New Playlist"
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
        </div>
    </div>

    {#if isCreating}
        <div class="create-form">
            <input
                type="text"
                placeholder="Playlist Name"
                bind:value={newPlaylistName}
                onkeydown={(e) => e.key === "Enter" && createPlaylist()}
                class="input-text"
            />
            <button class="btn-text" onclick={createPlaylist}>Add</button>
        </div>
    {/if}

    <div class="playlist-list">
        {#if playlists.length === 0}
            <div class="empty-state">No playlists yet</div>
        {:else}
            {#each playlists as playlist}
                <div class="playlist-item">
                    <button
                        class="playlist-name"
                        onclick={() => viewPlaylist(playlist)}
                    >
                        <span class="icon">
                            {#if playlist.type === "link"}
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                                    />
                                </svg>
                            {:else}
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                    />
                                </svg>
                            {/if}
                        </span>
                        {playlist.name}
                    </button>

                    {#if editMode && playlist.type !== "link"}
                        <div class="playlist-controls">
                            <button
                                class="btn-move-playlist"
                                onclick={() =>
                                    movePlaylistUp(playlists.indexOf(playlist))}
                                disabled={playlists.indexOf(playlist) === 0}
                                title="Move up"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M7 14l5-5 5 5z" />
                                </svg>
                            </button>
                            <button
                                class="btn-move-playlist"
                                onclick={() =>
                                    movePlaylistDown(
                                        playlists.indexOf(playlist),
                                    )}
                                disabled={playlists.indexOf(playlist) ===
                                    playlists.length - 1}
                                title="Move down"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path d="M7 10l5 5 5-5z" />
                                </svg>
                            </button>
                        </div>
                        <button
                            class="delete-btn"
                            onclick={() => promptDelete(playlist)}
                            aria-label="Delete Playlist"
                            title="Delete Playlist"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                />
                            </svg>
                        </button>
                    {:else}
                        <span class="count"
                            >({playlist.tracks?.length || 0})</span
                        >
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
    .playlist-sidebar {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
        height: 100%;
        overflow: hidden;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-right: var(--spacing-sm);
    }

    .header-actions {
        display: flex;
        gap: var(--spacing-xs);
    }

    h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--text-primary);
    }

    .create-form {
        display: flex;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
    }

    .input-text {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.9rem;
        outline: none;
    }

    .btn-text {
        background: var(--accent-primary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        padding: 2px 8px;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .playlist-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .empty-state {
        color: var(--text-secondary);
        font-size: 0.9rem;
        font-style: italic;
        padding: var(--spacing-sm);
    }

    .playlist-item {
        display: flex;
        align-items: center;
        border-radius: var(--radius-md);
        transition: background 0.2s;
        padding: var(--spacing-xs) var(--spacing-sm);
        gap: var(--spacing-sm);
    }

    .playlist-item:hover {
        background: var(--bg-tertiary);
    }

    .playlist-name {
        flex: 1;
        background: none;
        border: none;
        color: var(--text-secondary);
        text-align: left;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.95rem;
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        min-height: 32px;
    }

    .playlist-name:hover {
        color: var(--text-primary);
    }

    .icon {
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon svg {
        display: block;
    }

    .count {
        font-size: 0.8rem;
        opacity: 0.5;
        flex-shrink: 0;
        margin-left: 0;
    }

    .btn-icon:hover {
        color: var(--text-primary);
        background: var(--bg-tertiary);
    }

    .delete-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-xs);
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .delete-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border);
    }

    .playlist-controls {
        display: flex;
        gap: 4px;
    }

    .btn-move-playlist {
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-secondary);
        cursor: pointer;
        padding: 2px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .btn-move-playlist:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .btn-move-playlist:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
</style>
