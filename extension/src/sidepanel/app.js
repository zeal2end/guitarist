// src/sidepanel/app.js
import { fetchLyrics, fetchFromRepo, fetchFromRandomChords } from '../utils/api.js';
import { saveSongData, loadSongData } from '../utils/storage.js';
import { parseLRC, parseChordPro } from '../utils/parser.js';

// State
let currentSong = { title: '', artist: '' };
let repoData = null; // Data from GitHub
let activeVersionIndex = 0;
let isAutoScroll = true;
let scrollOffset = 0; // Offset from theoretical position
let isProgrammaticScroll = false; // Flag to ignore programmatic scrolls
let songLines = []; // Structured lines { time, text, type }

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
        renderStudio(content); // Will use default parsing
        updateVersionUI();

        els.editView.classList.remove('active');
        els.studioView.classList.add('active');
    });

    els.versionSelect.addEventListener('change', (e) => {
        activeVersionIndex = parseInt(e.target.value);
        const v = repoData.versions[activeVersionIndex];
        renderStudio(v.body, v.capo);
    });
}

function handleManualScroll() {
    if (isProgrammaticScroll) {
        isProgrammaticScroll = false;
        return;
    }

    if (isAutoScroll) {
        // We just detect manual interaction to show the reset button if needed
        // For precise sync, we might not need offset calculation as much, 
        // but let's keep it simple: if user scrolls, we pause/offset?
        // Actually, for karaoke sync, usually we want to snap back.
        // Let's keep the offset logic but it might fight with precise sync.

        // Simplified: If user scrolls, we assume they want to look around.
        // We can calculate offset from the "active line" position.

        // For now, let's just show the button if they scroll away from where we put them.
        if (els.resumeSyncBtn) els.resumeSyncBtn.classList.remove('hidden');
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

    // Auto-Scroll (Precise / Karaoke)
    if (isAutoScroll && songLines.length > 0) {
        const currentTime = data.currentTime;

        // Find active line
        let activeIndex = -1;
        for (let i = 0; i < songLines.length; i++) {
            if (songLines[i].time !== -1 && currentTime >= songLines[i].time) {
                activeIndex = i;
            } else if (songLines[i].time !== -1 && currentTime < songLines[i].time) {
                break;
            }
        }

        // Highlight Active Line
        const lineEls = els.studioContainer.querySelectorAll('.line');
        lineEls.forEach((el, index) => {
            if (index === activeIndex) {
                el.classList.add('active');

                // Scroll to this line
                if (!els.resumeSyncBtn || els.resumeSyncBtn.classList.contains('hidden')) {
                    isProgrammaticScroll = true;
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                el.classList.remove('active');
            }
        });

        // Fallback for non-synced (ChordPro) - Linear Scroll
        if (activeIndex === -1 && data.duration > 0 && songLines.every(l => l.time === -1)) {
            const progress = data.currentTime / data.duration;
            const scrollHeight = els.studioContainer.scrollHeight - els.studioContainer.clientHeight;
            let targetTop = (progress * scrollHeight) + scrollOffset;
            targetTop = Math.max(0, Math.min(targetTop, scrollHeight));

            if (Math.abs(els.studioContainer.scrollTop - targetTop) > 5) {
                isProgrammaticScroll = true;
                els.studioContainer.scrollTop = targetTop;
            }
        }
    }
}

// --- Rendering ---

function renderStudio(content, capo) {
    els.studioContainer.innerHTML = ''; // Clear previous

    // Update Capo UI
    if (els.capoDisplay) {
        if (capo) {
            els.capoDisplay.textContent = `Capo: ${capo}`;
            els.capoDisplay.classList.remove('hidden');
        } else {
            els.capoDisplay.classList.add('hidden');
        }
    }

    if (!content) {
        showPlaceholder('No lyrics or chords found.');
        songLines = [];
        return;
    }

    // Determine format and parse
    // If content is array, it's already parsed (internal use)
    // If string, check if it looks like LRC
    if (typeof content === 'string') {
        if (content.match(/\[\d{2}:\d{2}/)) {
            songLines = parseLRC(content);
        } else {
            songLines = parseChordPro(content);
        }
    } else if (Array.isArray(content)) {
        songLines = content; // Should not happen with current flow but safe
    }

    songLines.forEach(lineObj => {
        // Check for Visual Spacers (ChordPro specific usually)
        const spacerMatch = lineObj.text.match(/^\[(Wait|Solo|Intro|Outro):\s*(\d+)s\]/i);
        if (spacerMatch) {
            const type = spacerMatch[1];
            const duration = parseInt(spacerMatch[2], 10);

            const spacerDiv = document.createElement('div');
            spacerDiv.className = 'spacer-block';
            spacerDiv.style.height = `${duration * 10}px`;
            spacerDiv.innerHTML = `<span>${type} (${duration}s)</span>`;

            els.studioContainer.appendChild(spacerDiv);
            return;
        }

        const lineDiv = document.createElement('div');
        lineDiv.className = 'line';
        if (lineObj.time !== -1) {
            lineDiv.dataset.time = lineObj.time;
        }

        // Check if line has chords
        if (!lineObj.text.includes('[') && !lineObj.text.includes(']')) {
            lineDiv.classList.add('text-only');
        }

        // Parse Chords: [Am] -> <span class="chord">Am</span>
        const html = lineObj.text.replace(/\[(.*?)\]/g, (match, chord) => {
            // Avoid matching timestamps if they slipped through (parser handles this but safety first)
            if (chord.match(/^\d{2}:\d{2}/)) return '';
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
            const lyricsData = await fetchLyrics(title, artist);
            if (lyricsData) {
                const text = lyricsData.syncedLyrics || lyricsData.plainLyrics;
                if (text) {
                    data = {
                        versions: [{ label: "Lyrics (LRCLIB)", body: text }]
                    };
                    source = 'lyrics';
                }
            }
        }

        setLoading(false);
    }

    if (data) {
        currentSong.data = data;

        // Handle Versions
        if (data.versions && data.versions.length > 0) {
            repoData = data;
            activeVersionIndex = 0;
            renderStudio(data.versions[0].body, data.versions[0].capo);
            updateVersionUI();
        } else {
            // Fallback if no versions array (e.g. raw text)
            renderStudio(typeof data === 'string' ? data : '');
        }

        // Show Save Button if from external source
        if (source !== 'local') {
            els.saveLocalBtn.classList.remove('hidden');
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
