import { writable } from 'svelte/store';

function createToastStore() {
    const { subscribe, update } = writable([]);

    return {
        subscribe,
        show: (message, type = 'info', duration = 3000) => {
            const id = Math.random().toString(36).substr(2, 9);
            update((toasts) => [...toasts, { id, message, type }]);

            setTimeout(() => {
                update((toasts) => toasts.filter((t) => t.id !== id));
            }, duration);
        },
        success: (msg, duration) => toast.show(msg, 'success', duration),
        error: (msg, duration) => toast.show(msg, 'error', duration),
        info: (msg, duration) => toast.show(msg, 'info', duration),
        remove: (id) => update((toasts) => toasts.filter((t) => t.id !== id))
    };
}

export const toast = createToastStore();
