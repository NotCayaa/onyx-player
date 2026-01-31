<script>
    import { onMount, onDestroy } from "svelte";
    import AudioMotionAnalyzer from "audiomotion-analyzer";
    import ColorThief from "colorthief";

    export let analyser = null;
    export let albumArt = null;
    export let size = 300; // Container size in px

    let container;
    let audioMotion = null;
    let currentColor = [219, 39, 119]; // Default pink/magenta
    let lastAlbumArt = null;
    const colorThief = new ColorThief();

    onMount(() => {
        if (container && analyser) {
            initAudioMotion();
        }
    });

    onDestroy(() => {
        if (audioMotion) {
            audioMotion.destroy();
            audioMotion = null;
        }
    });

    async function extractColor(imageUrl) {
        if (!imageUrl) return;
        if (imageUrl === lastAlbumArt) return;

        lastAlbumArt = imageUrl;

        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            const proxyUrl = `http://localhost:3000/proxy/image?url=${encodeURIComponent(imageUrl)}`;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = proxyUrl;
            });

            const color = colorThief.getColor(img);
            if (color) {
                currentColor = color;
                updateGradient();
            }
        } catch (err) {
            console.error("[CircularVisualizer] Failed to extract color:", err);
        }
    }

    function updateGradient() {
        if (!audioMotion) return;

        let [r, g, b] = currentColor;

        // Calculate perceived brightness
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        // Fallback if too dark (e.g. black album art like Donda)
        if (brightness < 50) {
            [r, g, b] = [219, 39, 119]; // Default magenta
        }

        // Create vibrant variations
        const vibrantR = Math.min(255, Math.round(r * 1.4));
        const vibrantG = Math.min(255, Math.round(g * 1.4));
        const vibrantB = Math.min(255, Math.round(b * 1.4));

        // Lighter version
        const lightR = Math.min(255, r + 60);
        const lightG = Math.min(255, g + 60);
        const lightB = Math.min(255, b + 60);

        audioMotion.registerGradient("zen-radial", {
            bgColor: "transparent",
            colorStops: [
                {
                    color: `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 1)`,
                    pos: 0,
                },
                { color: `rgba(${r}, ${g}, ${b}, 0.9)`, pos: 0.5 },
                { color: `rgba(${lightR}, ${lightG}, ${lightB}, 0.7)`, pos: 1 },
            ],
        });
        audioMotion.gradient = "zen-radial";

        if (container) {
            container.style.setProperty(
                "--glow-color",
                `rgb(${r}, ${g}, ${b})`,
            );
        }
    }

    function initAudioMotion() {
        if (audioMotion) {
            audioMotion.destroy();
        }

        try {
            const audioCtx = analyser.context;

            audioMotion = new AudioMotionAnalyzer(container, {
                source: analyser,
                audioCtx: audioCtx,
                connectSpeakers: false,
                mode: 3, // Discrete frequencies mode for radial
                radial: true,
                spinSpeed: 1,
                gradient: "classic",
                showScaleX: false,
                showScaleY: false,
                showBgColor: false,
                overlay: true,
                bgAlpha: 0,
                smoothing: 0.5, // Lower = more responsive
                lineWidth: 3,
                fillAlpha: 0.7, // Slightly more visible
                barSpace: 0.2,
                reflexRatio: 0,
                minFreq: 20,
                maxFreq: 16000,
                minDecibels: -130, // Lower = more sensitive to quiet sounds
                maxDecibels: -5, // Higher = more headroom
            });

            updateGradient();
            console.log("[CircularVisualizer] Initialized with radial mode");
        } catch (err) {
            console.error("[CircularVisualizer] Failed to init:", err);
        }
    }

    // React to analyser changes
    $: if (analyser && container && !audioMotion) {
        initAudioMotion();
    }

    // React to album art changes
    $: if (albumArt && audioMotion) {
        extractColor(albumArt);
    }
</script>

<div
    bind:this={container}
    class="circular-visualizer"
    style="--size: {size}px;"
></div>

<style>
    .circular-visualizer {
        --glow-color: rgb(219, 39, 119);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: var(--size);
        height: var(--size);
        border-radius: 50%;
        pointer-events: none;
        overflow: visible;
    }

    .circular-visualizer :global(canvas) {
        width: 100% !important;
        height: 100% !important;
        filter: drop-shadow(0 0 15px var(--glow-color))
            drop-shadow(0 0 30px var(--glow-color));
    }
</style>
