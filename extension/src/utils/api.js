// src/utils/api.js

const LRCLIB_API = 'https://lrclib.net/api';
const REPO_BASE_URL = 'https://raw.githubusercontent.com/zeal2end/guitarist/main/chord-db/data'; // Default

/**
 * Fetch synced lyrics from LRCLIB.
 */
export async function fetchLyrics(title, artist) {
    try {
        const query = new URLSearchParams({
            track_name: title,
            artist_name: artist
        });

        const response = await fetch(`${LRCLIB_API}/get?${query}`);
        if (!response.ok) {
            const searchRes = await fetch(`${LRCLIB_API}/search?q=${encodeURIComponent(title + ' ' + artist)}`);
            const searchData = await searchRes.json();
            if (searchData && searchData.length > 0) {
                return searchData[0];
            }
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error('Lyrics fetch error:', e);
        return null;
    }
}

/**
 * Fetch Song Data (Chords + Metadata) from Custom Repo.
 */
export async function fetchFromRepo(title, artist) {
    try {
        let cleanTitle = title.toLowerCase();
        let cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Remove Artist Name from Title (if present at start)
        // e.g. "Ed Sheeran - Perfect" -> "Perfect"
        // We check for "edsheeran" inside "edsheeranperfect..."
        const simpleTitle = cleanTitle.replace(/[^a-z0-9]/g, '');
        if (simpleTitle.startsWith(cleanArtist)) {
            // Use original cleanTitle for substring to preserve length logic relative to content
            // Actually, we want to remove the artist name from the START of cleanTitle.
            // cleanTitle is "edsheeranperfect"
            // cleanArtist is "edsheeran"
            // We want "perfect"

            // Re-construct cleanTitle from original to be safe? 
            // The logic: simpleTitle is "edsheeranperfect", cleanArtist is "edsheeran"
            // simpleTitle starts with cleanArtist.
            // But simpleTitle has space/dash removed.

            // Better approach using the original title string for robust cleaning:
            const lowerTitle = title.toLowerCase();
            const lowerArtist = artist.toLowerCase();

            // If "Artist - Title" format
            if (lowerTitle.includes(lowerArtist)) {
                // Attempt to remove artist from title if it looks like "Artist - Title"
                const parts = lowerTitle.split(lowerArtist);
                if (parts.length > 1 && parts[0].trim().length < 5) {
                    // Artist is at the start (allow for some junk before)
                    cleanTitle = parts.slice(1).join(lowerArtist).trim(); // Take the rest
                }
            }

            cleanTitle = cleanTitle.replace(/^[\s\-\:]+/, '');
        }

        // 2. Remove Common Junk
        // (Official Video), [Lyrics], ft. X, etc.
        cleanTitle = cleanTitle.replace(/[\(\[](?:official|music|video|lyrics|audio|remastered|live|feat|ft).*?[\)\]]/gi, '');

        // 2b. Remove standalone "Lyrical Video", "Official Video" etc. (case insensitive)
        cleanTitle = cleanTitle.replace(/(?:official|lyrical)\s+(?:music\s+)?video/gi, '');

        // 2c. Handle Pipe Separators and Hyphens
        // Often used like "Song Title | Movie | Artist"
        // We generally want the FIRST part.
        if (cleanTitle.includes('|')) {
            cleanTitle = cleanTitle.split('|')[0].trim();
        }
        // If "Title - Movie" or "Title - Artist", we might want first part if second part is long
        // But be careful of "Part 1 - Intro".
        // Heuristic: If we haven't matched artist at start, and there's a hyphen, take first part?
        // Let's stick to Pipe for now as it's a strong separator.

        cleanTitle = cleanTitle.replace(/(?:official|music|video|lyrics|audio|remastered|live)/gi, '');

        // 3. Final Cleanup
        cleanTitle = cleanTitle.replace(/[^a-z0-9]/g, '');

        const firstLetter = cleanArtist[0] || 'm';

        // Construct URL: data/a/artist/title.json
        const url = `${REPO_BASE_URL}/${firstLetter}/${cleanArtist}/${cleanTitle}.json?t=${Date.now()}`;
        console.log('Fetching from Repo:', url);

        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        } else {
            return { error: `HTTP ${response.status}`, path: `${cleanArtist}/${cleanTitle}.json` };
        }
    } catch (e) {
        console.log('Repo fetch failed:', e);
        return { error: e.message, path: `${cleanArtist}/${cleanTitle}.json` };
    }
    return null;
}

/**
 * Fetch/Scrape from Random Chords Website (Client-Side Best Effort).
 * Note: This is limited by CORS and Anti-Bot. 
 * We use a simple search approach or direct page fetch if possible.
 */
export async function fetchFromRandomChords(title, artist) {
    // TODO: Implement actual scraping logic or a proxy service.
    // For now, this returns null to allow fallback to Lyrics.
    console.log(`Searching Random Chords for ${title} by ${artist}... (Not implemented yet)`);
    return null;
}
