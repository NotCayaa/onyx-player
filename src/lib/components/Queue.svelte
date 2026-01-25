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

<div class="queue">
  <div class="queue-header">
    <h2>Queue ({queue.length})</h2>
    {#if queue.length > 0}
      <button class="btn-secondary" onclick={onClear}>Clear</button>
    {/if}
  </div>

  <div class="queue-list">
    {#if queue.length > 0}
      {#each queue as track, index}
        <div
          class="queue-item"
          class:active={index === currentIndex}
          class:auto-queued={isAutoQueued(track.id)}
          onclick={() => onPlay(index, true)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPlay(index, true);
            }
          }}
          role="button"
          tabindex="0"
        >
          <img src={track.albumArt} alt={track.name} class="track-thumb" />
          <div class="track-info">
            <div class="track-name">{track.name}</div>
            <div class="track-artist">{track.artists}</div>
          </div>
          <div class="item-actions">
            <button
              class="btn-icon save-btn"
              onclick={(e) => {
                e.stopPropagation();
                onSave(track);
              }}
              title="Save to Playlist"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                />
              </svg>
            </button>
            <button
              class="btn-icon remove-btn"
              onclick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              title="Remove from Queue"
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
    {:else}
      <p class="empty-queue">Queue is empty</p>
    {/if}
  </div>
</div>

<style>
  .queue {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    height: 100%;
    overflow: hidden;
  }

  .queue-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .queue-header h2 {
    margin: 0;
  }

  .queue-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .queue-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .queue-item:hover {
    background: var(--bg-hover);
  }

  .queue-item.active {
    background: var(--bg-tertiary);
    border: 1px solid var(--accent-primary);
  }

  .track-thumb {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm);
    object-fit: cover;
  }

  .track-info {
    flex: 1;
    min-width: 0;
  }

  .track-name {
    font-weight: 500;
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

  .item-actions {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 var(--spacing-sm);
    background: linear-gradient(
      to right,
      transparent 0%,
      var(--bg-secondary) 20%,
      var(--bg-secondary) 100%
    );
    opacity: 0;
    transition: opacity var(--transition-fast);
    pointer-events: none;
    z-index: 10;
  }

  .queue-item:hover .item-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .queue-item.active .item-actions {
    background: linear-gradient(
      to right,
      transparent 0%,
      var(--bg-tertiary) 20%,
      var(--bg-tertiary) 100%
    );
  }

  .btn-icon svg {
    display: block;
  }

  .save-btn:hover {
    color: var(--accent);
  }

  .remove-btn {
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .queue-item:hover .remove-btn {
    opacity: 1;
  }

  .empty-queue {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-secondary);
  }

  /* Auto-queue recommendation styles */
  .auto-queued {
    opacity: 0.85;
    border-left: 2px solid var(--accent-primary);
  }
</style>
