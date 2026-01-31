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
    // Data Saver State
    let dataSaver = false;

    async function fetchPreferences() {
        try {
            const res = await fetch("http://localhost:3000/config/preferences");
            if (res.ok) {
                const data = await res.json();
                dataSaver = data.dataSaver || false;
            }
        } catch (error) {
            console.error("Failed to fetch preferences:", error);
        }
    }

    async function toggleDataSaver() {
        // dataSaver is updated by bind:checked
        try {
            await fetch("http://localhost:3000/config/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataSaver }),
            });
            toast.success(
                dataSaver ? "Data Saver Enabled" : "Data Saver Disabled",
            );
        } catch (error) {
            console.error("Failed to save Data Saver:", error);
            dataSaver = !dataSaver; // Revert on error
            toast.error("Failed to save setting");
        }
    }

    // Load config when modal opens
    $: if (isOpen) {
        fetchSpotifyConfig();
        fetchPreferences();
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
        // visualizerEnabled is updated by bind:checked
        dispatch("toggleVisualizer", visualizerEnabled);
        localStorage.setItem("visualizerEnabled", visualizerEnabled.toString());
    }

    function toggleTheme() {
        theme = theme === "dark" ? "light" : "dark";
        dispatch("themeChange", theme);
        localStorage.setItem("theme", theme);
    }

    function toggleCompactMode() {
        // compactMode is updated by bind:checked
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
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4"
        onclick={handleBackdropClick}
        onkeydown={(e) => e.key === "Escape" && close()}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 200 }}
    >
        <div
            class="bg-[var(--bg-secondary)] border border-[var(--border)] backdrop-blur-3xl rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-[slideUp_0.4s]"
            onclick={(e) => e.stopPropagation()}
            transition:fly={{ y: 30, duration: 300 }}
        >
            <!-- Header -->
            <div
                class="p-6 border-b border-[var(--border-light)] flex items-center justify-between bg-[var(--bg-tertiary)]"
            >
                <h2
                    class="text-xl font-bold text-[var(--text-primary)] tracking-tight"
                >
                    Settings
                </h2>
                <button
                    class="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
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
            </div>

            <!-- Content -->
            <div
                class="flex-1 overflow-y-auto p-6 flex flex-col gap-8 custom-scrollbar"
            >
                <!-- Appearance Section -->
                <section class="flex flex-col gap-3">
                    <h3
                        class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                    >
                        Appearance
                    </h3>

                    <!-- Visualizer Toggle -->
                    <div
                        class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all group"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)]/90"
                                >Visualizer Background</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Show audio waveform behind lyrics</span
                            >
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={visualizerEnabled}
                                onchange={toggleVisualizer}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"
                            ></div>
                        </label>
                    </div>

                    <!-- Theme Toggle -->
                    <div
                        class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all group"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)]/90"
                                >Dark Theme</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Use dark color scheme</span
                            >
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={isDark}
                                onchange={toggleTheme}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"
                            ></div>
                        </label>
                    </div>

                    <!-- Compact Mode Toggle -->
                    <div
                        class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all group"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)]/90"
                                >Compact Mode</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Denser UI with reduced spacing</span
                            >
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={compactMode}
                                onchange={toggleCompactMode}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"
                            ></div>
                        </label>
                    </div>

                    <!-- Username Input -->
                    <div
                        class="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all"
                    >
                        <div class="flex flex-col mb-1">
                            <span class="text-[var(--text-primary)] font-medium"
                                >Display Name</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Your name for personalized greetings</span
                            >
                        </div>
                        <div class="flex gap-2">
                            <input
                                type="text"
                                bind:value={username}
                                placeholder="Enter your name..."
                                class="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-white/30 transition-colors placeholder:text-neutral-600"
                                maxlength="20"
                                onkeydown={(e) =>
                                    e.key === "Enter" && updateUsername()}
                            />
                            <button
                                class="bg-[var(--text-primary)] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                onclick={updateUsername}
                                disabled={usernameSaving}
                            >
                                {usernameSaving ? "..." : "Save"}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- Audio Section -->
                <section class="flex flex-col gap-3">
                    <h3
                        class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                    >
                        Audio
                    </h3>
                    <!-- Data Saver Toggle -->
                    <div
                        class="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-[var(--border-light)] hover:bg-[var(--bg-active)] transition-all group"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[var(--text-primary)] font-medium group-hover:text-[var(--text-primary)]/90"
                                >Data Saver</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Disable background downloads (Prefetch)</span
                            >
                        </div>
                        <label
                            class="relative inline-flex items-center cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                bind:checked={dataSaver}
                                onchange={toggleDataSaver}
                                class="sr-only peer"
                            />
                            <div
                                class="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"
                            ></div>
                        </label>
                    </div>
                    <!-- Audio Quality (Disabled) -->
                    <div
                        class="flex flex-col gap-2 p-4 rounded-xl bg-white/5 border border-[var(--border-light)] opacity-75"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-[var(--text-primary)] font-medium"
                                >Stream Quality</span
                            >
                            <select
                                disabled
                                class="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] text-xs focus:outline-none cursor-not-allowed"
                            >
                                <option>Best Available</option>
                            </select>
                        </div>
                        <p class="text-[10px] text-[var(--text-muted)] italic">
                            Audio quality selection is managed automatically.
                        </p>
                    </div>
                </section>

                <!-- Spotify Integration -->
                <section class="flex flex-col gap-3">
                    <h3
                        class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                    >
                        Spotify Integration
                    </h3>
                    <div
                        class="p-4 rounded-xl bg-white/5 border border-[var(--border-light)] flex flex-col gap-4"
                    >
                        <p class="text-xs text-[var(--text-secondary)]">
                            Enter your API credentials to enable search. Find
                            them in your <a
                                href="https://developer.spotify.com/dashboard"
                                target="_blank"
                                class="text-[var(--text-primary)] hover:text-[var(--text-primary)]/80 underline"
                                >Spotify Dashboard</a
                            >.
                        </p>

                        <!-- Client ID -->
                        <div class="flex flex-col gap-1">
                            <span
                                class="text-xs text-[var(--text-secondary)] font-medium"
                                >Client ID</span
                            >
                            <div class="relative">
                                <input
                                    type={showClientId ? "text" : "password"}
                                    bind:value={spotifyClientId}
                                    class="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-white/30 pr-10"
                                    placeholder="Enter Client ID"
                                />
                                <button
                                    class="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                    onclick={() =>
                                        (showClientId = !showClientId)}
                                >
                                    {#if showClientId}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path
                                                d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17zm-4.3.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm-2.53-1.1l7.15 7.15c-.97.55-2.07.95-3.29 1.12l-.06.01c-.34.03-.68.04-1.02.04C6.5 17.16 2.06 13.62.94 12c1.32-1.92 3.32-3.37 5.61-4.04l-1.55-1.55zM12 4.84c4.66 0 8.56 3.12 9.87 7.16-.6 1.84-1.99 3.42-3.83 4.45l-1.58-1.58c1.39-.75 2.44-1.89 2.95-3.23-.92-2.43-3.03-4.24-5.65-4.58l-.16-.01V7h.16A5 5 0 0 1 12 4.84zM4.27 3l16.73 16.73L19.73 21 3 4.27 4.27 3z"
                                            /></svg
                                        >
                                    {:else}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path
                                                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <!-- Client Secret -->
                        <div class="flex flex-col gap-1">
                            <span
                                class="text-xs text-[var(--text-secondary)] font-medium"
                                >Client Secret</span
                            >
                            <div class="relative">
                                <input
                                    type={showClientSecret
                                        ? "text"
                                        : "password"}
                                    bind:value={spotifyClientSecret}
                                    class="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-white/30 pr-10"
                                    placeholder="Enter Client Secret"
                                />
                                <button
                                    class="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                    onclick={() =>
                                        (showClientSecret = !showClientSecret)}
                                >
                                    {#if showClientSecret}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path
                                                d="M11.83 9L15 12.17V12a3 3 0 0 0-3-3h-.17zm-4.3.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 0 1-5-5c0-.79.2-1.53.53-2.2zm-2.53-1.1l7.15 7.15c-.97.55-2.07.95-3.29 1.12l-.06.01c-.34.03-.68.04-1.02.04C6.5 17.16 2.06 13.62.94 12c1.32-1.92 3.32-3.37 5.61-4.04l-1.55-1.55zM12 4.84c4.66 0 8.56 3.12 9.87 7.16-.6 1.84-1.99 3.42-3.83 4.45l-1.58-1.58c1.39-.75 2.44-1.89 2.95-3.23-.92-2.43-3.03-4.24-5.65-4.58l-.16-.01V7h.16A5 5 0 0 1 12 4.84zM4.27 3l16.73 16.73L19.73 21 3 4.27 4.27 3z"
                                            /></svg
                                        >
                                    {:else}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            ><path
                                                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                                            /></svg
                                        >
                                    {/if}
                                </button>
                            </div>
                        </div>

                        <button
                            class="w-full bg-[var(--text-primary)] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-200 transition-colors mt-2"
                            onclick={saveSpotifyCredentials}
                            disabled={savingSpotify}
                        >
                            {savingSpotify ? "Saving..." : "Save Credentials"}
                        </button>
                    </div>
                </section>

                <!-- Data Management -->
                <section class="flex flex-col gap-3">
                    <h3
                        class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                    >
                        Data Management
                    </h3>

                    <div class="grid grid-cols-2 gap-3">
                        <button
                            class="bg-white/5 hover:bg-[var(--bg-active)] border border-[var(--border-light)] rounded-xl p-4 flex flex-col gap-2 transition-all group items-start text-left"
                            onclick={() =>
                                document.getElementById("import-cache").click()}
                        >
                            <span
                                class="text-[var(--text-primary)] font-medium text-sm group-hover:text-[var(--text-primary)]/90"
                                >Import Cache</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Restore from cache.json</span
                            >
                            <input
                                type="file"
                                accept=".json"
                                id="import-cache"
                                class="hidden"
                                onchange={(e) => importData(e, "cache")}
                            />
                        </button>

                        <button
                            class="bg-white/5 hover:bg-[var(--bg-active)] border border-[var(--border-light)] rounded-xl p-4 flex flex-col gap-2 transition-all group items-start text-left"
                            onclick={() =>
                                document
                                    .getElementById("import-playlist")
                                    .click()}
                        >
                            <span
                                class="text-[var(--text-primary)] font-medium text-sm group-hover:text-[var(--text-primary)]/90"
                                >Import Playlists</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Restore from playlists.json</span
                            >
                            <input
                                type="file"
                                accept=".json"
                                id="import-playlist"
                                class="hidden"
                                onchange={(e) => importData(e, "playlist")}
                            />
                        </button>

                        <button
                            class="bg-white/5 hover:bg-[var(--bg-active)] border border-[var(--border-light)] rounded-xl p-4 flex flex-col gap-2 transition-all group items-start text-left"
                            onclick={() => exportData("cache")}
                        >
                            <span
                                class="text-[var(--text-primary)] font-medium text-sm group-hover:text-[var(--text-primary)]/90"
                                >Export Cache</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Backup cache.json</span
                            >
                        </button>

                        <button
                            class="bg-white/5 hover:bg-[var(--bg-active)] border border-[var(--border-light)] rounded-xl p-4 flex flex-col gap-2 transition-all group items-start text-left"
                            onclick={() => exportData("playlist")}
                        >
                            <span
                                class="text-[var(--text-primary)] font-medium text-sm group-hover:text-[var(--text-primary)]/90"
                                >Export Playlists</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Backup playlists.json</span
                            >
                        </button>
                    </div>

                    <div
                        class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col gap-4 mt-2"
                    >
                        <div class="flex flex-col gap-2">
                            <button
                                class="w-full bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left"
                                onclick={requestClearCache}
                                disabled={cacheClearing}
                            >
                                {cacheClearing
                                    ? "Clearing..."
                                    : "Clear All Cache"}
                            </button>
                            <button
                                class="w-full bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left"
                                onclick={clearHistory}
                            >
                                Clear Listening History
                            </button>
                        </div>
                    </div>
                </section>

                <!-- About -->
                <section
                    class="flex flex-col gap-4 pt-4 pb-2 border-t border-[var(--border-light)]"
                >
                    <div class="flex flex-col gap-2">
                        <h3
                            class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                        >
                            About
                        </h3>
                        <div
                            class="p-4 rounded-xl bg-white/5 border border-[var(--border-light)]"
                        >
                            <div class="flex items-center gap-3 mb-3">
                                <img
                                    src="./logo.png"
                                    alt="Onyx"
                                    class="w-10 h-10 rounded-lg shadow-lg"
                                />
                                <div>
                                    <h4
                                        class="text-[var(--text-primary)] font-bold text-lg"
                                    >
                                        Onyx Player
                                    </h4>
                                    <p
                                        class="text-xs text-[var(--text-secondary)]"
                                    >
                                        v1.0.0 • Nightly Build
                                    </p>
                                </div>
                            </div>
                            <p
                                class="text-sm text-[var(--text-secondary)] leading-relaxed"
                            >
                                A modern, high-performance music player built
                                with web technologies. Designed for aesthetics
                                and seamless listening.
                            </p>
                            <div
                                class="mt-4 pt-4 border-t border-[var(--border-light)] flex justify-between items-center"
                            >
                                <span class="text-xs text-[var(--text-muted)]"
                                    >Made by caya8205</span
                                >
                                <a
                                    href="https://github.com/NotCayaa/onyx-player"
                                    target="_blank"
                                    class="text-xs text-[var(--text-primary)] hover:underline"
                                    >GitHub</a
                                >
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2 pt-2">
                        <h3
                            class="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest px-1"
                        >
                            Tech Stack
                        </h3>

                        <div class="flex flex-col gap-3">
                            <!-- Frontend -->
                            <div>
                                <p
                                    class="text-sm font-bold text-[var(--text-secondary)] mb-2 px-1"
                                >
                                    Frontend
                                </p>
                                <ul class="grid grid-cols-1 gap-1">
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-orange-500"
                                        ></div>
                                        Svelte 5 - Vite 5
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-cyan-400"
                                        ></div>
                                        Tailwind CSS v3 (Modern Styling)
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-blue-400"
                                        ></div>
                                        Electron 39
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-purple-500"
                                        ></div>
                                        audiomotion-analyzer (Visualizer)
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-yellow-500"
                                        ></div>
                                        colorthief (Color Extraction)
                                    </li>
                                </ul>
                            </div>

                            <!-- Backend -->
                            <div>
                                <p
                                    class="text-sm font-bold text-[var(--text-secondary)] mb-2 px-1"
                                >
                                    Backend
                                </p>
                                <ul class="grid grid-cols-1 gap-1">
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-green-500"
                                        ></div>
                                        Node.js + Express 4.21
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-green-400"
                                        ></div>
                                        Spotify Web API 5.0
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-red-500"
                                        ></div>
                                        youtube-sr (Search)
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-red-400"
                                        ></div>
                                        yt-dlp (Hybrid Stream/Download)
                                    </li>
                                </ul>
                            </div>

                            <!-- External -->
                            <div>
                                <p
                                    class="text-sm font-bold text-[var(--text-secondary)] mb-2 px-1"
                                >
                                    External APIs
                                </p>
                                <ul class="grid grid-cols-1 gap-1">
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-white"
                                        ></div>
                                        Spotify API (MetaData)
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-red-600"
                                        ></div>
                                        YouTube (Audio)
                                    </li>
                                    <li
                                        class="text-xs text-[var(--text-secondary)] bg-white/5 border border-[var(--border-light)] rounded px-2 py-1.5 flex items-center gap-2"
                                    >
                                        <div
                                            class="w-1.5 h-1.5 rounded-full bg-blue-300"
                                        ></div>
                                        LRCLib (Lyrics)
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
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
