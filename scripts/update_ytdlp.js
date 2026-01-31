import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetPath = path.resolve(__dirname, '../node_modules/youtube-dl-exec/bin/yt-dlp.exe');
const url = 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe';

console.log(`Downloading yt-dlp Nightly from: ${url}`);
console.log(`Target path: ${targetPath}`);

// Ensure directory exists
const dir = path.dirname(targetPath);
if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
}

async function download() {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const fileStream = fs.createWriteStream(targetPath);

        // Node.js web stream to node stream
        const nodeStream = Readable.fromWeb(response.body);

        await new Promise((resolve, reject) => {
            nodeStream.pipe(fileStream);
            nodeStream.on('error', reject);
            fileStream.on('finish', resolve);
        });

        console.log('Download completed successfully!');
        const stats = fs.statSync(targetPath);
        console.log(`File size: ${stats.size} bytes`);

    } catch (error) {
        console.error('Download failed:', error.message);
        process.exit(1);
    }
}

download();
