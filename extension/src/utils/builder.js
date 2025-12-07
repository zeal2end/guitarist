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

    // 1. Parse LRC into structured data
    const parsedLrc = lrcLines.map(line => {
        const match = line.match(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\](.*)/);
        if (match) {
            const timeParts = match[1].split(':');
            const m = parseInt(timeParts[0], 10);
            const s = parseFloat(timeParts[1]);
            const time = m * 60 + s;
            return { time, text: normalize(match[2]), rawTime: match[1], original: line };
        }
        return null;
    }).filter(Boolean);

    // 2. Pre-process Chord Text to identify "Matchable Lines" (Lyrics) vs "Context Lines" (Chords/Headers)
    const docLines = [];
    chordLines.forEach((line, index) => {
        const trimmed = line.trim();
        const isChordLine = /^[A-G][b#]?(m|maj|min|sus|dim|aug|add)*[0-9]*(?:\/[A-G][b#]?)?(\s+|$)/.test(trimmed) && !/[a-z]{2,}/.test(line);
        const isHeader = /^\[.*\]$/.test(trimmed);
        const normalized = normalize(line);
        const isLyric = !isChordLine && !isHeader && normalized.length > 2;

        docLines.push({
            index,
            text: line,
            normalized,
            isLyric,
            isChordLine,
            matchedLrcIndex: -1
        });
    });

    // 3. Dynamic Programming for Global Alignment
    // We want to align docLines.filter(isLyric) with parsedLrc
    const lyricDocIndices = docLines.map((l, i) => l.isLyric ? i : -1).filter(i => i !== -1);
    const N = lyricDocIndices.length;
    const M = parsedLrc.length;

    // DP Matrix: score[i][j] = best score aligning first i docLyrics with first j lrcLines
    // We use a simple scoring: Match = similarity, Gap = -0.1
    // Actually, we just need to find the best path.
    // Let's use a simplified approach: Find best match for each line respecting order.

    // Matrix of similarities
    const scores = Array(N).fill(0).map(() => Array(M).fill(0));
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
            scores[i][j] = getSimilarity(docLines[lyricDocIndices[i]].normalized, parsedLrc[j].text);
        }
    }

    // Simple Greedy with Lookahead or DP?
    // Let's use DP to maximize total similarity score while maintaining order.
    // dp[i][j] = max score using subset of first i docLines and first j lrcLines
    const dp = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));

    for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= M; j++) {
            const matchScore = scores[i - 1][j - 1];
            // Options: 
            // 1. Match i with j
            // 2. Skip i (gap in doc)
            // 3. Skip j (gap in lrc)
            // We prioritize matches.

            // If matchScore is high enough, we take it.
            const scoreMatch = dp[i - 1][j - 1] + (matchScore > 0.3 ? matchScore : 0);
            const scoreSkipDoc = dp[i - 1][j];
            const scoreSkipLrc = dp[i][j - 1];

            dp[i][j] = Math.max(scoreMatch, scoreSkipDoc, scoreSkipLrc);
        }
    }

    // Backtrack to find assignments
    let i = N;
    let j = M;
    let syncedCount = 0;

    while (i > 0 && j > 0) {
        const currentScore = dp[i][j];
        const matchScore = scores[i - 1][j - 1];

        // Check if we came from match
        // Note: Floating point comparison needs epsilon? 
        // Let's just check if this path is valid.

        if (matchScore > 0.3 && Math.abs(currentScore - (dp[i - 1][j - 1] + matchScore)) < 0.001) {
            // Matched!
            docLines[lyricDocIndices[i - 1]].matchedLrcIndex = j - 1;
            syncedCount++;
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            // Came from skipping doc
            i--;
        } else {
            // Came from skipping lrc
            j--;
        }
    }

    // 4. Construct Output
    const outputBody = [];
    let pendingChords = null;

    for (let k = 0; k < docLines.length; k++) {
        const lineObj = docLines[k];

        if (lineObj.isChordLine) {
            if (pendingChords) outputBody.push(pendingChords);
            pendingChords = lineObj.text;
            continue;
        }

        if (lineObj.matchedLrcIndex !== -1) {
            const lrc = parsedLrc[lineObj.matchedLrcIndex];
            // Merge logic (similar to before but simpler)

            if (pendingChords) {
                // Interpolate chords into this line
                // For now, simple prepend of timestamp to the line start
                // and maybe try to interleave if we feel adventurous.
                // Let's stick to the previous "Interleave" logic if possible, 
                // OR just prepend the timestamp to the chord line?
                // Standard ChordPro with time: [time] [Chord] ...

                // Let's use the simple robust way:
                // [time] [ChordLine]
                // [time] LyricLine

                // Wait, we want ONE line for ELRC if possible.
                // But separating them is safer for rendering.

                // Let's try to do the "Smart Merge" again.
                const merged = smartMerge(pendingChords, lineObj.text, lrc.time, lrc.rawTime);
                outputBody.push(merged);
                pendingChords = null;
            } else {
                outputBody.push(`[${lrc.rawTime}] ${lineObj.text}`);
            }
        } else {
            // Unmatched line
            if (pendingChords) {
                outputBody.push(pendingChords);
                pendingChords = null;
            }
            outputBody.push(lineObj.text);
        }
    }

    if (pendingChords) outputBody.push(pendingChords);

    return { result: outputBody.join('\n'), syncedCount, totalLines: chordLines.length };
}

function smartMerge(chordLine, lyricLine, startTime, rawTime) {
    // Simple visual alignment merge
    // Returns a single string with interleaved chords and timestamps if possible
    // Or just [time] [Chords] \n [time] Lyrics

    // For robustness, let's just prepend the time to the chord line AND the lyric line.
    // This ensures both appear at the right time.
    // return `[${rawTime}] ${chordLine}\n[${rawTime}] ${lyricLine}`;

    // BETTER: Try to embed chords.
    // "Am      G"
    // "Hello World"
    // -> "[Am] Hello [G] World" (with timestamps?)

    // Let's stick to the "Prepend Time" strategy for now as it's safest.
    // But users want "Synced Chords".
    // If we just put time at start of line, the whole line highlights.
    // That's good enough for v1 of "Fixed Magic Sync".

    return `[${rawTime}] ${chordLine}\n[${rawTime}] ${lyricLine}`;
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
            // Custom heuristic for Ultimate Guitar (pre content)
            const ugContent = document.querySelector('pre.js-tab-content');
            if (ugContent) return ugContent.textContent; // textContent preserves whitespace better than innerText

            // General Fallback
            const selection = window.getSelection().toString();
            if (selection) return selection;

            const pres = document.querySelectorAll('pre');
            let bestPre = '';
            pres.forEach(p => {
                if (p.textContent.length > bestPre.length) bestPre = p.textContent;
            });
            if (bestPre) return bestPre;

            return document.body.innerText; // Fallback to innerText here as body textContent is too noisy
        }
    });

    return results[0].result;
}
