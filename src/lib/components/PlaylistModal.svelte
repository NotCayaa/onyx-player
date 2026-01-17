<script>
    import { api } from "../api.js";
    import { createEventDispatcher } from "svelte";
    import { fade, fly } from "svelte/transition";

    export let playlist = null;
    export let isOpen = false;

    const dispatch = createEventDispatcher();

    let editMode = false;
    let playlistName = "";
    let tracks = [];
    let coverPreview = null;
    let isUploading = false;

    $: if (playlist) {
        playlistName = playlist.name || "";
        tracks = playlist.tracks || [];
        coverPreview = playlist.coverPath
            ? `http://localhost:3000${playlist.coverPath}`
            : null;
    }

    function close() {
        editMode = false;
        dispatch("close");
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function playAll() {
        if (tracks.length > 0) {
            dispatch("play", { tracks });
            close();
        }
    }

    function playTrack(track) {
        dispatch("playTrack", track);
        close();
    }

    function toggleEditMode() {
        editMode = !editMode;
    }

    async function handleCoverUpload(event) {
        const file = event.target.files?.[0];
        if (!file || !playlist) return;

        isUploading = true;
        try {
            const formData = new FormData();
            formData.append("cover", file);

            const result = await api.uploadPlaylistCover(playlist.id, formData);

            // Update preview
            coverPreview = `http://localhost:3000${result.coverPath}`;

            // Update playlist object
            playlist.coverPath = result.coverPath;
        } catch (err) {
            console.error("Cover upload failed:", err);
        } finally {
            isUploading = false;
        }
    }

    async function saveChanges() {
        if (!playlist) return;

        try {
            // Update playlist name and tracks
            await api.updatePlaylist(playlist.id, {
                name: playlistName,
                tracks: tracks,
            });

            // Update local object
            playlist.name = playlistName;
            playlist.tracks = tracks;

            editMode = false;
        } catch (err) {
            console.error("Failed to save changes:", err);
        }
    }

    function deleteTrack(index) {
        tracks = tracks.filter((_, i) => i !== index);
    }

    function moveTrackUp(index) {
        if (index === 0) return;
        const newTracks = [...tracks];
        [newTracks[index - 1], newTracks[index]] = [
            newTracks[index],
            newTracks[index - 1],
        ];
        tracks = newTracks;
    }

    function moveTrackDown(index) {
        if (index === tracks.length - 1) return;
        const newTracks = [...tracks];
        [newTracks[index], newTracks[index + 1]] = [
            newTracks[index + 1],
            newTracks[index],
        ];
        tracks = newTracks;
    }
</script>

{#if isOpen && playlist}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="modal-backdrop"
        onclick={handleBackdropClick}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="playlist-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Playlist details"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <!-- Header with close button -->
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

            <!-- Cover & Info -->
            <div class="playlist-header">
                <div class="cover-section">
                    {#if coverPreview}
                        <img
                            src={coverPreview}
                            alt={playlist.name}
                            class="cover-image"
                        />
                    {:else}
                        <div class="cover-placeholder">
                            <svg
                                width="64"
                                height="64"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                />
                            </svg>
                        </div>
                    {/if}

                    {#if editMode}
                        <label class="upload-btn">
                            {isUploading ? "Uploading..." : "Change Cover"}
                            <input
                                type="file"
                                accept="image/*"
                                onchange={handleCoverUpload}
                                disabled={isUploading}
                                style="display: none;"
                            />
                        </label>
                    {/if}
                </div>

                <div class="info-section">
                    {#if editMode}
                        <input
                            type="text"
                            bind:value={playlistName}
                            class="playlist-name-input"
                            placeholder="Playlist name"
                        />
                    {:else}
                        <h2>{playlist.name}</h2>
                    {/if}
                    <p class="track-count">{tracks.length} tracks</p>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="action-buttons">
                {#if !editMode}
                    <button class="btn-play-all" onclick={playAll}>
                        Play All
                    </button>
                    <button class="btn-edit" onclick={toggleEditMode}>
                        Edit
                    </button>
                {:else}
                    <button class="btn-save" onclick={saveChanges}>
                        Save Changes
                    </button>
                    <button class="btn-cancel" onclick={toggleEditMode}>
                        Cancel
                    </button>
                {/if}
            </div>

            <!-- Track List -->
            <div class="track-list">
                {#if tracks.length === 0}
                    <p class="empty-state">No tracks in this playlist</p>
                {:else}
                    {#each tracks as track, index}
                        <div class="track-item">
                            {#if editMode}
                                <div class="track-controls">
                                    <button
                                        class="btn-move"
                                        onclick={() => moveTrackUp(index)}
                                        disabled={index === 0}
                                        title="Move up"
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M7 14l5-5 5 5z" />
                                        </svg>
                                    </button>
                                    <button
                                        class="btn-move"
                                        onclick={() => moveTrackDown(index)}
                                        disabled={index === tracks.length - 1}
                                        title="Move down"
                                    >
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M7 10l5 5 5-5z" />
                                        </svg>
                                    </button>
                                </div>
                            {/if}
                            <img
                                src={track.albumArt}
                                alt={track.name}
                                class="track-art"
                            />
                            <div class="track-info">
                                <div class="track-name">{track.name}</div>
                                <div class="track-artist">{track.artists}</div>
                            </div>

                            {#if editMode}
                                <button
                                    class="btn-delete"
                                    onclick={() => deleteTrack(index)}
                                    aria-label="Delete track"
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                        />
                                    </svg>
                                </button>
                            {:else}
                                <button
                                    class="btn-play-track"
                                    onclick={() => playTrack(track)}
                                    aria-label="Play {track.name}"
                                >
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </button>
                            {/if}
                        </div>
                    {/each}
                {/if}
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

    .playlist-modal {
        position: relative;
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 600px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .close-btn {
        position: absolute;
        top: var(--spacing-md);
        right: var(--spacing-md);
        background: var(--bg-tertiary);
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-xs);
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        z-index: 10;
    }

    .close-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .playlist-header {
        display: flex;
        gap: var(--spacing-lg);
        padding: var(--spacing-xl);
        border-bottom: 1px solid var(--bg-tertiary);
    }

    .cover-section {
        position: relative;
        flex-shrink: 0;
    }

    .cover-image,
    .cover-placeholder {
        width: 160px;
        height: 160px;
        border-radius: var(--radius-md);
        object-fit: cover;
    }

    .cover-placeholder {
        background: var(--bg-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
    }

    .upload-btn {
        margin-top: var(--spacing-sm);
        display: block;
        background: var(--accent-primary);
        color: white;
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: background 0.2s;
    }

    .upload-btn:hover {
        background: var(--accent-hover);
    }

    .info-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
    }

    .info-section h2 {
        margin: 0 0 var(--spacing-xs) 0;
        font-size: 1.75rem;
        color: var(--text-primary);
        word-wrap: break-word;
    }

    .playlist-name-input {
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        font-size: 1.75rem;
        font-weight: 600;
        margin-bottom: var(--spacing-xs);
    }

    .playlist-name-input:focus {
        outline: none;
        border-color: var(--accent-primary);
    }

    .track-count {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.95rem;
    }

    .action-buttons {
        display: flex;
        gap: var(--spacing-sm);
        padding: var(--spacing-lg) var(--spacing-xl);
        border-bottom: 1px solid var(--bg-tertiary);
    }

    .btn-play-all {
        flex: 1;
        background: var(--accent-primary);
        color: white;
        border: none;
        padding: var(--spacing-md) var(--spacing-lg);
        border-radius: var(--radius-md);
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-sm);
        transition: all 0.2s;
    }

    .btn-play-all:hover {
        background: var(--accent-hover);
        transform: translateY(-1px);
    }

    .btn-edit,
    .btn-save,
    .btn-cancel {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: none;
        padding: var(--spacing-md) var(--spacing-lg);
        border-radius: var(--radius-md);
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-xs);
    }

    .btn-edit:hover,
    .btn-save:hover {
        background: var(--bg-hover);
    }

    .btn-save {
        flex: 1;
        background: var(--accent-primary);
        color: white;
    }

    .btn-save:hover {
        background: var(--accent-hover);
    }

    .btn-cancel:hover {
        background: var(--bg-hover);
    }

    .track-list {
        flex: 1;
        overflow-y: auto;
        padding: var(--spacing-md) var(--spacing-xl);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: var(--spacing-xl);
        margin: 0;
    }

    .track-item {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        transition: background 0.2s;
    }

    .track-item:hover {
        background: var(--bg-hover);
    }

    .track-art {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-sm);
        object-fit: cover;
        flex-shrink: 0;
    }

    .track-controls {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .btn-move {
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

    .btn-move:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .btn-move:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .track-info {
        flex: 1;
        min-width: 0;
    }

    .track-name {
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .track-artist {
        font-size: 0.875rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .btn-play-track,
    .btn-delete {
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

    .btn-play-track:hover {
        background: var(--accent-primary);
        color: white;
    }

    .btn-delete:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
</style>
