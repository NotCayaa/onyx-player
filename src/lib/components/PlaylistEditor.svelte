<script>
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { api } from "../api.js";
    import { toast } from "../stores/toast.js";

    export let playlist = null;

    const dispatch = createEventDispatcher();
    let isLoading = false;

    function close() {
        dispatch("close");
    }

    async function removeTrack(index) {
        if (!playlist) return;
        try {
            const updated = await api.removeTrackFromPlaylist(
                playlist.id,
                index,
            );
            if (updated.error) throw new Error(updated.error);
            playlist = updated;
            toast.success("Track removed");
        } catch (err) {
            toast.error("Failed to remove track: " + err.message);
        }
    }

    async function moveTrack(index, direction) {
        if (!playlist) return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= playlist.tracks.length) return;

        try {
            // Optimistic update
            const tracks = [...playlist.tracks];
            const [track] = tracks.splice(index, 1);
            tracks.splice(newIndex, 0, track);
            playlist.tracks = tracks;

            const updated = await api.reorderPlaylist(
                playlist.id,
                index,
                newIndex,
            );
            if (updated.error) {
                // Revert on error
                playlist = await api
                    .getPlaylists()
                    .then((ps) => ps.find((p) => p.id === playlist.id));
                throw new Error(updated.error);
            }
            playlist = updated;
        } catch (err) {
            toast.error("Failed to reorder: " + err.message);
        }
    }

    let isEditingName = false;
    let editedName = "";

    function startEditName() {
        editedName = playlist?.name || "";
        isEditingName = true;
    }

    async function saveName() {
        if (!editedName.trim()) {
            toast.error("Playlist name cannot be empty");
            return;
        }
        try {
            const updated = await api.updatePlaylist(playlist.id, {
                name: editedName,
            });
            playlist.name = updated.name;
            isEditingName = false;
            toast.success("Playlist renamed!");
        } catch (err) {
            toast.error("Failed to rename: " + err.message);
        }
    }

    function cancelEditName() {
        isEditingName = false;
        editedName = "";
    }
</script>

<div
    class="modal-overlay"
    transition:fade={{ duration: 200 }}
    onclick={close}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            close();
        }
    }}
>
    <div
        class="modal"
        transition:scale={{ duration: 200, start: 0.95 }}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
    >
        <div class="modal-header">
            {#if isEditingName}
                <div class="name-edit">
                    <input
                        type="text"
                        bind:value={editedName}
                        class="name-input"
                        placeholder="Playlist name"
                    />
                    <button class="btn-save" onclick={saveName}>✓</button>
                    <button class="btn-cancel-name" onclick={cancelEditName}
                        >✕</button
                    >
                </div>
            {:else}
                <div class="name-display">
                    <h3>{playlist?.name}</h3>
                    <button
                        class="btn-edit-name"
                        onclick={startEditName}
                        title="Edit Name"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                            />
                        </svg>
                    </button>
                </div>
            {/if}
            <button class="close-btn" onclick={close} aria-label="Close">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                    />
                </svg>
            </button>
        </div>

        <div class="track-list">
            {#if playlist?.tracks.length === 0}
                <p class="empty">No tracks in this playlist.</p>
            {:else}
                {#each playlist.tracks as track, i (track.id + i)}
                    <div class="track-row">
                        <div class="track-info">
                            <span class="track-name">{track.name}</span>
                            <span class="track-artist">{track.artist}</span>
                        </div>
                        <div class="actions">
                            <button
                                class="action-btn"
                                disabled={i === 0}
                                onclick={() => moveTrack(i, -1)}
                                title="Move Up"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                                    />
                                </svg>
                            </button>
                            <button
                                class="action-btn"
                                disabled={i === playlist.tracks.length - 1}
                                onclick={() => moveTrack(i, 1)}
                                title="Move Down"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                >
                                    <path
                                        d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                                    />
                                </svg>
                            </button>
                            <button
                                class="action-btn delete"
                                onclick={() => removeTrack(i)}
                                title="Remove Track"
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
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>

<style>
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
        width: 100%;
        max-width: 500px;
        max-height: 80vh;
        border-radius: var(--radius-lg);
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        border: 1px solid var(--border);
    }

    .modal-header {
        padding: var(--spacing-md);
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .name-display {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        flex: 1;
    }

    .name-display h3 {
        margin: 0;
        font-size: 1.1rem;
    }

    .btn-edit-name {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
    }

    .btn-edit-name:hover {
        color: var(--accent);
        background: var(--bg-hover);
    }

    .name-edit {
        display: flex;
        gap: var(--spacing-xs);
        flex: 1;
        align-items: center;
    }

    .name-input {
        flex: 1;
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        font-family: inherit;
        font-size: 1rem;
    }

    .name-input:focus {
        outline: none;
        border-color: var(--accent);
    }

    .btn-save,
    .btn-cancel-name {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .btn-save:hover {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
    }

    .btn-cancel-name:hover {
        background: #ff4444;
        border-color: #ff4444;
        color: white;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }

    .close-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .close-btn:hover {
        color: var(--text-primary);
    }

    .track-list {
        padding: var(--spacing-sm);
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .track-row {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: 8px;
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
    }

    .track-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    .track-name {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .track-artist {
        font-size: 0.8rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .actions {
        display: flex;
        gap: 4px;
    }

    .action-btn {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        width: 28px;
        height: 28px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-size: 0.9rem;
    }

    .action-btn:hover:not(:disabled) {
        border-color: var(--text-primary);
        color: var(--text-primary);
        background: var(--bg-hover);
    }

    .action-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .action-btn svg {
        display: block;
    }

    .action-btn.delete:hover {
        border-color: #ff4444;
        color: #ff4444;
        background: rgba(255, 68, 68, 0.1);
    }

    .empty {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--spacing-xl);
    }
</style>
