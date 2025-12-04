import { fetchLyrics } from './api.js';

// --- Merging Logic (Ported from generate_song.js) ---

function normalize(str) {
    return str.replace(/\[.*?\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// Jaccard Similarity for fuzzy matching
function getSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

export function mergeContent(chordText, syncedLyrics) {
    const lrcLines = syncedLyrics.split('\n').filter(l => l.trim());
    const chordLines = chordText.split('\n');

    // Parse LRC
    const parsedLrc = lrcLines.map(line => {
        const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\](.*)/);
        if (match) {
            return { time: match[1], text: normalize(match[2]) };
        }
        return null;
    }).filter(Boolean);

    let lrcIndex = 0;
    let syncedCount = 0;
    const outputBody = [];

    for (let i = 0; i < chordLines.length; i++) {
        const line = chordLines[i];

        // Check if line is a Chord Line (heuristic)
        // Matches lines with only chords, spaces, and occasional symbols
        const isChordLine = /^[A-G][b#]?(m|maj|min|sus|dim|aug|add)*[0-9]*(?:\/[A-G][b#]?)?(\s+|$)/.test(line.trim()) &&
            !/[a-z]{2,}/.test(line); // No words longer than 2 chars (avoids "Am I...")

        // Check for Headers
        const isHeader = /^\[.*\]$/.test(line.trim());

        if (isChordLine || isHeader) {
            outputBody.push(line);
            continue;
        }

        const normalizedLine = normalize(line);

        if (!normalizedLine || normalizedLine.length < 3) { // Skip short noise
            outputBody.push(line);
            continue;
        }

        let bestMatch = null;
        let bestScore = 0;
        let bestIndex = -1;

        // Look ahead window (increased to 15)
        for (let j = lrcIndex; j < Math.min(lrcIndex + 15, parsedLrc.length); j++) {
            const lrcText = parsedLrc[j].text;

            // Exact substring match (strongest)
            if (lrcText.includes(normalizedLine) || normalizedLine.includes(lrcText)) {
                bestMatch = parsedLrc[j];
                bestIndex = j;
                bestScore = 1.0;
                break; // Found exact, stop looking
            }

            // Fuzzy match
            const score = getSimilarity(normalizedLine, lrcText);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = parsedLrc[j];
                bestIndex = j;
            }
        }

        // Threshold for fuzzy match
        if (bestMatch && bestScore > 0.4) {
            outputBody.push(`[${bestMatch.time}] ${line}`);
            lrcIndex = bestIndex + 1;
            syncedCount++;
        } else {
            outputBody.push(line);
        }
    }

    return { result: outputBody.join('\n'), syncedCount, totalLines: chordLines.length };
}

// --- Scraping Logic ---

export async function scrapeCurrentTab() {
    // In Side Panel, 'currentWindow' is the side panel itself. We want the user's browser window.
    // 'lastFocusedWindow' is usually the best bet.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (!tab) {
        console.warn("No active tab found in last focused window.");
        return null;
    }

    // Check if we can inject (avoid restricted URLs like chrome://)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        console.warn("Cannot inject into restricted URL:", tab.url);
        return null;
    }

    // Inject script to get text
    const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            // Heuristics for common sites
            // Ultimate Guitar
            const ugContent = document.querySelector('pre.js-tab-content');
            if (ugContent) return ugContent.innerText;

            // General Fallback: Try to find the biggest <pre> or just return selection
            const selection = window.getSelection().toString();
            if (selection) return selection;

            const pres = document.querySelectorAll('pre');
            let bestPre = '';
            pres.forEach(p => {
                if (p.innerText.length > bestPre.length) bestPre = p.innerText;
            });
            if (bestPre) return bestPre;

            return document.body.innerText;
        }
    });

    return results[0].result;
}
