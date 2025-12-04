// src/content/spotify.js

function getSongInfo() {
    // Spotify Web Player selectors (subject to change by Spotify)
    const nowPlayingWidget = document.querySelector('[data-testid="now-playing-widget"]');
    const trackName = document.querySelector('[data-testid="context-item-link"]');
    const artistName = document.querySelector('[data-testid="context-item-info-artist"]');

    // Progress bar usually has aria-valuenow (time in seconds) or we can parse the time string
    const playbackProgressBar = document.querySelector('[data-testid="playback-position"]');
    const durationElement = document.querySelector('[data-testid="playback-duration"]');

    // Play/Pause button
    const playButton = document.querySelector('[data-testid="control-button-playpause"]');
    const isPaused = playButton ? playButton.getAttribute('aria-label') === 'Play' : true;

    if (!trackName || !artistName) return null;

    let currentTime = 0;
    let duration = 0;

    if (playbackProgressBar) {
        // Often text content is "0:00"
        currentTime = parseTime(playbackProgressBar.textContent);
    }

    if (durationElement) {
        duration = parseTime(durationElement.textContent);
    }

    return {
        title: trackName.textContent,
        artist: artistName.textContent,
        currentTime,
        duration,
        isPaused,
        platform: 'spotify'
    };
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

function sendUpdate() {
    const info = getSongInfo();
    if (info) {
        chrome.runtime.sendMessage({
            type: 'SONG_UPDATE',
            data: info
        });
    }
}

// Poll for updates
setInterval(sendUpdate, 1000);
