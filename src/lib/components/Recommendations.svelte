<script context="module">
  // Cache to persist across tab switches (component unmounts)
  let recCache = {
    trackId: null,
    data: [],
  };
</script>

<script>
  import { api } from "../api.js";
  import { onMount } from "svelte";

  export let track = null; // Changed from trackId to full track object
  export let onPlay = (track) => {};
  export let onAdd = (track) => {}; // Add to queue handler
  export let onSave = (track) => {}; // Save to playlist handler
  export let horizontal = false;

  let recommendations = [];
  let isLoading = false;
  let activeMenu = null; // Track ID with open menu

  async function loadRecommendations() {
    if (!track || !track.id) return;

    // Check cache first (Fix: Recs refreshing on tab switch)
    if (recCache.trackId === track.id && recCache.data.length > 0) {
      recommendations = recCache.data;
      return;
    }

    isLoading = true;
    try {
      // Pass isYouTube flag and metadata for better search fallback
      const options = {
        limit: 10,
        isYouTube: track.isYouTube || false,
        name: track.name,
        artist: track.artists || track.artist,
      };

      const data = await api.getRecommendations(track.id, options);
      if (data.error) {
        console.warn("Recommendations not available:", data.error);
        recommendations = [];
      } else {
        recommendations = data.tracks || [];
        // Update cache
        recCache = {
          trackId: track.id,
          data: recommendations,
        };
      }
    } catch (error) {
      console.error("Recommendations error:", error);
      recommendations = [];
    } finally {
      isLoading = false;
    }
  }

  function playTrack(track) {
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

  onMount(() => {
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

  function formatTime(ms) {
    if (!ms) return "0:00";
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const mDisplay = h > 0 ? m.toString().padStart(2, "0") : m.toString();
    const sDisplay = s.toString().padStart(2, "0");
    return h > 0 ? `${h}:${mDisplay}:${sDisplay}` : `${mDisplay}:${sDisplay}`;
  }

  $: if (track && track.id) {
    loadRecommendations();
  }
</script>

{#if horizontal}
  <!-- Horizontal card layout -->
  {#if isLoading}
    <div
      class="flex flex-col items-center justify-center p-8 gap-4 text-neutral-500 text-sm"
    >
      <div
        class="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin"
      ></div>
      <p>Loading recommendations...</p>
    </div>
  {:else if recommendations.length > 0}
    <div class="flex gap-3 pb-2 pr-4">
      {#each recommendations as item}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="group relative flex flex-col gap-0 w-[140px] min-w-[140px] rounded-xl cursor-pointer transition-all hover:-translate-y-1 hover:z-20
                 {activeMenu === item.id ? 'z-50' : 'z-0'}"
          onclick={() => playTrack(item)}
          role="button"
          tabindex="0"
        >
          <div
            class="relative w-full aspect-square overflow-hidden rounded-xl bg-[var(--bg-secondary)] shadow-lg"
          >
            <img
              src={item.albumArt || "/placeholder.png"}
              alt={item.name}
              class="w-full h-full object-cover"
            />
            {#if item.isYouTube && item.duration}
              <div
                class="absolute bottom-2 right-2 bg-black/80 text-[var(--text-primary)] px-1.5 py-0.5 rounded textxs font-semibold pointer-events-none"
              >
                {formatTime(item.duration)}
              </div>
            {/if}

            <!-- Overlay Play Button -->
            <div
              class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button
                class="w-10 h-10 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center text-lg shadow-lg hover:scale-110 transition-transform"
                aria-label="Play {item.name}"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"><path d="M8 5v14l11-7z" /></svg
                >
              </button>
            </div>

            <!-- Menu Button -->
            <button
              class="menu-btn-trigger absolute top-2 right-2 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/80 hover:scale-105 z-10
                       {activeMenu === item.id ? 'opacity-100' : ''}"
              onclick={(e) => toggleMenu(item.id, e)}
              aria-label="More options"
            >
              <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor">
                <circle cx="2" cy="2" r="1.5" />
                <circle cx="2" cy="8" r="1.5" />
                <circle cx="2" cy="14" r="1.5" />
              </svg>
            </button>
          </div>

          <div class="p-2 flex flex-col gap-0.5">
            <div
              class="font-semibold text-sm text-[var(--text-primary)] truncate"
              title={item.name}
            >
              {item.name}
            </div>
            <div class="text-xs text-[var(--text-secondary)] truncate">
              {item.artists || item.artist}
            </div>
          </div>

          <!-- Menu Dropdown -->
          {#if activeMenu === item.id}
            <div
              class="menu-dropdown absolute top-10 right-2 left-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl z-[100] overflow-hidden flex flex-col min-w-[150px]"
            >
              <button
                class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-active)] flex items-center gap-2 transition-colors"
                onclick={(e) => addToQueue(item, e)}
              >
                <span>➕</span> Add to Queue
              </button>
              <button
                class="w-full px-4 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-active)] flex items-center gap-2 transition-colors"
                onclick={(e) => openSaveModal(item, e)}
              >
                <span>💾</span> Save to Playlist
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex items-center justify-center p-8 text-neutral-500 text-sm">
      <p>No recommendations available</p>
    </div>
  {/if}
{:else}
  <!-- Vertical list layout -->
  <div
    class="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-light)] backdrop-blur-sm p-4 gap-3"
  >
    <h3 class="text-[var(--text-primary)] font-semibold text-sm">
      Discover Similar
    </h3>

    <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1">
      {#if isLoading}
        <div
          class="flex flex-col items-center justify-center p-8 gap-4 text-neutral-500 text-sm"
        >
          <div
            class="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin"
          ></div>
          <p>Finding recommendations...</p>
        </div>
      {:else if recommendations.length > 0}
        {#each recommendations as track}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="group flex items-center gap-3 p-2 rounded-xl cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
            onclick={() => playTrack(track)}
          >
            <img
              src={track.albumArt}
              alt={track.name}
              class="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div
                class="text-sm font-medium text-[var(--text-primary)] truncate"
              >
                {track.name}
              </div>
              <div class="text-xs text-[var(--text-secondary)] truncate">
                {track.artists}
              </div>
            </div>

            <!-- Quick Add Button -->
            <button
              class="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-primary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-active)] transition-all font-bold text-lg"
              onclick={(e) => addToQueue(track, e)}
              title="Add to Queue"
            >
              +
            </button>
          </div>
        {/each}
      {:else if track}
        <p class="text-center p-8 text-neutral-500 text-sm">
          No recommendations available
        </p>
      {:else}
        <p class="text-center p-8 text-neutral-500 text-sm">
          Play a track to get recommendations
        </p>
      {/if}
    </div>
  </div>
{/if}
