import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_SRC = path.resolve(__dirname, '../backend');
const DIST_DIR = path.resolve(__dirname, 'backend-dist');

console.log('Building Backend for Distribution...');

// 1. Clean dist directory
if (fs.existsSync(DIST_DIR)) {
    console.log('Cleaning existing dist...');
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR);

// 2. Copy source files
const filesToCopy = [
    'package.json',
    'index.js',
    'spotify.js',
    'youtube.js',
    'cache.js',
    'playlist.js'
];

console.log('Copying source files...');
filesToCopy.forEach(file => {
    const src = path.join(BACKEND_SRC, file);
    const dest = path.join(DIST_DIR, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    } else {
        console.warn(`Warning: ${file} not found in backend source.`);
    }
});

// 3. Copy node_modules from backend (Bypass npm install to avoid network/build errors)
console.log('Copying node_modules from source to avoid network timeouts...');
const srcNodeModules = path.join(BACKEND_SRC, 'node_modules');
const destNodeModules = path.join(DIST_DIR, 'node_modules');

if (fs.existsSync(srcNodeModules)) {
    try {
        // Node 16.7.0+ supports fs.cpSync
        fs.cpSync(srcNodeModules, destNodeModules, { recursive: true });
        console.log('node_modules copied successfully!');
    } catch (error) {
        console.error('Failed to copy node_modules:', error);
        process.exit(1);
    }
} else {
    console.error('CRITICAL: Source directory has no node_modules. Please run "npm install" in backend folder first.');
    process.exit(1);
}

console.log('Backend setup complete!');
