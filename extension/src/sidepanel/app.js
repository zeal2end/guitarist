// src/sidepanel/app.js
import { fetchLyrics, fetchFromRepo, fetchFromRandomChords } from '../utils/api.js';
import { saveSongData, loadSongData } from '../utils/storage.js';
import { parseLRC, parseChordPro } from '../utils/parser.js';
import { mergeContent, scrapeCurrentTab } from '../utils/builder.js';

// --- VIEW MANAGER ---
const ViewManager = {
    views: {
        player: document.getElementById('view-player'),
        builder: document.getElementById('view-builder'),
        studio: document.getElementById('view-studio')
    },

    switch(viewName) {
        Object.values(this.views).forEach(el => el.classList.remove('active'));
        if (this.views[viewName]) {
            this.views[viewName].classList.add('active');
        }
    }
};

// --- STATE ---
const State = {
    song: { title: '', artist: '' },
    repoData: null,
    isPlaying: false,
    isSyncMode: false,
    isScrollLocked: true, // Default to locked (auto-scroll)
    scrollSpeed: 1.0,
    lines: [], // Structured song data

    // Sync Studio State
    syncTokens: [],
    syncIndex: 0,
    isTapMode: false
};

// --- DOM ELEMENTS ---
const els = {
    // Header
    title: document.getElementById('track-title'),
    artist: document.getElementById('track-artist'),
    trackCapo: document.getElementById('track-capo'),
    navPlayer: document.getElementById('nav-player'),
    navBuilder: document.getElementById('nav-builder'),

    // Player
    lyricsContainer: document.getElementById('lyrics-container'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    btnSpeedUp: document.getElementById('btn-speed-up'),
    btnSpeedDown: document.getElementById('btn-speed-down'),
    displaySpeed: document.getElementById('display-speed'),
    btnSpeedDown: document.getElementById('btn-speed-down'),
    displaySpeed: document.getElementById('display-speed'),
    btnSyncToggle: document.getElementById('btn-sync-toggle'),
    btnSnapSync: document.getElementById('btn-snap-sync'),

    // Builder
    inputArtist: document.getElementById('input-artist'),
    inputTitle: document.getElementById('input-title'),
    inputContent: document.getElementById('input-content'),
    btnImport: document.getElementById('btn-import'),
    btnMagicSync: document.getElementById('btn-magic-sync'),
    btnOpenStudio: document.getElementById('btn-open-studio'),
    btnSaveBrowser: document.getElementById('btn-save-browser'),
    btnSaveDisk: document.getElementById('btn-save-disk'),

    // Studio
    studioStage: document.getElementById('studio-stage'),
    btnStudioCancel: document.getElementById('btn-studio-cancel'),
    btnStudioStart: document.getElementById('btn-studio-start'),
    btnStudioSave: document.getElementById('btn-studio-save'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// --- INITIALIZATION ---
function init() {
    setupListeners();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SONG_UPDATE') {
            handleSongUpdate(message.data);
        }
    });
}

function setupListeners() {
    // Navigation
    els.navPlayer.addEventListener('click', () => ViewManager.switch('player'));
    els.navBuilder.addEventListener('click', () => {
        ViewManager.switch('builder');
        // Auto-fill
        if (State.song.title) els.inputTitle.value = State.song.title;
        if (State.song.artist) els.inputArtist.value = State.song.artist;
    });

    // Player Controls
    els.btnPlayPause.addEventListener('click', toggleScrollLock);
    els.btnSpeedUp.addEventListener('click', () => changeSpeed(0.2));
    els.btnSpeedDown.addEventListener('click', () => changeSpeed(-0.2));
    els.btnSpeedUp.addEventListener('click', () => changeSpeed(0.2));
    els.btnSpeedDown.addEventListener('click', () => changeSpeed(-0.2));
    els.btnSyncToggle.addEventListener('click', toggleSyncMode);
    els.btnSnapSync.addEventListener('click', snapToSync);

    // Scroll Listener (User Interaction)
    els.lyricsContainer.addEventListener('scroll', handleUserScroll);

    // Builder Controls
    els.btnImport.addEventListener('click', handleImport);
    els.btnMagicSync.addEventListener('click', handleMagicSync);
    els.btnOpenStudio.addEventListener('click', openSyncStudio);
    els.btnSaveBrowser.addEventListener('click', saveToBrowser);
    els.btnSaveDisk.addEventListener('click', saveToDisk);

    // Studio Controls
    els.btnStudioCancel.addEventListener('click', () => ViewManager.switch('builder'));
    els.btnStudioStart.addEventListener('click', startTapSync);
    els.btnStudioSave.addEventListener('click', saveSyncData);

    // Global Keydown (for Tapping)
    document.addEventListener('keydown', (e) => {
        if (State.isTapMode && e.code === 'Space') {
            e.preventDefault();
            handleTap();
        }
    });
}

// --- PLAYER LOGIC ---

function updateSongInfo() {
    els.title.textContent = State.song.title || 'No Song Detected';
    els.artist.textContent = State.song.artist || 'Waiting for YouTube...';

    if (State.song.capo) {
        els.trackCapo.textContent = `Capo: ${State.song.capo}`;
        els.trackCapo.style.display = 'inline-block';
    } else {
        els.trackCapo.style.display = 'none';
    }
}

async function handleSongUpdate(data) {
    // 1. Check if song changed
    if (data.title !== State.song.title || data.artist !== State.song.artist) {
        State.song = { ...State.song, ...data }; // Update State.song with new data, including capo if present
        updateSongInfo();
        await loadSong(data.title, data.artist);
    }

    State.song.currentTime = data.currentTime;

    // 2. Sync Play/Pause State
    // Only update if we are NOT in the middle of a user interaction to avoid jitter
    // But generally, the source of truth is the video.
    const shouldBePlaying = !data.isPaused;
    if (State.isPlaying !== shouldBePlaying) {
        State.isPlaying = shouldBePlaying;
        // We don't update the button here anymore, as the button controls LOCK state, not Play state.
        // But we do need to start/stop scroll based on play state if locked.
        updateScrollState();
    }

    // 3. Sync Logic (Karaoke)
    if (State.isSyncMode && State.isPlaying && State.lines.length > 0) {
        updateKaraoke(data.currentTime);
    }
}

function updateKaraoke(currentTime) {
    const SYNC_DELAY = 0.5;
    const targetTime = currentTime - SYNC_DELAY;

    // Find Active Line
    let activeLineIndex = -1;
    for (let i = 0; i < State.lines.length; i++) {
        if (State.lines[i].time !== -1 && State.lines[i].time <= targetTime) {
            activeLineIndex = i;
        } else if (State.lines[i].time > targetTime) {
            break;
        }
    }

    // Clear all active lines globally first
    document.querySelectorAll('.line.active').forEach(l => l.classList.remove('active'));

    if (activeLineIndex !== -1) {
        const lineEl = els.lyricsContainer.querySelector(`.line[data-index="${activeLineIndex}"]`);
        if (lineEl) {
            // Apply new active state
            lineEl.classList.add('active');

            if (State.isScrollLocked) {
                lastAutoScrollTime = Date.now();
                // Scroll behavior: smooth center
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Highlight Token
            const lineObj = State.lines[activeLineIndex];
            if (lineObj.tokens) {
                let activeTokenIndex = -1;
                for (let j = 0; j < lineObj.tokens.length; j++) {
                    if (lineObj.tokens[j].time <= targetTime) activeTokenIndex = j;
                    else break;
                }

                if (activeTokenIndex !== -1) {
                    const tokenEl = lineEl.querySelector(`.token[data-index="${activeTokenIndex}"]`);
                    if (tokenEl) {
                        // Clear active tokens in this line
                        lineEl.querySelectorAll('.token.active').forEach(t => t.classList.remove('active'));
                        tokenEl.classList.add('active');
                    }
                }
            }
        }
    }
}

async function loadSong(title, artist) {
    showToast('Loading song...', 'info');

    // 1. Local Storage
    let data = await loadSongData(title, artist);

    // 2. Repo
    if (!data) {
        try {
            data = await fetchFromRepo(title, artist);
        } catch (e) { console.warn(e); }
    }

    // 3. Random Fallback
    if (!data || data.error) {
        data = await fetchFromRandomChords(title, artist);
    }

    if (data && !data.error) {
        State.repoData = data;
        const content = data.versions ? data.versions[0].body : (typeof data === 'string' ? data : '');
        renderPlayer(content);
        showToast('Song loaded!', 'success');
    } else {
        els.lyricsContainer.innerHTML = `<div class="placeholder flex-center flex-col" style="height: 100%; opacity: 0.5;"><p>Song not found.</p></div>`;
    }
}

function renderPlayer(content) {
    els.lyricsContainer.innerHTML = '';
    els.lyricsContainer.scrollTop = 0; // Reset scroll position

    let hasTimestamps = false;

    if (typeof content === 'string') {
        if (content.match(/\[\d{2}:\d{2}/)) {
            State.lines = parseLRC(content);
            hasTimestamps = true;
        } else {
            State.lines = parseChordPro(content);
        }
    }

    // Auto-enable Sync Mode if timestamps are present
    if (hasTimestamps) {
        State.isSyncMode = true;
    } else {
        State.isSyncMode = false;
    }
    updateSyncToggleUI();

    // RENDER LOOP
    els.lyricsContainer.innerHTML = '';

    // Legacy / Text Mode (No Timestamps)
    if (!hasTimestamps) {
        State.lines.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'line';
            div.dataset.index = i;

            // Regex Highlighting for Text Tabs
            let content = line.text;

            // Highlight Chords
            content = content.replace(
                /\b[A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*\b(?![a-z])/g,
                (match) => `<span class="chord-token">${match}</span>`
            );

            // Highlight Sections (e.g., [Verse 1], [Chorus])
            content = content.replace(
                /\[(Verse|Chorus|Bridge|Intro|Outro|Solo|Instrumental).*?\]/gi,
                (match) => `<span class="section-token">${match}</span>`
            );

            div.innerHTML = content || '&nbsp;';
            els.lyricsContainer.appendChild(div);
        });
        return;
    }

    // Standard Mode (LRC / Tokenized)
    State.lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'line';
        div.dataset.index = i;

        if (line.tokens && line.tokens.length > 0) {
            line.tokens.forEach((token, j) => {
                const span = document.createElement('span');
                span.className = 'token';
                span.dataset.index = j;

                const text = token.text.trim();
                // Check if it's a bracketed token
                if (/^\[.*?\]$/.test(text)) {
                    const innerText = text.replace(/[\[\]]/g, '');

                    // Check if likely a Section Header
                    if (/^(Verse|Chorus|Bridge|Intro|Outro|Solo|Instrumental)/i.test(innerText)) {
                        span.classList.add('section-token');
                        span.textContent = token.text; // Keep brackets for headers? User preference. Let's keep.
                    }
                    // Else assume Chord (or random metadata like [00:12]) Wait, timestamps are stripped? 
                    // No, invalid timestamps might remain.
                    // Assume anything else short is a chord
                    else {
                        span.classList.add('chord-token');
                        span.textContent = innerText + ' '; // Remove brackets for chords + space
                    }
                } else {
                    span.textContent = token.text;
                }
                div.appendChild(span);
            });
        } else {
            div.textContent = line.text;
        }

        els.lyricsContainer.appendChild(div);
    });
}

function updateSyncToggleUI() {
    els.btnSyncToggle.style.color = State.isSyncMode ? 'var(--primary)' : 'var(--text-muted)';
    els.btnSyncToggle.style.textShadow = State.isSyncMode ? '0 0 10px var(--primary-glow)' : 'none';
}

// --- CONTROLS ---

function toggleScrollLock() {
    State.isScrollLocked = !State.isScrollLocked;
    updateScrollLockUI();
    updateScrollState();
}

// Global variable to track auto-scrolling
let lastAutoScrollTime = 0;

function handleUserScroll() {
    const now = Date.now();
    // Grace period of 1000ms after an auto-scroll command
    if (now - lastAutoScrollTime < 1000) return;

    if (State.isScrollLocked) {
        // User manually scrolled while locked -> Unlock
        State.isScrollLocked = false;
        updateScrollLockUI();
        stopAutoScroll(); // Stop the loop
    }
}

function updateScrollState() {
    if (State.isPlaying && State.isScrollLocked && !State.isSyncMode) {
        startAutoScroll();
    } else {
        stopAutoScroll();
    }
}

function updateScrollLockUI() {
    // Icon: Lock (Auto-Scroll On) vs Unlock (Manual)
    els.btnPlayPause.innerHTML = State.isScrollLocked
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" title="Auto-Scroll ON"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H8.9V6zM18 20H6V10h12v10z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" title="Auto-Scroll OFF"><path d="M18 1c-2.76 0-5 2.24-5 5v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2h-1V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H20V6c0-2.76-2.24-5-5-5zm-2 9h12v10H6V10h12z"/></svg>`; // Simplified unlock icon

    // Visual feedback
    els.btnPlayPause.style.color = State.isScrollLocked ? 'var(--primary)' : 'var(--text-muted)';

    // Snap Button Visibility
    if (!State.isScrollLocked) {
        els.btnSnapSync.classList.add('visible');
    } else {
        els.btnSnapSync.classList.remove('visible');
    }
}

// --- SCROLL LOGIC ---

let isAutoScrolling = false; // Flag to distinguish auto-scroll from user scroll




function snapToSync() {
    State.isScrollLocked = true;
    updateScrollLockUI();

    // Force immediate scroll to current time
    if (State.isPlaying) {
        if (State.isSyncMode) {
            updateKaraoke(State.song.currentTime);
        } else {
            startAutoScroll();
        }
    }
}

function toggleSyncMode() {
    State.isSyncMode = !State.isSyncMode;
    updateSyncToggleUI();

    if (State.isSyncMode) {
        stopAutoScroll();
        showToast('Sync Mode ON', 'success');
    } else {
        if (State.isPlaying) startAutoScroll();
        showToast('Auto-Scroll ON', 'info');
    }
}

// --- BUILDER & SYNC STUDIO ---

async function handleImport() {
    els.btnImport.textContent = 'Importing...';
    const text = await scrapeCurrentTab();
    if (text) {
        els.inputContent.value = text;
        showToast('Tab imported!', 'success');
    } else {
        showToast('No tab found.', 'error');
    }
    els.btnImport.textContent = '📥 Import Tab';
}

async function handleMagicSync() {
    const artist = els.inputArtist.value;
    const title = els.inputTitle.value;
    const chords = els.inputContent.value;

    if (!artist || !title || !chords) {
        showToast('Fill all fields first.', 'error');
        return;
    }

    els.btnMagicSync.textContent = 'Syncing...';
    try {
        const lyricsData = await fetchLyrics(title, artist);
        if (lyricsData && typeof lyricsData.syncedLyrics === 'string') {
            const { result, syncedCount } = mergeContent(chords, lyricsData.syncedLyrics);
            els.inputContent.value = result;
            showToast(`Synced ${syncedCount} lines!`, 'success');
        } else {
            showToast('No lyrics found.', 'error');
        }
    } catch (e) {
        showToast('Sync failed.', 'error');
    }
    els.btnMagicSync.textContent = '✨ Magic Sync';
}

function openSyncStudio() {
    const text = els.inputContent.value;
    if (!text.trim()) {
        showToast('No content to sync.', 'error');
        return;
    }

    ViewManager.switch('studio');

    // Try to extract Capo
    const capoMatch = text.match(/Capo:?\s*(\d+)/i);
    if (capoMatch) {
        State.song.capo = capoMatch[1];
        updateSongInfo();
    } else {
        State.song.capo = null;
        updateSongInfo();
    }

    // Tokenize for Studio
    const lines = parseLRC(text);
    State.syncTokens = []; // We might reuse this structure or simplify
    // Actually, for Click-to-Sync, we care about LINES, not tokens.
    // But we need to preserve the token structure for saving?
    // Let's store lines in State.syncLines
    State.syncLines = [];
    els.studioStage.innerHTML = '';

    lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'line sync-line';
        div.style.cursor = 'pointer';
        div.style.padding = '10px';
        div.style.border = '1px solid var(--glass-border)';
        div.style.borderRadius = '8px';
        div.style.marginBottom = '8px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        // Text Content
        const textSpan = document.createElement('span');
        textSpan.textContent = line.text || '[Empty Line]';
        textSpan.style.flex = '1';
        textSpan.style.textAlign = 'left';

        // Timestamp Badge
        const timeBadge = document.createElement('span');
        timeBadge.className = 'time-badge';
        timeBadge.style.fontFamily = 'var(--font-mono)';
        timeBadge.style.fontSize = '0.8rem';
        timeBadge.style.background = 'rgba(255,255,255,0.1)';
        timeBadge.style.padding = '2px 6px';
        timeBadge.style.borderRadius = '4px';
        timeBadge.textContent = line.time !== -1 ? formatTime(line.time) : '--:--';

        div.appendChild(textSpan);
        div.appendChild(timeBadge);

        // Click Handler
        div.addEventListener('click', () => handleLineSync(i));

        State.syncLines.push({
            text: line.text,
            time: line.time,
            el: div,
            badge: timeBadge,
            originalTokens: line.tokens
        });

        els.studioStage.appendChild(div);
    });

    // Show current time in header?
    // We can use a live timer update loop for the studio view
    startStudioTimer();
}

function startTapSync() {
    // In Click-to-Sync, "Start" just means "Clear all and get ready"? 
    // Or maybe just "Play Video".
    // Let's make it "Reset All Timestamps" or just "Play".
    // Requirements: "User clicks a line's start button when the song reaches that line."

    // Let's just play the video.
    // And maybe clear existing times if user wants? 
    // For now, assume they might want to edit.

    // We don't need a special "Tap Mode" state anymore, just listening for clicks.
    chrome.runtime.sendMessage({ type: 'PLAY_VIDEO' }); // This might need to be re-added to youtube.js if we removed it? 
    // Wait, we removed TOGGLE_PLAY. We need to check if we can still Play.
    // Requirements said "Extension Play Button... Does NOT pause/play the video."
    // But for Studio, maybe we can ask the user to play?
    // Or we can send a "Request Play" if we really want, but let's stick to "Read Only".
    // So "Start Tapping" button might be misleading. 
    // Let's rename it to "Clear Times" or remove it.

    // Actually, let's keep it as "Clear All" for now.
    if (confirm('Clear all timestamps?')) {
        State.syncLines.forEach(l => {
            l.time = -1;
            l.badge.textContent = '--:--';
            l.el.classList.remove('synced');
        });
    }
}

function handleLineSync(index) {
    const now = State.song.currentTime || 0;
    const line = State.syncLines[index];

    line.time = now;
    line.badge.textContent = formatTime(now);
    line.el.classList.add('synced');
    line.el.style.borderColor = 'var(--primary)';

    // Auto-scroll to next line?
    // Maybe not, let user control.
}

let studioTimerFrame = null;
function startStudioTimer() {
    if (studioTimerFrame) cancelAnimationFrame(studioTimerFrame);

    function update() {
        if (document.getElementById('view-studio').classList.contains('active')) {
            // Update header or something with current time?
            // For now, just relying on video.
        }
        studioTimerFrame = requestAnimationFrame(update);
    }
    studioTimerFrame = requestAnimationFrame(update);
}

// Update saveSyncData to use State.syncLines
function saveSyncData() {
    const lines = State.syncLines.map(l => {
        const timeStr = l.time !== -1 ? formatTime(l.time) : '';
        return `${timeStr} ${l.text}`.trim();
    });

    els.inputContent.value = lines.join('\n');
    ViewManager.switch('builder');
    showToast('Data saved to Builder', 'success');
}

// Old saveSyncData removed.

// --- UTILS ---

function showToast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    if (type === 'error') div.style.borderLeft = '4px solid var(--error)';
    if (type === 'success') div.style.borderLeft = '4px solid var(--success)';

    els.toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    const ms = Math.floor((s % 1) * 100).toString().padStart(2, '0');
    return `[${m}:${sec}.${ms}]`;
}

// Auto Scroll Engine (Simplified)
let scrollFrame = null;
let lastTime = 0;
let scrollAccumulator = 0;

function startAutoScroll() {
    if (scrollFrame) return;
    lastTime = performance.now();
    scrollAccumulator = 0; // Reset accumulator
    scrollFrame = requestAnimationFrame(loop);
}

function stopAutoScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
}

function loop(now) {
    if (!State.isPlaying) return;
    const delta = now - lastTime;
    lastTime = now;

    // Accumulate fractional pixels
    const rawPixels = (20 * State.scrollSpeed * delta) / 1000;
    scrollAccumulator += rawPixels;

    if (scrollAccumulator >= 1) {
        const pixelsToScroll = Math.floor(scrollAccumulator);
        isAutoScrolling = true; // Set flag before scrolling
        els.lyricsContainer.scrollTop += pixelsToScroll;
        // We need to reset the flag after the scroll event fires.
        // However, scroll event is async/next tick usually. 
        // A better way is to check the time in the event handler? 
        // Or use a timeout.
        requestAnimationFrame(() => { isAutoScrolling = false; });

        scrollAccumulator -= pixelsToScroll;
    }

    scrollFrame = requestAnimationFrame(loop);
}

// Save Handlers
async function saveToBrowser() {
    const { title, artist } = State.song;
    const content = els.inputContent.value;
    if (!title || !content) return;

    await saveSongData(title, artist, {
        title, artist, versions: [{ label: "Builder", body: content }]
    });
    showToast('Saved to browser!', 'success');

    // Reload Player
    loadSong(title, artist);
    ViewManager.switch('player');
}

async function saveToDisk() {
    const { title, artist } = State.song;
    const content = els.inputContent.value;
    const blob = new Blob([JSON.stringify({
        title, artist, versions: [{ label: "ChordPro", body: content }]
    }, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
        url, filename: `chord-companion-temp/${artist}-${title}.json`, saveAs: false
    });
    showToast('Downloaded JSON!', 'success');
}

function changeSpeed(delta) {
    State.scrollSpeed = Math.max(0.2, Math.min(5.0, State.scrollSpeed + delta));
    els.displaySpeed.textContent = State.scrollSpeed.toFixed(1) + 'x';
}

init();
