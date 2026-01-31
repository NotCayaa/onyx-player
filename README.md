# Onyx Player (Nightly Build)

> **WARNING**: This is an experimental nightly build. Features may be unstable and is subject to frequent breaking changes.

**Onyx** is a modern, sleek, and powerful desktop music player built with **Svelte 5**, **Electron**, **Tailwind CSS**, and **Node.js**. It combines the best of both worlds: Spotify's metadata & recommendation engine with YouTube's vast audio library.

## Nightly Features

This branch (nightly) introduces a complete UI overhaul focusing on density and responsiveness:

- **System-Wide Compact Mode**: A global density scaler that adjusts font sizes, padding, and layout across the entire application (Sidebar, Player, Queue, Settings) for a more information-dense experience.
- **Responsive 4-Column Grid**: The Home view dynamically adjusts card sizing to fit more content in compact mode.
- **Animated Sidebar**: Smooth, sliding active state indicator for navigation tabs with spring physics.
- **Enhanced Theme Consistency**: Full support for both Light and Dark modes across all modals and overlays.
- **Modern Styling Architecture**: Migrated core styles to Tailwind CSS v3 for better maintainability (removing legacy CSS variables).

## Standard Features

- **Modern UI/UX**: Glassmorphism design and smooth animations.
- **Smart Streaming**: Uses Spotify for metadata/search and YouTube for audio streaming.
- **Dynamic Visualizer**: Real-time audio visualizer (audiomotion-analyzer) that adapts to album art colors.
- **Smart Queue**: Spotify-like queue system with auto-recommendations.
- **Library Management**: Playlists, favorites, and listening history.

## Tech Stack

- **Frontend**: Svelte 5, Vite 5, Tailwind CSS v3
- **Desktop**: Electron 39
- **Backend**: Express (Node.js)
- **Audio Engine**: yt-dlp (Core Streaming) / youtube-sr (Search)
- **Data Source**: Spotify Web API
- **Visuals**: audiomotion-analyzer, colorthief

## Installation

1. **Clone the repository (Nightly Branch)**
   ```bash
   git clone -b nightly https://github.com/NotCayaa/onyx-player.git
   cd onyx-player
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run Development Mode**
   ```bash
   # Run both backend and frontend concurrently
   npm run dev
   npm start
   ```

## License

[MIT](LICENSE) © 2026 caya8205
