<script>
  import { onMount, onDestroy } from 'svelte';

  export let analyser = null;
  export let enabled = true;

  let canvas;
  let canvasContext;
  let animationId;
  let dataArray;
  let bufferLength;

  onMount(() => {
    if (!canvas) return;
    
    canvasContext = canvas.getContext('2d');
    resizeCanvas();
    
    window.addEventListener('resize', resizeCanvas);
    
    if (analyser) {
      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      draw();
    }
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  });

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  function draw() {
    if (!enabled || !analyser || !canvasContext) {
      animationId = requestAnimationFrame(draw);
      return;
    }

    analyser.getByteFrequencyData(dataArray);

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = (width / bufferLength) * 2.5;
    
    canvasContext.fillStyle = 'rgb(10, 10, 10)';
    canvasContext.fillRect(0, 0, width, height);

    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height * 0.8;
      
      const hue = (i / bufferLength) * 120 + 120; // Green to cyan range
      const saturation = 70;
      const lightness = 50;
      
      canvasContext.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      canvasContext.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }

    animationId = requestAnimationFrame(draw);
  }

  $: if (analyser && dataArray) {
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
  }
</script>

<div class="visualizer">
  <canvas bind:this={canvas} class:hidden={!enabled}></canvas>
  {#if !enabled}
    <div class="disabled-message">Visualizer disabled</div>
  {/if}
</div>

<style>
  .visualizer {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    height: 200px;
    position: relative;
  }

  canvas {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-md);
  }

  canvas.hidden {
    display: none;
  }

  .disabled-message {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
  }
</style>
