const fs = require('fs');
const https = require('https');
const readline = require('readline');

// --- Configuration ---
const LRCLIB_API = 'https://lrclib.net/api';

// --- Helpers ---
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null); // Return null on parse error (or non-JSON)
                }
            });
        }).on('error', reject);
    });
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

function normalize(str) {
    return str.replace(/\[.*?\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// --- Main Logic ---
async function main() {
    console.log("--- Chord Companion: Song Generator ---");

    // 1. Get Metadata
    const artist = await askQuestion("Artist Name: ");
    const title = await askQuestion("Song Title: ");

    if (!artist || !title) {
        console.error("Artist and Title are required.");
        return;
    }

    // 2. Fetch Lyrics (LRCLIB)
    console.log(`\nFetching synced lyrics for "${title}" by "${artist}"...`);
    const query = new URLSearchParams({ track_name: title, artist_name: artist });
    let lyricsData = await fetchJson(`${LRCLIB_API}/get?${query}`);

    if (!lyricsData) {
        console.log("Direct match not found. Searching...");
        const searchRes = await fetchJson(`${LRCLIB_API}/search?q=${encodeURIComponent(title + ' ' + artist)}`);
        if (searchRes && searchRes.length > 0) {
            lyricsData = searchRes[0];
            console.log(`Found: ${lyricsData.trackName} by ${lyricsData.artistName}`);
        }
    }

    if (!lyricsData || !lyricsData.syncedLyrics) {
        console.error("Could not find synced lyrics on LRCLIB. :(");
        // We could allow manual entry, but for now let's exit.
        return;
    }

    console.log("Lyrics found!");

    // 3. Get Chords (Manual Paste for now, as scraping is hard)
    console.log("\nPaste the ChordPro/Tab content below (Ctrl+D to finish):");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const chordLines = [];
    for await (const line of rl) {
        chordLines.push(line);
    }

    // 4. Merge
    console.log("\nMerging...");
    const lrcLines = lyricsData.syncedLyrics.split('\n').filter(l => l.trim());

    // Parse LRC
    const parsedLrc = lrcLines.map(line => {
        const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\](.*)/);
        if (match) {
            return { time: match[1], text: normalize(match[2]) };
        }
        return null;
    }).filter(Boolean);

    let lrcIndex = 0;
    const outputBody = [];

    for (let i = 0; i < chordLines.length; i++) {
        const line = chordLines[i];
        const normalizedLine = normalize(line);

        if (!normalizedLine) {
            outputBody.push(line);
            continue;
        }

        let found = false;
        for (let j = lrcIndex; j < Math.min(lrcIndex + 10, parsedLrc.length); j++) {
            if (parsedLrc[j].text.includes(normalizedLine) || normalizedLine.includes(parsedLrc[j].text)) {
                outputBody.push(`[${parsedLrc[j].time}] ${line}`);
                lrcIndex = j + 1;
                found = true;
                break;
            }
        }

        if (!found) {
            outputBody.push(line);
        }
    }

    // 5. Save
    const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstLetter = cleanArtist[0] || 'm';
    const path = `chord-db/data/${firstLetter}/${cleanArtist}/${cleanTitle}.json`;

    const songData = {
        title: title,
        artist: artist,
        versions: [{
            label: "Synced Version",
            capo: "Check Tab",
            body: outputBody.join('\n')
        }]
    };

    const fs = require('fs');
    const pathModule = require('path');

    fs.mkdirSync(pathModule.dirname(path), { recursive: true });
    fs.writeFileSync(path, JSON.stringify(songData, null, 2));

    console.log(`\n[Success] Saved to: ${path}`);
    console.log("Don't forget to push to git!");
}

main();
