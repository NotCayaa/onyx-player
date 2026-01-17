<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let isOpen = false;
    export let title = "Confirm";
    export let message = "Are you sure?";

    function confirm() {
        dispatch("confirm");
    }

    function cancel() {
        dispatch("cancel");
    }
</script>

{#if isOpen}
    <div
        class="modal-overlay"
        role="button"
        tabindex="0"
        onclick={cancel}
        onkeydown={(e) => e.key === "Escape" && cancel()}
    >
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            tabindex="-1"
        >
            <h3>{title}</h3>
            <p>{message}</p>
            <div class="actions">
                <button class="btn-cancel" onclick={cancel}>Cancel</button>
                <button class="btn-confirm" onclick={confirm}>Confirm</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .modal {
        background: var(--bg-secondary);
        padding: var(--spacing-lg);
        border-radius: var(--radius-lg);
        width: 300px;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }

    h3 {
        margin: 0;
        color: var(--text-primary);
    }
    p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--spacing-sm);
    }

    button {
        padding: 6px 16px;
        border-radius: var(--radius-sm);
        border: none;
        cursor: pointer;
        font-family: inherit;
        font-weight: 500;
    }

    .btn-cancel {
        background: transparent;
        color: var(--text-secondary);
        border: 1px solid var(--text-secondary);
    }
    .btn-cancel:hover {
        color: var(--text-primary);
        border-color: var(--text-primary);
    }

    .btn-confirm {
        background: #ff4444; /* Destructive action color */
        color: white;
    }
    .btn-confirm:hover {
        background: #ff2222;
    }
</style>
