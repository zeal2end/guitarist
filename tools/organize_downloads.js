const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const DOWNLOADS_ROOT = path.join(os.homedir(), 'Downloads');
const TEMP_DIR = path.join(DOWNLOADS_ROOT, 'chord-companion-temp');
const REPO_ROOT = path.resolve(__dirname, '..'); // Assuming tools/ is in project root
const DATA_DIR = path.join(REPO_ROOT, 'chord-db', 'data');

console.log('🎸 Chord Companion - Download Organizer');
console.log(`Scanning: ${TEMP_DIR}`);
console.log(`Target:   ${DATA_DIR}\n`);

// Ensure target exists
if (!fs.existsSync(DATA_DIR)) {
    console.error(`Error: Could not find chord-db/data at ${DATA_DIR}`);
    process.exit(1);
}

// Ensure temp dir exists (if not, nothing to do)
if (!fs.existsSync(TEMP_DIR)) {
    console.log('No "chord-companion-temp" folder found in Downloads. Nothing to organize.');
    process.exit(0);
}

// Helper to clean strings
const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

// Scan Temp Directory
fs.readdir(TEMP_DIR, (err, files) => {
    if (err) {
        console.error('Unable to scan directory:', err);
        return;
    }

    let movedCount = 0;

    files.forEach(file => {
        if (!file.endsWith('.json')) return;

        const filePath = path.join(TEMP_DIR, file);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);

            // Validation: Must have artist, title, and versions
            if (data.artist && data.title && Array.isArray(data.versions)) {

                const artistClean = clean(data.artist);
                const titleClean = clean(data.title);
                const firstLetter = artistClean[0] || 'm';

                // Construct Target Path
                const targetDir = path.join(DATA_DIR, firstLetter, artistClean);
                const targetFile = path.join(targetDir, `${titleClean}.json`);

                // Create Directories
                fs.mkdirSync(targetDir, { recursive: true });

                // Move File
                fs.renameSync(filePath, targetFile);

                console.log(`✅ Moved: ${file} -> ${firstLetter}/${artistClean}/${titleClean}.json`);
                movedCount++;
            }
        } catch (e) {
            // Not a valid song file or JSON error, ignore
            // console.debug(`Skipping ${file}: ${e.message}`);
        }
    });

    if (movedCount === 0) {
        console.log('No new song files found in Downloads.');
    } else {
        console.log(`\n🎉 Successfully organized ${movedCount} songs!`);
    }
});
