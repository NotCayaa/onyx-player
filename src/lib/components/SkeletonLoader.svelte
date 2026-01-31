<script>
    export let type = "text"; // text, rect, circle, card
    export let width = "100%";
    export let height = "20px";
    export let count = 1;
    export let style = "";
</script>

<div class="skeleton-container" {style}>
    {#each Array(count) as _}
        <div class="skeleton {type}" style="width: {width}; height: {height};"></div>
    {/each}
</div>

<style>
    .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .skeleton {
        background: linear-gradient(
            90deg,
            var(--bg-secondary) 25%,
            var(--bg-hover) 50%,
            var(--bg-secondary) 75%
        );
        background-size: 200% 100%;
        animation: loading 1.5s infinite;
        border-radius: 4px;
    }

    .skeleton.circle {
        border-radius: 50%;
    }

    .skeleton.card {
        border-radius: 12px;
    }

    @keyframes loading {
        0% {
            background-position: 200% 0;
        }
        100% {
            background-position: -200% 0;
        }
    }
</style>
