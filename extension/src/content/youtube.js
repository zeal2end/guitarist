// src/content/youtube.js

let lastTitle = '';
let lastTime = 0;

function getSongInfo() {
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
    const videoElement = document.querySelector('video');
    const channelElement = document.querySelector('ytd-video-owner-renderer #text > a');

    if (!titleElement || !videoElement) return null;

    const title = titleElement.innerText;
    const channel = channelElement ? channelElement.innerText : 'Unknown Artist';
    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    const isPaused = videoElement.paused;

    return {
        title,
        artist: channel, // YouTube channels are often the artist
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
