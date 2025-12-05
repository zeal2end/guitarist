// src/content/youtube.js

let lastTitle = '';
let lastTime = 0;

function getSongInfo() {
    // Strategy 1: Modern/Standard Layout (ytd-watch-metadata)
    let title = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string')?.innerText;
    let channel = document.querySelector('ytd-watch-metadata #channel-name a')?.innerText;

    // Strategy 2: Older Layout (ytd-video-primary-info-renderer)
    if (!title) {
        title = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')?.innerText;
    }
    if (!channel) {
        channel = document.querySelector('ytd-video-owner-renderer #text > a')?.innerText;
    }

    // Strategy 3: Hidden/Meta tags (Fallback)
    if (!title) {
        title = document.querySelector('meta[name="title"]')?.content;
    }

    const videoElement = document.querySelector('video');
    if (!videoElement) return null;

    // If we still have no title, we might be on a page that isn't a video yet, or layout changed drastically.
    // Return null to avoid sending bad data.
    if (!title) return null;

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    const isPaused = videoElement.paused;

    return {
        title,
        artist: channel || 'Unknown Artist',
        currentTime,
        duration,
        isPaused,
        platform: 'youtube'
    };
}

function sendUpdate() {
    const info = getSongInfo();
    if (info) {
        // Only send if something changed significantly or it's a heartbeat
        // For smooth scrolling, we might need frequent updates, but let's throttle slightly
        chrome.runtime.sendMessage({
            type: 'SONG_UPDATE',
            data: info
        });
    }
}

// Poll for updates
setInterval(sendUpdate, 1000);

// Listen for specific video events for faster response
const video = document.querySelector('video');
if (video) {
    video.addEventListener('play', sendUpdate);
    video.addEventListener('pause', sendUpdate);
    video.addEventListener('seeked', sendUpdate);
}

// No message listeners for playback control anymore (Read-Only)
