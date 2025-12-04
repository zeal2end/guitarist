// src/utils/storage.js

const STORAGE_KEY_PREFIX = 'song_data_';

/**
 * Sanitizes title and artist to create a consistent storage key.
 */
function getStorageKey(title, artist) {
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${STORAGE_KEY_PREFIX}${safeTitle}_${safeArtist}`;
}

/**
 * Saves song data (lyrics, chords, offsets) to local storage.
 */
export async function saveSongData(title, artist, data) {
    const key = getStorageKey(title, artist);
    await chrome.storage.local.set({ [key]: data });
    console.log('Saved data for', key, data);
}

/**
 * Loads song data from local storage.
 * Returns null if not found.
 */
export async function loadSongData(title, artist) {
    const key = getStorageKey(title, artist);
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
}

/**
 * Clears data for a specific song.
 */
export async function clearSongData(title, artist) {
    const key = getStorageKey(title, artist);
    await chrome.storage.local.remove(key);
}
