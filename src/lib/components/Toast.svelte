<script>
    import { toast } from "../stores/toast.js";
    import { flip } from "svelte/animate";
    import { fade, fly } from "svelte/transition";
</script>

<div class="toast-container">
    {#each $toast as t (t.id)}
        <div
            class="toast {t.type}"
            animate:flip
            in:fly={{ y: 20, duration: 300 }}
            out:fade
        >
            <div class="message">{t.message}</div>
            <button class="close-btn" onclick={() => toast.remove(t.id)}
                >×</button
            >
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none; /* Let clicks pass through container */
    }

    .toast {
        pointer-events: auto;
        min-width: 250px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--bg-secondary);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: white;
        font-size: 0.9rem;
        border-left: 4px solid var(--accent);
    }

    .toast.success {
        border-left-color: #2ecc71;
    }
    .toast.error {
        border-left-color: #e74c3c;
    }
    .toast.info {
        border-left-color: #3498db;
    }

    .close-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0 0 0 10px;
        line-height: 1;
    }
    .close-btn:hover {
        color: white;
    }
</style>
