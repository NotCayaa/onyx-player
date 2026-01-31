<script>
  export let queue = [];
  export let currentIndex = 0;
  export let autoQueueTrackIds = []; // Track IDs that were auto-added as recommendations
  export let onPlay = (index, isFromQueueClick) => {};
  export let onRemove = (index) => {};
  export let onClear = () => {};
  export let onSave = (track) => {};

  // Check if a track is auto-added recommendation
  function isAutoQueued(trackId) {
    return autoQueueTrackIds.includes(trackId);
  }
</script>

<div class="flex flex-col h-full p-4">
  <div class="flex justify-between items-center mb-3 flex-shrink-0">
    <span class="text-[var(--text-muted)] text-sm">{queue.length} tracks</span>
    {#if queue.length > 0}
      <button
        class="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] px-3 py-1.5 rounded-lg transition-colors"
        onclick={onClear}
      >
        Clear All
      </button>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-1">
    {#if queue.length > 0}
      {#each queue as track, index}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="group relative flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all border border-transparent
                 {index === currentIndex
            ? 'bg-[var(--bg-active)] border-[var(--border)] shadow-lg'
            : 'hover:bg-[var(--bg-hover)]'}
                 {isAutoQueued(track.id)
            ? 'pl-1 border-l-2 border-l-[var(--text-muted)] bg-[var(--bg-hover)]'
            : ''}"
          onclick={() => onPlay(index, true)}
          role="button"
          tabindex="0"
        >
          <!-- Thumb -->
          <div
            class="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--bg-secondary)]"
          >
            <img
              src={track.albumArt}
              alt={track.name}
              class="w-full h-full object-cover"
            />
            {#if index === currentIndex}
              <div
                class="absolute inset-0 bg-black/40 flex items-center justify-center"
              >
                <div
                  class="w-1 h-3 bg-[var(--text-primary)] mx-[1px] animate-[bounce_1s_infinite]"
                ></div>
                <div
                  class="w-1 h-4 bg-[var(--text-primary)] mx-[1px] animate-[bounce_1.2s_infinite]"
                ></div>
                <div
                  class="w-1 h-2 bg-[var(--text-primary)] mx-[1px] animate-[bounce_0.8s_infinite]"
                ></div>
              </div>
            {/if}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0 flex flex-col justify-center">
            <div
              class="text-sm font-medium truncate {index === currentIndex
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'}"
            >
              {track.name}
            </div>
            <div class="text-xs text-[var(--text-muted)] truncate">
              {track.artists}
            </div>
          </div>

          <!-- Actions (Hover Only) -->
          <div
            class="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-secondary)] backdrop-blur-sm rounded-lg p-1 backdrop-filter"
          >
            <button
              class="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              onclick={(e) => {
                e.stopPropagation();
                onSave(track);
              }}
              title="Save to Playlist"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                ><path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                /></svg
              >
            </button>
            <button
              class="p-1.5 text-[var(--text-muted)] hover:text-red-400 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              onclick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              title="Remove from Queue"
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
        </div>
      {/each}
    {:else}
      <div
        class="flex flex-col items-center justify-center h-40 text-[var(--text-muted)] gap-2"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="opacity-20"
          ><path
            d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
          /></svg
        >
        <p class="text-sm">Queue is empty</p>
      </div>
    {/if}
  </div>
</div>
