// src/utils/api.js

const LRCLIB_API = 'https://lrclib.net/api';
let repoBaseUrl = 'https://raw.githubusercontent.com/YOUR_USERNAME/chord-db/main/data'; // Default

/**
 * Configure the Repo URL dynamically.
 */
export function configureRepo(username, repoName) {
    if (username && repoName) {
        repoBaseUrl = `https://raw.githubusercontent.com/${username}/${repoName}/main/data`;
        console.log('Repo configured:', repoBaseUrl);
    }
}

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
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const firstLetter = cleanArtist[0] || 'm';

        // Construct URL: data/a/artist/title.json
        const url = `${repoBaseUrl}/${firstLetter}/${cleanArtist}/${cleanTitle}.json`;

        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.log('Repo fetch failed (song might not exist yet):', e);
    }
    return null;
}

/**
 * Fetch/Scrape from Ultimate Guitar (Client-Side Best Effort).
 * Note: This is limited by CORS and Anti-Bot. 
 * We use a simple search approach or direct page fetch if possible.
 */
export async function fetchFromUltimateGuitar(title, artist) {
    // TODO: Implement actual scraping logic or a proxy service.
    // For now, this returns null to allow fallback to Lyrics.
    console.log(`Searching UG for ${title} by ${artist}... (Not implemented yet)`);
    return null;
}
