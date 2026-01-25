<script>
    import { createEventDispatcher } from "svelte";
    import { fade, fly } from "svelte/transition";
    import ConfirmationModal from "./ConfirmationModal.svelte";
    import { toast } from "../stores/toast.js";

    export let isOpen = false;
    export let visualizerEnabled = false;
    export let theme = "dark";
    export let compactMode = false;
    export let audioQuality = "normal";
    export let username = "";

    const dispatch = createEventDispatcher();

    let cacheClearing = false;
    let usernameSaving = false;

    // Spotify Credentials State
    let spotifyClientId = "";
    let spotifyClientSecret = "";
    let savingSpotify = false;
    let showClientId = false;
    let showClientSecret = false;

    async function saveSpotifyCredentials() {
        if (!spotifyClientId || !spotifyClientSecret) {
            toast.error("Please enter both Client ID and Client Secret");
            return;
        }

        savingSpotify = true;
        try {
            const response = await fetch(
                "http://localhost:3000/config/spotify",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        clientId: spotifyClientId,
                        clientSecret: spotifyClientSecret,
                    }),
                },
            );

            const data = await response.json();

            if (response.ok) {
                toast.success("Spotify credentials saved!");
                // Clear inputs for security or keep them? Keeping them visible might be useful for users to know they are set.
                // For now, let's keep them.
            } else {
                toast.error(data.error || "Failed to save credentials");
            }
        } catch (error) {
            console.error("Failed to save credentials:", error);
            toast.error("Connection error");
        } finally {
            savingSpotify = false;
        }
    }

    async function importData(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        console.log(`Importing ${type} from ${file.name}`);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);

        const toastId = toast.info(`Importing ${type}...`);

        try {
            const response = await fetch("http://localhost:3000/import/data", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                toast.success(`${type} imported! Refreshing...`);
                setTimeout(() => window.location.reload(), 1000); // Reload to reflect changes
            } else {
                toast.error(data.error || "Import failed");
            }
        } catch (error) {
            console.error("Import error:", error);
            toast.error("Connection error during import");
        }
    }

    async function exportData(type) {
        try {
            // Use anchor tag download to avoid opening new window
            const link = document.createElement("a");
            link.href = `http://localhost:3000/export/data?type=${type}`;
            link.download = type === "cache" ? "cache.json" : "playlists.json";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Exporting ${type}...`);
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export data");
        }
    }

    async function fetchSpotifyConfig() {
        try {
            const res = await fetch("http://localhost:3000/config/spotify");
            if (res.ok) {
                const data = await res.json();
                if (data.clientId) spotifyClientId = data.clientId;
                if (data.clientSecret) spotifyClientSecret = data.clientSecret;
            }
        } catch (error) {
            console.error("Failed to fetch Spotify config:", error);
        }
    }
    // Load config when modal opens
    $: if (isOpen) {
        fetchSpotifyConfig();
    }

    // Confirmation State
    let showConfirmation = false;
    let confirmationType = ""; // 'cache' or 'history'
    let confirmationTitle = "";
    let confirmationMessage = "";
    $: isDark = theme === "dark";

    function close() {
        dispatch("close");
    }

    function toggleVisualizer() {
        visualizerEnabled = !visualizerEnabled;
        dispatch("toggleVisualizer", visualizerEnabled);
        localStorage.setItem("visualizerEnabled", visualizerEnabled.toString());
    }

    function toggleTheme() {
        theme = theme === "dark" ? "light" : "dark";
        dispatch("themeChange", theme);
        localStorage.setItem("theme", theme);
    }

    function toggleCompactMode() {
        compactMode = !compactMode;
        dispatch("compactModeChange", compactMode);
        localStorage.setItem("compactMode", compactMode.toString());
    }

    function changeAudioQuality() {
        dispatch("audioQualityChange", audioQuality);
        localStorage.setItem("audioQuality", audioQuality);
    }

    function updateUsername() {
        usernameSaving = true;
        dispatch("usernameChange", username);
        localStorage.setItem("username", username);
        // Trigger storage event for other components
        window.dispatchEvent(new Event("storage"));
        setTimeout(() => {
            usernameSaving = false;
        }, 500);
    }

    function requestClearCache() {
        confirmationType = "cache";
        confirmationTitle = "Clear Cache";
        confirmationMessage =
            "This will delete all cached song metadata. Continue?";
        showConfirmation = true;
    }

    async function executeClearCache() {
        if (cacheClearing) return;

        cacheClearing = true;
        try {
            const response = await fetch("http://localhost:3000/cache/clear", {
                method: "DELETE",
            });

            if (response.ok) {
                toast.success("Cache cleared successfully!");
            } else {
                toast.error("Failed to clear cache");
            }
        } catch (error) {
            console.error("Error clearing cache:", error);
            toast.error("Error clearing cache");
        } finally {
            cacheClearing = false;
        }
    }

    function clearHistory() {
        confirmationType = "history";
        confirmationTitle = "Clear History";
        confirmationMessage =
            "Are you sure you want to clear your listening history?";
        showConfirmation = true;
    }

    function handleConfirm() {
        showConfirmation = false;
        if (confirmationType === "cache") {
            executeClearCache();
        } else if (confirmationType === "history") {
            dispatch("clearHistory");
            toast.success("History cleared!");
        }
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            close();
        }
    }
</script>

{#if isOpen}
    <div
        class="modal-backdrop"
        onclick={handleBackdropClick}
        onkeydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="modal"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <div class="modal-header">
                <h2>Settings</h2>
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
            </div>

            <div class="modal-content">
                <section class="settings-section">
                    <h3>Appearance</h3>

                    <!-- Visualizer Background Toggle -->
                    <div
                        class="toggle-option"
                        onclick={toggleVisualizer}
                        onkeydown={(e) =>
                            e.key === "Enter" && toggleVisualizer()}
                        role="button"
                        tabindex="0"
                    >
                        <div class="toggle-info">
                            <span class="toggle-label"
                                >Visualizer Background</span
                            >
                            <span class="toggle-desc"
                                >Show audio waveform behind lyrics</span
                            >
                        </div>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                bind:checked={visualizerEnabled}
                                onchange={toggleVisualizer}
                                onclick={(e) => e.stopPropagation()}
                            />
                            <span class="slider"></span>
                        </label>
                    </div>

                    <!-- Theme Toggle -->
                    <div
                        class="toggle-option"
                        onclick={toggleTheme}
                        onkeydown={(e) => e.key === "Enter" && toggleTheme()}
                        role="button"
                        tabindex="0"
                    >
                        <div class="toggle-info">
                            <span class="toggle-label">Dark Theme</span>
                            <span class="toggle-desc"
                                >Use dark color scheme</span
                            >
                        </div>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                checked={isDark}
                                onchange={toggleTheme}
                            />
                            <span class="slider"></span>
                        </label>
                    </div>

                    <!-- Compact Mode Toggle -->
                    <div
                        class="toggle-option"
                        onclick={toggleCompactMode}
                        onkeydown={(e) =>
                            e.key === "Enter" && toggleCompactMode()}
                        role="button"
                        tabindex="0"
                    >
                        <div class="toggle-info">
                            <span class="toggle-label">Compact Mode</span>
                            <span class="toggle-desc"
                                >Denser UI with reduced spacing</span
                            >
                        </div>
                        <label class="toggle-switch">
                            <input
                                type="checkbox"
                                bind:checked={compactMode}
                                onchange={toggleCompactMode}
                                onclick={(e) => e.stopPropagation()}
                            />
                            <span class="slider"></span>
                        </label>
                    </div>

                    <!-- Username Input -->
                    <div class="toggle-option username-setting">
                        <div class="toggle-info">
                            <span class="toggle-label">Display Name</span>
                            <span class="toggle-desc"
                                >Your name for personalized greetings</span
                            >
                        </div>
                        <div class="username-input-group">
                            <input
                                type="text"
                                bind:value={username}
                                placeholder="Enter your name..."
                                class="text-input"
                                maxlength="20"
                                onkeydown={(e) =>
                                    e.key === "Enter" && updateUsername()}
                            />
                            <button
                                class="btn-save-username"
                                onclick={updateUsername}
                                disabled={usernameSaving}
                            >
                                {usernameSaving ? "✓" : "Save"}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- Spotify API Settings -->
                <section class="settings-section">
                    <h3>Spotify Integration</h3>
                    <p
                        class="toggle-desc"
                        style="margin-bottom: var(--spacing-sm);"
                    >
                        Enter your Spotify API credentials to enable search and
                        recommendations. You can find these in your <a
                            href="https://developer.spotify.com/dashboard"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="color: var(--accent-primary);"
                            >Spotify Dashboard</a
                        >.
                    </p>

                    <div class="toggle-option username-setting">
                        <div class="toggle-info">
                            <span class="toggle-label">Client ID</span>
                        </div>
                        <div class="input-container">
                            <input
                                type={showClientId ? "text" : "password"}
                                bind:value={spotifyClientId}
                                placeholder="Enter Client ID"
                                class="text-input"
                                style="width: 100%; padding-right: 40px;"
                            />
                            <button
                                class="visibility-btn"
                                onclick={() => (showClientId = !showClientId)}
                                aria-label={showClientId
                                    ? "Hide Client ID"
                                    : "Show Client ID"}
                            >
                                {#if showClientId}
                                    <!-- Eye Off Icon -->
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17zm-4.3.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm-2.53-1.1l7.15 7.15c-.97.55-2.07.95-3.29 1.12l-.06.01c-.34.03-.68.04-1.02.04C6.5 17.16 2.06 13.62.94 12c1.32-1.92 3.32-3.37 5.61-4.04l-1.55-1.55zM12 4.84c4.66 0 8.56 3.12 9.87 7.16-.6 1.84-1.99 3.42-3.83 4.45l-1.58-1.58c1.39-.75 2.44-1.89 2.95-3.23-.92-2.43-3.03-4.24-5.65-4.58l-.16-.01V7h.16A5 5 0 0 1 12 4.84zM4.27 3l16.73 16.73L19.73 21 3 4.27 4.27 3z"
                                        />
                                    </svg>
                                {:else}
                                    <!-- Eye Icon -->
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                                        />
                                    </svg>
                                {/if}
                            </button>
                        </div>
                    </div>

                    <div class="toggle-option username-setting">
                        <div class="toggle-info">
                            <span class="toggle-label">Client Secret</span>
                        </div>
                        <div class="input-container">
                            <input
                                type={showClientSecret ? "text" : "password"}
                                bind:value={spotifyClientSecret}
                                placeholder="Enter Client Secret"
                                class="text-input"
                                style="width: 100%; padding-right: 40px;"
                            />
                            <button
                                class="visibility-btn"
                                onclick={() =>
                                    (showClientSecret = !showClientSecret)}
                                aria-label={showClientSecret
                                    ? "Hide Client Secret"
                                    : "Show Client Secret"}
                            >
                                {#if showClientSecret}
                                    <!-- Eye Off Icon -->
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17zm-4.3.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm-2.53-1.1l7.15 7.15c-.97.55-2.07.95-3.29 1.12l-.06.01c-.34.03-.68.04-1.02.04C6.5 17.16 2.06 13.62.94 12c1.32-1.92 3.32-3.37 5.61-4.04l-1.55-1.55zM12 4.84c4.66 0 8.56 3.12 9.87 7.16-.6 1.84-1.99 3.42-3.83 4.45l-1.58-1.58c1.39-.75 2.44-1.89 2.95-3.23-.92-2.43-3.03-4.24-5.65-4.58l-.16-.01V7h.16A5 5 0 0 1 12 4.84zM4.27 3l16.73 16.73L19.73 21 3 4.27 4.27 3z"
                                        />
                                    </svg>
                                {:else}
                                    <!-- Eye Icon -->
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                                        />
                                    </svg>
                                {/if}
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button
                            class="btn-save-username"
                            onclick={saveSpotifyCredentials}
                            disabled={savingSpotify}
                            style="flex: 1;"
                        >
                            {savingSpotify ? "Saving..." : "Save Credentials"}
                        </button>
                    </div>
                </section>

                <section class="settings-section">
                    <h3>Data Management (Advanced)</h3>
                    <p
                        class="toggle-desc"
                        style="margin-bottom: var(--spacing-sm);"
                    >
                        Restore your cache or playlists from backup files. The
                        app will overwrite existing data.
                    </p>

                    <div style="display: flex; gap: 10px;">
                        <!-- Cache Import -->
                        <div style="flex: 1;">
                            <input
                                type="file"
                                accept=".json"
                                id="import-cache"
                                style="display: none;"
                                onchange={(e) => importData(e, "cache")}
                            />
                            <button
                                class="btn-clear-cache"
                                onclick={() =>
                                    document
                                        .getElementById("import-cache")
                                        .click()}
                                style="width: 100%;"
                            >
                                Import Cache.json
                            </button>
                        </div>

                        <!-- Playlist Import -->
                        <div style="flex: 1;">
                            <input
                                type="file"
                                accept=".json"
                                id="import-playlist"
                                style="display: none;"
                                onchange={(e) => importData(e, "playlist")}
                            />
                            <button
                                class="btn-clear-cache"
                                onclick={() =>
                                    document
                                        .getElementById("import-playlist")
                                        .click()}
                                style="width: 100%;"
                            >
                                Import Playlists.json
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <!-- Cache Export -->
                        <div style="flex: 1;">
                            <button
                                class="btn-clear-cache"
                                onclick={() => exportData("cache")}
                                style="width: 100%;"
                            >
                                Export Cache
                            </button>
                        </div>

                        <!-- Playlist Export -->
                        <div style="flex: 1;">
                            <button
                                class="btn-clear-cache"
                                onclick={() => exportData("playlist")}
                                style="width: 100%;"
                            >
                                Export Playlists
                            </button>
                        </div>
                    </div>
                </section>

                <section class="settings-section">
                    <h3>Audio</h3>

                    <!-- Audio Quality Selector -->
                    <div class="audio-quality">
                        <label for="quality-select">Stream Quality</label>
                        <select
                            id="quality-select"
                            bind:value={audioQuality}
                            onchange={(e) => {
                                changeAudioQuality();
                                setTimeout(() => e.target.blur(), 100);
                            }}
                        >
                            <option value="normal">Normal (128 kbps)</option>
                            <option value="high">High (192+ kbps)</option>
                        </select>
                    </div>

                    <p class="note">
                        <strong>Note:</strong> Audio quality selector is not yet
                        implemented. Currently always streams best available quality
                        from YouTube.
                    </p>
                </section>

                <section class="settings-section">
                    <h3>Cache</h3>

                    <button
                        class="btn-clear-cache"
                        onclick={requestClearCache}
                        disabled={cacheClearing}
                    >
                        {cacheClearing ? "Clearing..." : "Clear All Cache"}
                    </button>
                    <p class="cache-note">
                        Clears all cached song metadata and YouTube URLs
                    </p>

                    <button
                        class="btn-clear-cache"
                        onclick={clearHistory}
                        style="margin-top: var(--spacing-md);"
                    >
                        Clear Listening History
                    </button>
                    <p class="cache-note">Clears "Jump Back In" history</p>
                </section>

                <section class="settings-section">
                    <h3>About</h3>
                    <p><strong>Onyx Player v1.0</strong></p>
                    <p>Made by caya8205</p>
                </section>

                <section class="settings-section">
                    <h3>Tech Stack</h3>

                    <p><strong>Frontend</strong></p>
                    <ul>
                        <li>Svelte 5 - Vite 5</li>
                        <li>Electron 39</li>
                        <li>audiomotion-analyzer (Visualizer)</li>
                        <li>colorthief (Color Extraction)</li>
                    </ul>

                    <p><strong>Backend</strong></p>
                    <ul>
                        <li>Node.js + Express 4.21</li>
                        <li>Spotify Web API 5.0</li>
                        <li>youtube-sr (Search)</li>
                        <li>yt-dlp (Streaming)</li>
                    </ul>

                    <p><strong>External APIs</strong></p>
                    <ul>
                        <li>Spotify API (MetaData)</li>
                        <li>YouTube (Audio)</li>
                        <li>LRCLib (Lyrics)</li>
                    </ul>
                </section>
            </div>
        </div>
    </div>

    <ConfirmationModal
        isOpen={showConfirmation}
        title={confirmationTitle}
        message={confirmationMessage}
        on:confirm={handleConfirm}
        on:cancel={() => (showConfirmation = false)}
    />
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        padding: var(--spacing-lg);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .modal-header h2 {
        margin: 0;
        color: var(--text-primary);
    }

    .close-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: var(--spacing-xs);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
    }

    .close-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .modal-content {
        padding: var(--spacing-lg);
        overflow-y: auto;
        flex: 1;
    }

    .settings-section {
        margin-bottom: var(--spacing-xl);
    }

    .settings-section:last-child {
        margin-bottom: 0;
    }

    .settings-section h3 {
        margin: 0 0 var(--spacing-md) 0;
        padding-bottom: var(--spacing-sm);
        color: var(--text-primary);
        font-size: 1.1rem;
        border-bottom: 1px solid var(--border-color);
    }

    .settings-section p {
        margin: var(--spacing-sm) 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .settings-section ul {
        margin: var(--spacing-sm) 0;
        padding-left: var(--spacing-lg);
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .settings-section li {
        margin: var(--spacing-xs) 0;
    }

    .toggle-option {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        cursor: pointer;
        transition: background var(--transition-fast);
    }

    .toggle-option:hover {
        background: var(--bg-hover);
    }

    .toggle-info {
        flex: 1;
    }

    .toggle-label {
        display: block;
        color: var(--text-primary);
        font-weight: 500;
        margin-bottom: 2px;
    }

    .toggle-desc {
        display: block;
        color: var(--text-secondary);
        font-size: 0.85rem;
    }

    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 48px;
        height: 26px;
        margin-left: var(--spacing-md);
    }

    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--bg-hover);
        transition: 0.3s;
        border-radius: 25px;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background-color: var(--accent-primary);
    }

    input:checked + .slider:before {
        transform: translateX(22px);
    }

    .note {
        background: var(--bg-tertiary);
        padding: var(--spacing-sm);
        border-radius: var(--radius-sm);
        border-left: 3px solid #f59e0b;
        font-size: 0.85rem;
    }

    .audio-quality {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
    }

    .audio-quality label {
        color: var(--text-primary);
        font-weight: 500;
    }

    .audio-quality select {
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 0.9rem;
        transition: all var(--transition-fast);

        /* Remove default appearance */
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;

        /* Custom dropdown arrow */
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23b3b3b3' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right var(--spacing-sm) center;
        padding-right: 2.5rem;
    }

    .audio-quality select:hover {
        background-color: var(--bg-hover);
        border-color: var(--border-hover);
    }

    .audio-quality select:focus {
        outline: none;
    }

    .audio-quality select option {
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: var(--spacing-sm);
    }

    .text-input {
        padding: var(--spacing-sm);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        font-size: 0.875rem;
        width: 200px;
        transition: all var(--transition-fast);
    }

    .text-input:hover {
        background-color: var(--bg-hover);
        border-color: var(--border-hover);
    }

    .text-input:focus {
        outline: none;
        border-color: var(--accent-primary);
    }

    .input-container {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
    }

    .visibility-btn {
        position: absolute;
        right: 8px;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
    }

    .visibility-btn:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.1);
    }

    /* Username Setting */
    .username-setting {
        flex-direction: column;
        align-items: stretch;
        gap: var(--spacing-md);
    }

    .username-input-group {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
    }

    .username-input-group .text-input {
        flex: 1;
    }

    .btn-save-username {
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--accent-primary);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all var(--transition-fast);
        min-width: 60px;
    }

    .btn-save-username:hover:not(:disabled) {
        background: var(--accent-hover);
        transform: translateY(-1px);
    }

    .btn-save-username:disabled {
        background: var(--accent-primary);
        opacity: 0.8;
        cursor: default;
    }

    .btn-clear-cache {
        width: 100%;
        padding: var(--spacing-sm) var(--spacing-md);
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        cursor: pointer;
        font-weight: 500;
        transition: all var(--transition-fast);
    }

    .btn-clear-cache:hover:not(:disabled) {
        background: var(--bg-hover);
        border-color: var(--border-hover);
    }

    .btn-clear-cache:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .cache-note {
        margin-top: var(--spacing-sm);
        font-size: 0.85rem;
        color: var(--text-secondary);
    }
</style>
