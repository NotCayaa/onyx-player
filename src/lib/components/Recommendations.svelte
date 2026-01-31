<script context="module">
  // Cache to persist across tab switches (component unmounts)
  let recCache = {
    trackId: null,
    data: [],
  };
</script>

<script>
  import { api } from "../api.js";

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
      // console.log("Using cached recommendations for:", track.name);
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

  // Close menu on outside click
  import { onMount } from "svelte";

  onMount(() => {
    const closeMenu = (e) => {
      // Don't close if clicking on menu button or menu itself
      if (
        e.target.closest(".card-menu-btn") ||
        e.target.closest(".card-menu")
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
    // YouTube duration is usually in ms from backend
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    // If < 1 hour: M:SS, if > 1 hour: H:MM:SS
    const mDisplay = h > 0 ? m.toString().padStart(2, "0") : m.toString();
    const sDisplay = s.toString().padStart(2, "0");
    return h > 0 ? `${h}:${mDisplay}:${sDisplay}` : `${mDisplay}:${sDisplay}`;
  }

  $: if (track && track.id) {
    loadRecommendations();
  }
</script>

{#if horizontal}
  <!-- Horizontal card layout (Based on Home.svelte History) -->
  {#if isLoading}
    <div class="card-loading">
      <div class="spinner"></div>
      <p>Loading recommendations...</p>
    </div>
  {:else if recommendations.length > 0}
    <div class="horizontal-list">
      {#each recommendations as item}
        <div
          class="card"
          class:menu-active={activeMenu === item.id}
          onclick={() => playTrack(item)}
          role="button"
          tabindex="0"
          onkeydown={(e) =>
            (e.key === "Enter" || e.key === " ") && playTrack(item)}
        >
          <div class="card-image-wrapper">
            <img
              src={item.albumArt || "/placeholder.png"}
              alt={item.name}
              class="card-image"
            />
            {#if item.isYouTube && item.duration}
              <div class="duration-badge">
                {formatTime(item.duration)}
              </div>
            {/if}
            <!-- Overlay Play Button (Original Feature) -->
            <div class="card-overlay">
              <button class="play-btn" aria-label="Play {item.name}">
                <i class="fas fa-play"></i>
              </button>
            </div>
          </div>

          <div class="card-info">
            <div class="card-title" title={item.name}>{item.name}</div>
            <div class="card-subtitle">{item.artists || item.artist}</div>
          </div>

          <!-- Menu Button (Home.svelte SVG) -->
          <button
            class="card-menu-btn"
            onclick={(e) => toggleMenu(item.id, e)}
            aria-label="More options"
          >
            <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.5" />
              <circle cx="2" cy="8" r="1.5" />
              <circle cx="2" cy="14" r="1.5" />
            </svg>
          </button>

          <!-- Menu Dropdown (Home.svelte Logic) -->
          {#if activeMenu === item.id}
            <div class="card-menu">
              <button onclick={(e) => addToQueue(item, e)}>
                <span>➕</span> Add to Queue
              </button>
              <button onclick={(e) => openSaveModal(item, e)}>
                <span>💾</span> Save to Playlist
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <p>No recommendations available</p>
    </div>
  {/if}
{:else}
  <!-- Vertical list layout (original) -->
  <div class="recommendations">
    <h3>Discover Similar</h3>

    <div class="recs-list">
      {#if isLoading}
        <div class="loading">
          <div class="spinner"></div>
          <p>Finding recommendations...</p>
        </div>
      {:else if recommendations.length > 0}
        {#each recommendations as track}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="track-item" onclick={() => playTrack(track)}>
            <img src={track.albumArt} alt={track.name} class="track-thumb" />
            <div class="track-info">
              <div class="track-name">{track.name}</div>
              <div class="track-artist">{track.artists}</div>
            </div>
            <button class="btn-icon add-btn">+</button>
          </div>
        {/each}
      {:else if track}
        <p class="no-recs">No recommendations available</p>
      {:else}
        <p class="no-recs">Play a track to get recommendations</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .recommendations {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    height: 100%;
    overflow: hidden;
  }

  h3 {
    margin: 0;
  }

  .recs-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    gap: var(--spacing-md);
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .track-item:hover {
    background: var(--bg-hover);
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
    font-size: 0.875rem;
  }

  .track-artist {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .add-btn {
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .track-item:hover .add-btn {
    opacity: 1;
  }

  .no-recs {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-secondary);
  }

  /* Horizontal card layout (Based on Home.svelte) */
  .horizontal-list {
    display: flex;
    gap: var(
      --spacing-sm
    ); /* Home uses spacing-xs between cards, Recs originally spacing-md. Home spacing looks tighter. I'll use sm. */
    /* overflow-x: auto; Removed for scroll fix */
    padding-bottom: var(--spacing-sm);
    padding-right: var(--spacing-lg);
  }

  /* Card Styles - Modified for 140px & Background */
  .card {
    min-width: 140px;
    max-width: 140px;
    background: var(
      --bg-tertiary
    ); /* Added background to fix 'floating' look */
    border-radius: var(--radius-md);
    /* overflow: hidden; Removed to allow menu to popup */
    cursor: pointer;
    transition:
      transform var(--transition-fast),
      z-index 0s;
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
    border: 1px solid transparent;
  }

  /* Specific override to match original darker card look if bg-secondary is too light */
  /* Actually Home uses no background, so this IS the addition */

  .card:hover {
    transform: translateY(-4px);
    background: var(--bg-tertiary); /* Lighter on hover */
    z-index: 100;
  }

  .card.menu-active {
    background: var(--bg-tertiary);
    z-index: 500;
  }

  .card-image-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }

  .card-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card-info {
    padding: var(--spacing-sm); /* Add padding for "boxed" look */
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-title {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-subtitle {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Duration Badge (Original Feature) */
  .duration-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    pointer-events: none;
    z-index: 2;
  }

  /* Overlay (Original Feature) */
  .card-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .card:hover .card-overlay {
    opacity: 1;
  }

  .play-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    cursor: pointer;
    transform: scale(0.9);
    transition: transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .play-btn:hover {
    transform: scale(1);
  }

  /* Menu Button (Matches Home) */
  .card-menu-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: white;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.2s,
      background 0.2s;
    z-index: 2;
  }

  .card:hover .card-menu-btn,
  .card.menu-active .card-menu-btn {
    opacity: 1;
  }

  .card-menu-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.05);
  }

  /* Dropdown Menu (Matches Home) */
  .card-menu {
    position: absolute;
    top: 40px;
    left: 8px;
    background: var(--bg-tertiary);
    border: 1px solid var(--bg-hover);
    border-radius: var(--radius-sm);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 9999; /* Ensure it's on top */
    min-width: 180px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .card-menu button {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    transition: background var(--transition-fast);
  }

  .card-menu button:hover {
    background: var(--bg-hover);
  }

  .card-menu button span {
    font-size: 1rem;
  }

  .card-loading {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    gap: var(--spacing-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    text-align: center;
  }
</style>
