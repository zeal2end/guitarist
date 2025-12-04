// src/sidepanel/app.js
import { fetchLyrics, fetchFromRepo, fetchFromUltimateGuitar, configureRepo } from '../utils/api.js';
import { saveSongData, loadSongData } from '../utils/storage.js';

// State
let currentSong = { title: '', artist: '' };
let repoData = null; // Data from GitHub
let activeVersionIndex = 0;
let isAutoScroll = true;
let scrollOffset = 0; // Offset from theoretical position
let isProgrammaticScroll = false; // Flag to ignore programmatic scrolls

// DOM Elements
const els = {
    title: document.getElementById('track-title'),
    artist: document.getElementById('track-artist'),
    studioContainer: document.getElementById('studio-container'),
    versionSelect: document.getElementById('version-select'),
    versionControl: document.getElementById('version-control'),
    editView: document.getElementById('edit-view'),
    studioView: document.getElementById('studio-view'),
    editTextarea: document.getElementById('edit-textarea'),
    timeDisplay: document.getElementById('time-display'),
    saveBtn: document.getElementById('save-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    editToggleBtn: document.getElementById('edit-toggle-btn'),
    autoScrollToggle: document.getElementById('autoscroll-toggle'),
    // New Elements
    settingsToggleBtn: document.getElementById('settings-toggle-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsSaveBtn: document.getElementById('settings-save-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    githubUsername: document.getElementById('github-username'),
    githubRepo: document.getElementById('github-repo'),
    saveLocalBtn: document.getElementById('save-local-btn'),
    resumeSyncBtn: null // Created dynamically
};

// --- Initialization ---

async function init() {
    setupEventListeners();
    await loadSettings();

    // Create Reset Sync Button
    createResetSyncBtn();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SONG_UPDATE') {
            handleSongUpdate(message.data);
        }
    });
}

function createResetSyncBtn() {
    const btn = document.createElement('button');
    btn.id = 'resume-sync-btn'; // Keep ID for CSS compatibility or change to reset-sync-btn
    btn.className = 'hidden';
    btn.textContent = 'Reset Sync';
    btn.addEventListener('click', () => {
        scrollOffset = 0;
        btn.classList.add('hidden');
        // Immediate snap back will happen on next update or we can force it here if we had data
    });
    document.body.appendChild(btn);
    els.resumeSyncBtn = btn;
}

function setupEventListeners() {
    els.autoScrollToggle.addEventListener('change', (e) => {
        isAutoScroll = e.target.checked;
    });

    // Smart Auto-Scroll: Detect manual scroll
    els.studioContainer.addEventListener('scroll', handleManualScroll);

    // Settings Toggle
    els.settingsToggleBtn.addEventListener('click', () => {
        els.settingsPanel.classList.remove('hidden');
        // Load current values
        chrome.storage.sync.get(['githubUsername', 'githubRepo'], (result) => {
            if (result.githubUsername) els.githubUsername.value = result.githubUsername;
            if (result.githubRepo) els.githubRepo.value = result.githubRepo;
        });
    });

    els.settingsCloseBtn.addEventListener('click', () => {
        els.settingsPanel.classList.add('hidden');
    });

    els.settingsSaveBtn.addEventListener('click', () => {
        const username = els.githubUsername.value.trim();
        const repo = els.githubRepo.value.trim();

        chrome.storage.sync.set({ githubUsername: username, githubRepo: repo }, () => {
            configureRepo(username, repo);
            els.settingsPanel.classList.add('hidden');
            // Reload current song if possible
            if (currentSong.title) loadSong(currentSong.title, currentSong.artist);
        });
    });

    // Save to Local Toggle
    els.saveLocalBtn.addEventListener('click', async () => {
        if (repoData) {
            await saveSongData(currentSong.title, currentSong.artist, repoData);
            alert('Song saved to local storage!');
            els.saveLocalBtn.classList.add('hidden'); // Hide after saving
        }
    });

    // Edit Mode Toggle
    els.editToggleBtn.addEventListener('click', () => {
        els.studioView.classList.remove('active');
        els.editView.classList.add('active');
        // Pre-fill with current content
        if (repoData && repoData.versions) {
            els.editTextarea.value = repoData.versions[activeVersionIndex].body;
        }
    });

    els.cancelBtn.addEventListener('click', () => {
        els.editView.classList.remove('active');
        els.studioView.classList.add('active');
    });

    els.saveBtn.addEventListener('click', async () => {
        const content = els.editTextarea.value;
        // Save as a "Local Override" version
        const localData = {
            title: currentSong.title,
            artist: currentSong.artist,
            versions: [{ label: "My Local Edit", body: content }]
        };

        await saveSongData(currentSong.title, currentSong.artist, localData);

        // Reload
        repoData = localData;
        activeVersionIndex = 0;
        renderStudio(content);
        updateVersionUI();

        els.editView.classList.remove('active');
        els.studioView.classList.add('active');
    });

    els.versionSelect.addEventListener('change', (e) => {
        activeVersionIndex = parseInt(e.target.value);
        renderStudio(repoData.versions[activeVersionIndex].body);
    });
}

function handleManualScroll() {
    if (isProgrammaticScroll) {
        isProgrammaticScroll = false;
        return;
    }

    if (isAutoScroll && currentSong.duration > 0) {
        // Calculate theoretical position
        const progress = currentSong.currentTime / currentSong.duration;
        const scrollHeight = els.studioContainer.scrollHeight - els.studioContainer.clientHeight;
        const theoreticalTop = progress * scrollHeight;

        // Calculate offset
        scrollOffset = els.studioContainer.scrollTop - theoreticalTop;

        // Show Reset Button if offset is significant (e.g. > 50px)
        if (Math.abs(scrollOffset) > 20) {
            if (els.resumeSyncBtn) els.resumeSyncBtn.classList.remove('hidden');
        } else {
            if (els.resumeSyncBtn) els.resumeSyncBtn.classList.add('hidden');
        }
    }
}

async function loadSettings() {
    const result = await chrome.storage.sync.get(['githubUsername', 'githubRepo']);
    if (result.githubUsername && result.githubRepo) {
        configureRepo(result.githubUsername, result.githubRepo);
    }
}

// --- Core Logic ---

async function handleSongUpdate(data) {
    // Update Time
    const formatTime = (t) => {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    els.timeDisplay.textContent = `${formatTime(data.currentTime)}`;

    // Check if song changed
    if (data.title !== currentSong.title || data.artist !== currentSong.artist) {
        currentSong = data;
        els.title.textContent = data.title;
        els.artist.textContent = data.artist;
        await loadSong(data.title, data.artist);
    }

    // Auto-Scroll
    if (isAutoScroll && data.duration > 0) {
        const progress = data.currentTime / data.duration;
        const scrollHeight = els.studioContainer.scrollHeight - els.studioContainer.clientHeight;

        let targetTop = (progress * scrollHeight) + scrollOffset;

        // Clamp
        targetTop = Math.max(0, Math.min(targetTop, scrollHeight));

        // Apply
        if (Math.abs(els.studioContainer.scrollTop - targetTop) > 2) {
            isProgrammaticScroll = true;
            els.studioContainer.scrollTop = targetTop;
        }
    }
}

async function loadSong(title, artist) {
    els.studioContainer.innerHTML = '<p class="placeholder">Searching...</p>';
    els.versionControl.classList.add('hidden');
    els.saveLocalBtn.classList.add('hidden');

    // 1. Check Local Storage (User Edits)
    let data = await loadSongData(title, artist);
    let source = 'local';

    // 2. If not local, check Repo
    if (!data) {
        data = await fetchFromRepo(title, artist);
        source = 'repo';
    }

    // 3. Fallback: Scrape Ultimate Guitar
    if (!data) {
        data = await fetchFromUltimateGuitar(title, artist);
        source = 'ug';
    }

    // 4. Fallback: Fetch Lyrics only (if no Repo data)
    if (!data) {
        const lrc = await fetchLyrics(title, artist);
        if (lrc) {
            // Create a dummy "Lyrics Only" version
            const body = lrc.plainLyrics || lrc.syncedLyrics || "No lyrics found";
            data = {
                versions: [{ label: "Lyrics Only (Auto)", body: body }]
            };
            source = 'lyrics';
        }
    }

    if (data && data.versions && data.versions.length > 0) {
        repoData = data;
        activeVersionIndex = 0;
        renderStudio(data.versions[0].body, data.versions[0].capo);
        updateVersionUI();

        // Show Save Button if not local
        if (source !== 'local') {
            els.saveLocalBtn.classList.remove('hidden');
        }
    } else {
        els.studioContainer.innerHTML = `
      <div class="placeholder">
        <p>Song not found.</p>
        <p>Configure your Repo in Settings or add the song manually!</p>
      </div>
    `;
    }
}

function updateVersionUI() {
    if (!repoData || repoData.versions.length <= 1) {
        els.versionControl.classList.add('hidden');
        return;
    }

    els.versionControl.classList.remove('hidden');
    els.versionSelect.innerHTML = '';
    repoData.versions.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = v.label;
        els.versionSelect.appendChild(opt);
    });
    els.versionSelect.value = activeVersionIndex;
}

// --- Rendering (Interleaved) ---

function renderStudio(text, capo) {
    // Update Capo UI
    const capoEl = document.getElementById('capo-display');
    if (capoEl) { // Check if element exists (it wasn't in original HTML but referenced)
        if (capo) {
            capoEl.textContent = `Capo: ${capo}`;
            capoEl.classList.remove('hidden');
        } else {
            capoEl.classList.add('hidden');
        }
    }

    const lines = text.split('\n');
    let html = '';

    lines.forEach(line => {
        // Check for Visual Spacers: [Wait: 10s], [Solo: 15s]
        const spacerMatch = line.match(/^\[(Wait|Solo|Intro|Outro):\s*(\d+)s\]/i);
        if (spacerMatch) {
            const label = spacerMatch[1];
            const duration = parseInt(spacerMatch[2]);
            // We can't calculate exact pixel height here easily without song duration context in render,
            // but we can give it a relative class or fixed height multiplier.
            // For now, let's just render a visual block.
            html += `<div class="spacer-block" style="height: ${duration * 10}px">
                        <span>${label} (${duration}s)</span>
                     </div>`;
            return;
        }

        // Check if line has chords
        if (line.includes('[')) {
            // Replace chords
            const renderedLine = line.replace(/\[(.*?)\]/g, '<span class="chord">$1</span>');
            html += `<div class="line">${renderedLine}</div>`;
        } else {
            html += `<div class="line text-only">${line}</div>`;
        }
    });

    els.studioContainer.innerHTML = html;
}

init();

