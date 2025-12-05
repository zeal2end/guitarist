/**
 * Parses LRC format lyrics into structured data.
 * Format: [mm:ss.xx] Line content
 * Returns: Array of { time: number (seconds), text: string, type: 'lyric' }
 */
export function parseLRC(lrcText) {
    if (!lrcText) return [];

    const lines = lrcText.split('\n');
    const result = [];

    // Regex for Line Start Timestamp: [mm:ss.xx]
    const lineTimeRegex = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;
    // Regex for Inline Timestamp: [mm:ss.xx] (global)
    const inlineTimeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    lines.forEach(line => {
        const match = line.match(lineTimeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
            const startTime = minutes * 60 + seconds + (milliseconds / 1000);

            // Remove the start timestamp to get the content
            let content = line.replace(lineTimeRegex, '');

            // Parse Inline Tokens
            const tokens = [];
            let lastIndex = 0;
            let inlineMatch;

            // Reset regex state
            inlineTimeRegex.lastIndex = 0;

            while ((inlineMatch = inlineTimeRegex.exec(content)) !== null) {
                // Text before this timestamp
                const textBefore = content.slice(lastIndex, inlineMatch.index);
                if (textBefore) {
                    // Assign the *previous* timestamp to this text
                    // If it's the first token, it gets the line start time.
                    // If it's later, it gets the time of the previous token?
                    // Wait, standard ELRC: [time] Word [time] Word
                    // "Word" happens AT [time].
                    // So: [00:01] Hello [00:02] World
                    // "Hello" is at 00:01. "World" is at 00:02.

                    // What if: [00:01] Hello World
                    // Both are at 00:01.

                    // Logic: The text *following* a timestamp belongs to that timestamp.
                    // But what about text *before* the first inline timestamp?
                    // It belongs to the Line Start Timestamp.

                    // So:
                    // 1. Text from Start to Match -> startTime
                    // 2. Match -> newTime
                    // 3. Text from Match to Next Match -> newTime
                }

                // We need to capture the text segments.
                // Let's split by the regex but keep delimiters?
                // Simpler: Just iterate.
            }

            // Simpler Tokenizer:
            // 1. Split string by timestamp regex, capturing the timestamps.
            // content: " [Am] Hello [00:13.20] [G] world"
            // split: [" [Am] Hello ", "00", "13", "20", " [G] world"] (messy)

            // Better:
            // Use a loop to build tokens.
            // Initial time = startTime.

            let currentTime = startTime;
            let cursor = 0;
            const lineTokens = [];

            // We need to find all timestamps in the content
            // content: "Hello [00:02.00] World"
            // match: index 6
            // text: "Hello " (at startTime)
            // update currentTime -> 2.00
            // text: " World" (at 2.00)

            // Re-run regex loop
            inlineTimeRegex.lastIndex = 0;
            while ((inlineMatch = inlineTimeRegex.exec(content)) !== null) {
                const textSegment = content.slice(cursor, inlineMatch.index);
                if (textSegment) {
                    lineTokens.push({ text: textSegment, time: currentTime });
                }

                // Update time for next segment
                const m = parseInt(inlineMatch[1], 10);
                const s = parseInt(inlineMatch[2], 10);
                const ms = inlineMatch[3] ? parseInt(inlineMatch[3].padEnd(3, '0'), 10) : 0;
                currentTime = m * 60 + s + (ms / 1000);

                cursor = inlineMatch.index + inlineMatch[0].length;
            }

            // Add remaining text
            if (cursor < content.length) {
                lineTokens.push({ text: content.slice(cursor), time: currentTime });
            }

            // If no tokens (empty line?), push one empty token
            if (lineTokens.length === 0 && content.trim()) {
                lineTokens.push({ text: content, time: startTime });
            }

            if (lineTokens.length > 0) {
                result.push({
                    time: startTime,
                    text: content, // Raw text (without start timestamp, but WITH inline timestamps? No, stripped?)
                    // Let's keep raw text stripped of timestamps for display fallback
                    cleanText: lineTokens.map(t => t.text).join(''),
                    type: 'lyric',
                    tokens: lineTokens
                });
            }
        } else {
            // Non-timestamped line
            const text = line.trim();
            if (text) {
                result.push({ time: -1, text, type: 'text', tokens: [{ text, time: -1 }] });
            }
        }
    });

    return result;
}

/**
 * Parses ChordPro or Plain Text.
 * Returns: Array of { time: -1, text: string, type: 'chordpro' }
 * (We don't extract time from ChordPro usually, unless custom tags are used)
 */
export function parseChordPro(text) {
    if (!text) return [];
    return text.split('\n').map(line => ({
        time: -1,
        text: line,
        type: 'chordpro'
    }));
}
