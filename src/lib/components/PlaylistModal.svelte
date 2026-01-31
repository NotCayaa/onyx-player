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
        class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 transition-all duration-200"
        onclick={handleBackdropClick}
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[var(--bg-secondary)] border border-[var(--border)] backdrop-blur-3xl rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[slideUp_0.4s] relative"
            role="dialog"
            aria-modal="true"
            aria-label="Playlist details"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <!-- Close Button -->
            <button
                class="absolute top-4 right-4 p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-colors z-20"
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

            <!-- Header Section -->
            <div
                class="p-8 pb-6 border-b border-[var(--border)] flex gap-6 items-start bg-[var(--bg-tertiary)]"
            >
                <!-- Cover Image -->
                <div class="relative flex-shrink-0 group">
                    <div
                        class="w-40 h-40 rounded-xl overflow-hidden shadow-lg bg-[var(--bg-active)] flex items-center justify-center border border-[var(--border)]"
                    >
                        {#if coverPreview}
                            <img
                                src={coverPreview}
                                alt={playlist.name}
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            <svg
                                width="48"
                                height="48"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                class="text-neutral-600"
                            >
                                <path
                                    d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                                />
                            </svg>
                        {/if}
                    </div>

                    {#if editMode}
                        <label
                            class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-xl"
                        >
                            <span
                                class="text-xs font-bold text-white bg-white/20 px-3 py-1 rounded-full backdrop-blur-md"
                            >
                                {isUploading ? "Uploading..." : "Change Cover"}
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                onchange={handleCoverUpload}
                                disabled={isUploading}
                                class="hidden"
                            />
                        </label>
                    {/if}
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0 pt-2">
                    {#if editMode}
                        <!-- svelte-ignore a11y-autofocus -->
                        <input
                            type="text"
                            bind:value={playlistName}
                            class="w-full bg-[var(--bg-active)] border border-[var(--border)] rounded-lg px-3 py-2 text-2xl font-bold text-[var(--text-primary)] mb-2 focus:outline-none focus:border-[var(--border-light)] transition-colors"
                            placeholder="Playlist name"
                            autoFocus
                        />
                    {:else}
                        <h2
                            class="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-2 truncate"
                        >
                            {playlist.name}
                        </h2>
                    {/if}
                    <p class="text-[var(--text-muted)] font-medium text-sm">
                        {tracks.length} tracks
                    </p>

                    <!-- Actions -->
                    <div class="flex gap-3 mt-6">
                        {#if !editMode}
                            <button
                                class="flex-1 bg-[var(--text-primary)] text-[var(--bg-primary)] px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                                onclick={playAll}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path d="M8 5v14l11-7z" /></svg
                                >
                                Play All
                            </button>
                            <button
                                class="px-6 py-2.5 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-active)] transition-colors border border-[var(--border)]"
                                onclick={toggleEditMode}
                            >
                                Edit
                            </button>
                        {:else}
                            <button
                                class="flex-1 bg-[var(--text-primary)] text-[var(--bg-primary)] px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity"
                                onclick={saveChanges}
                            >
                                Save Changes
                            </button>
                            <button
                                class="px-6 py-2.5 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-active)] transition-colors border border-[var(--border)]"
                                onclick={toggleEditMode}
                            >
                                Cancel
                            </button>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Track List -->
            <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {#if tracks.length === 0}
                    <div class="text-center py-12 text-neutral-500 italic">
                        No tracks in this playlist
                    </div>
                {:else}
                    <div class="flex flex-col gap-1">
                        {#each tracks as track, index}
                            <div
                                class="group flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 transition-colors"
                            >
                                {#if editMode}
                                    <div class="flex flex-col gap-1 pr-2">
                                        <button
                                            class="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] disabled:opacity-30"
                                            onclick={() => moveTrackUp(index)}
                                            disabled={index === 0}
                                            aria-label="Move track up"
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                ><path
                                                    d="M7 14l5-5 5 5z"
                                                /></svg
                                            >
                                        </button>
                                        <button
                                            class="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] disabled:opacity-30"
                                            onclick={() => moveTrackDown(index)}
                                            disabled={index ===
                                                tracks.length - 1}
                                            aria-label="Move track down"
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                                ><path
                                                    d="M7 10l5 5 5-5z"
                                                /></svg
                                            >
                                        </button>
                                    </div>
                                {/if}

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

                                {#if editMode}
                                    <button
                                        class="p-2 rounded-full text-[var(--text-secondary)] hover:text-red-400 hover:bg-[var(--bg-active)] transition-colors"
                                        onclick={() => deleteTrack(index)}
                                        aria-label="Delete track"
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path
                                                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                            /></svg
                                        >
                                    </button>
                                {:else}
                                    <button
                                        class="p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110"
                                        onclick={() => playTrack(track)}
                                        aria-label="Play track"
                                    >
                                        <svg
                                            width="24"
                                            height="24"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path d="M8 5v14l11-7z" /></svg
                                        >
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Custom Scrollbar */
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
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
