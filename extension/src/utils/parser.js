/**
 * Parses LRC format lyrics into structured data.
 * Format: [mm:ss.xx] Line content
 * Returns: Array of { time: number (seconds), text: string, type: 'lyric' }
 */
export function parseLRC(lrcText) {
    if (!lrcText) return [];

    const lines = lrcText.split('\n');
    const result = [];

    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

    lines.forEach(line => {
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;

            const time = minutes * 60 + seconds + (milliseconds / 1000);
            // Don't trim() here! We need to preserve spaces for chord alignment.
            const text = line.replace(timeRegex, '');

            if (text) {
                result.push({ time, text, type: 'lyric' });
            }
        } else {
            // Handle non-timestamped lines (metadata or plain text)
            // We'll treat them as having no time (or -1) so they render but don't sync
            const text = line.trim();
            if (text) {
                result.push({ time: -1, text, type: 'text' });
            }
        }
    });

    return result.sort((a, b) => a.time - b.time);
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
