<script>
  import { onMount, onDestroy } from "svelte";
  import AudioMotionAnalyzer from "audiomotion-analyzer";
  import ColorThief from "colorthief";

  export let analyser = null;
  export let enabled = true;
  export let albumArt = null;

  let container;
  let audioMotion = null;
  let currentColor = [34, 197, 94]; // Default green
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
    if (!imageUrl) {
      console.log("[Visualizer] No album art URL");
      return;
    }
    if (imageUrl === lastAlbumArt) {
      return;
    }

    lastAlbumArt = imageUrl;
    console.log("[Visualizer] Extracting color from:", imageUrl);

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
        console.log("[Visualizer] Applied color:", color);
      }
    } catch (err) {
      console.error("[Visualizer] Failed to extract color:", err);
    }
  }

  function updateGradient() {
    if (!audioMotion) return;

    const [r, g, b] = currentColor;

    // Create vibrant variations
    const vibrantR = Math.min(255, Math.round(r * 1.3));
    const vibrantG = Math.min(255, Math.round(g * 1.3));
    const vibrantB = Math.min(255, Math.round(b * 1.3));

    // Lighter version
    const lightR = Math.min(255, r + 80);
    const lightG = Math.min(255, g + 80);
    const lightB = Math.min(255, b + 80);

    // Darker version
    const darkR = Math.max(0, Math.round(r * 0.5));
    const darkG = Math.max(0, Math.round(g * 0.5));
    const darkB = Math.max(0, Math.round(b * 0.5));

    audioMotion.registerGradient("dynamic", {
      bgColor: "transparent",
      colorStops: [
        { color: `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 1)`, pos: 0 },
        { color: `rgba(${r}, ${g}, ${b}, 0.95)`, pos: 0.35 },
        { color: `rgba(${lightR}, ${lightG}, ${lightB}, 0.85)`, pos: 0.7 },
        { color: `rgba(${darkR}, ${darkG}, ${darkB}, 0.75)`, pos: 1 },
      ],
    });
    audioMotion.gradient = "dynamic";

    if (container) {
      container.style.setProperty("--glow-color", `rgb(${r}, ${g}, ${b})`);
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
        connectSpeakers: false, // IMPORTANT: Don't connect to speakers, let gainNode handle audio output
        mode: 10, // Mode 10 = waveform
        gradient: "classic",
        showScaleX: false,
        showScaleY: false,
        showBgColor: false,
        overlay: true,
        bgAlpha: 0,
        smoothing: 0.7,
        lineWidth: 3, // Thickness of waveform line
        fillAlpha: 0.6, // Fill opacity under waveform
        channelLayout: "single", // Mono channel
        reflexRatio: 0.5, // Mirror atas-bawah (50% reflex)
        reflexAlpha: 0.4, // Opacity mirror
        reflexBright: 1,
        reflexFit: true,
        minFreq: 20,
        maxFreq: 16000,
        weightingFilter: "A",
        minDecibels: -85,
        maxDecibels: -25,
      });

      updateGradient();
      console.log("[Visualizer] AudioMotion initialized with waveform mode");
    } catch (err) {
      console.error("[Visualizer] Failed to init AudioMotion:", err);
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

  // Toggle visibility
  $: if (audioMotion) {
    if (enabled) {
      audioMotion.start();
    } else {
      audioMotion.stop();
    }
  }
</script>

<div
  bind:this={container}
  class="visualizer-container"
  class:hidden={!enabled}
></div>

<style>
  .visualizer-container {
    --glow-color: rgb(34, 197, 94);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    pointer-events: none;
    overflow: hidden;
  }

  .visualizer-container :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    filter: drop-shadow(0 0 10px var(--glow-color))
      drop-shadow(0 0 25px var(--glow-color));
  }

  .hidden {
    display: none;
  }
</style>
