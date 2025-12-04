const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function main() {
    console.log("--- Chord Companion: Save Song ---");
    console.log("Paste the JSON content from the extension below.");
    console.log("Press Enter, then Ctrl+D (or Ctrl+Z on Windows) when done:\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let jsonInput = '';
    for await (const line of rl) {
        jsonInput += line + '\n';
    }

    try {
        const songData = JSON.parse(jsonInput);

        if (!songData.artist || !songData.title) {
            throw new Error("JSON is missing 'artist' or 'title' fields.");
        }

        const cleanArtist = songData.artist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanTitle = songData.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const firstLetter = cleanArtist[0] || 'm';

        const relativePath = `chord-db/data/${firstLetter}/${cleanArtist}/${cleanTitle}.json`;
        const fullPath = path.join(__dirname, '..', relativePath);

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, JSON.stringify(songData, null, 2));

        console.log(`\n[Success] Saved to: ${relativePath}`);
        console.log("Ready to git push!");

    } catch (e) {
        console.error("\n[Error] Invalid JSON or write failed:");
        console.error(e.message);
    }
}

main();
