// src/sidepanel/app.js
import { fetchLyrics, fetchFromRepo, fetchFromRandomChords } from '../utils/api.js';
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
    saveLocalBtn: document.getElementById('save-local-btn'),
    resumeSyncBtn: null // Created dynamically
};

// --- Initialization ---

async function init() {
    setupEventListeners();

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

// --- Rendering ---

function renderStudio(data) {
    els.studioContainer.innerHTML = ''; // Clear previous

    if (!data || !data.lines) {
        showPlaceholder('No lyrics or chords found.');
        return;
    }

    data.lines.forEach(line => {
        // Check for Visual Spacers: [Wait: 10s], [Solo: 15s]
        const spacerMatch = line.match(/^\[(Wait|Solo|Intro|Outro):\s*(\d+)s\]/i);
        if (spacerMatch) {
            const type = spacerMatch[1];
            const duration = parseInt(spacerMatch[2], 10);

            const spacerDiv = document.createElement('div');
            spacerDiv.className = 'spacer-block';
            spacerDiv.style.height = `${duration * 10}px`; // 10px per second
            spacerDiv.innerHTML = `<span>${type} (${duration}s)</span>`;

            els.studioContainer.appendChild(spacerDiv);
            return;
        }

        const lineDiv = document.createElement('div');
        lineDiv.className = 'line';

        // Check if line has chords (simple heuristic: contains brackets or known chord patterns)
        // For ChordPro, we expect [Am] lyrics...
        // If it's just text, add a class for styling
        if (!line.includes('[') && !line.includes(']')) {
            lineDiv.classList.add('text-only');
        }

        // Parse Chords: [Am] -> <span class="chord">Am</span>
        // We use a regex to replace all [Chord] with spans
        const html = line.replace(/\[(.*?)\]/g, (match, chord) => {
            return `<span class="chord">${chord}</span>`;
        });

        lineDiv.innerHTML = html;
        els.studioContainer.appendChild(lineDiv);
    });
}

function showPlaceholder(message, isError = false) {
    els.studioContainer.innerHTML = `
        <div class="placeholder">
            <p style="${isError ? 'color: #ff4444;' : ''}">${message}</p>
        </div>
    `;
}

function setLoading(isLoading) {
    if (isLoading) {
        els.studioContainer.innerHTML = `
            <div class="placeholder">
                <div class="spinner"></div>
                <p>Fetching song data...</p>
            </div>
        `;
    }
}

// --- Logic ---

async function loadSong(title, artist) {
    // 1. Check Local Storage (User Edits)
    let data = await loadSongData(title, artist);
    let source = 'local';

    if (!data) {
        setLoading(true);

        // 2. Check Repo
        try {
            data = await fetchFromRepo(title, artist);
            source = 'repo';
        } catch (e) {
            console.warn('Repo fetch failed:', e);
        }

        // 3. Fallback: Random Chords
        if (!data) {
            data = await fetchFromRandomChords(title, artist);
            source = 'random';
        }

        // 4. Fallback: Lyrics
        if (!data) {
            data = await fetchLyrics(title, artist);
            source = 'lyrics';
        }

        setLoading(false);
    }

    if (data) {
        currentSong.data = data;
        renderStudio(data);

        // Show Save Button if from external source
        if (source !== 'local') {
            els.saveLocalBtn.classList.remove('hidden');
            repoData = data; // Store for saving
        } else {
            els.saveLocalBtn.classList.add('hidden');
            repoData = null;
        }
    } else {
        showPlaceholder(`Could not find "${title}" by "${artist}".`, true);
        els.saveLocalBtn.classList.add('hidden');
    }
}

function updateVersionUI() {
    if (!repoData || !repoData.versions || repoData.versions.length <= 1) {
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

init();
