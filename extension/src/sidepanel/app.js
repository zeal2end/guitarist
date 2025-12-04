// src/sidepanel/app.js
import { fetchLyrics, fetchFromRepo, fetchFromRandomChords } from '../utils/api.js';
import { saveSongData, loadSongData } from '../utils/storage.js';
import { parseLRC, parseChordPro } from '../utils/parser.js';
import { mergeContent, scrapeCurrentTab } from '../utils/builder.js';

// State
let currentSong = { title: '', artist: '' };
let repoData = null; // Data from GitHub
let activeVersionIndex = 0;
let scrollSpeed = 1.0;
let isPlaying = false;
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
    saveLocalBtn: document.getElementById('save-local-btn'),

    // Speed Controls
    speedDownBtn: document.getElementById('speed-down-btn'),
    speedUpBtn: document.getElementById('speed-up-btn'),
    speedDisplay: document.getElementById('speed-display'),
    playPauseBtn: document.getElementById('play-pause-btn'),

    // Builder
    builderView: document.getElementById('builder-view'),
    builderToggleBtn: document.getElementById('builder-toggle-btn'),
    builderBackBtn: document.getElementById('builder-back-btn'),
    builderScrapeBtn: document.getElementById('builder-scrape-btn'),
    builderSyncBtn: document.getElementById('builder-sync-btn'),
    builderSaveLocalBtn: document.getElementById('builder-save-local-btn'),
    builderSaveDiskBtn: document.getElementById('builder-save-disk-btn'),
    builderArtist: document.getElementById('builder-artist'),
    builderTitle: document.getElementById('builder-title'),
    builderInput: document.getElementById('builder-input')
};

// --- Initialization ---

async function init() {
    setupEventListeners();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SONG_UPDATE') {
            handleSongUpdate(message.data);
        }
    });
}

function setupEventListeners() {
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




// Builder Toggle
els.builderToggleBtn.addEventListener('click', () => {
    els.studioView.classList.remove('active');
    els.builderView.classList.add('active');
    // Auto-fill if we have current song info
    if (currentSong.title) els.builderTitle.value = currentSong.title;
    if (currentSong.artist) els.builderArtist.value = currentSong.artist;

    // Clear any previous error messages from the studio view
    const errorMsg = els.studioContainer.querySelector('div[style*="color: #ff4444"]');
    if (errorMsg) errorMsg.remove();
});

els.builderBackBtn.addEventListener('click', () => {
    els.builderView.classList.remove('active');
    els.studioView.classList.add('active');
});

// Scrape
els.builderScrapeBtn.addEventListener('click', async () => {
    els.builderScrapeBtn.textContent = 'Importing...';
    try {
        const text = await scrapeCurrentTab();
        if (text) {
            els.builderInput.value = text;
        } else {
            alert('Could not find text on this page.');
        }
    } catch (e) {
        console.error(e);
        alert('Import failed. Make sure you are on a web page.');
    }
    els.builderScrapeBtn.textContent = '📥 Import from Tab';
});

// Magic Sync
els.builderSyncBtn.addEventListener('click', async () => {
    const artist = els.builderArtist.value;
    const title = els.builderTitle.value;
    const chords = els.builderInput.value;

    if (!artist || !title || !chords) {
        alert('Please fill in Artist, Title, and Content.');
        return;
    }

    els.builderSyncBtn.textContent = 'Syncing...';

    try {
        const lyricsData = await fetchLyrics(title, artist);
        if (lyricsData && lyricsData.syncedLyrics) {
            const { result, syncedCount } = mergeContent(chords, lyricsData.syncedLyrics);
            els.builderInput.value = result;

            if (syncedCount === 0) {
                alert('Warning: Could not match any lines. Check if lyrics match the chords.');
            } else {
                alert(`Synced successfully! Matched ${syncedCount} lines.`);
            }
        } else {
            alert('Could not find synced lyrics for this song.');
        }
    } catch (e) {
        console.error(e);
        alert('Sync failed.');
    }

    els.builderSyncBtn.textContent = '✨ Magic Sync';
});

// Save Builder Result (Browser Storage)
els.builderSaveLocalBtn.addEventListener('click', async () => {
    const artist = els.builderArtist.value;
    const title = els.builderTitle.value;
    const content = els.builderInput.value;

    if (!artist || !title || !content) return;

    const localData = {
        title: title,
        artist: artist,
        versions: [{ label: "Builder Version", body: content }]
    };

    await saveSongData(title, artist, localData);

    // Load it
    currentSong = { title, artist, currentTime: 0, duration: 0 }; // Reset
    repoData = localData;
    activeVersionIndex = 0;
    renderStudio(content);
    updateVersionUI();

    els.builderView.classList.remove('active');
    els.studioView.classList.add('active');

    // Update header
    els.title.textContent = title;
    els.artist.textContent = artist;
});

// Copy JSON    // Speed Controls
els.speedDownBtn.addEventListener('click', () => {
    scrollSpeed = Math.max(0.2, scrollSpeed - 0.2);
    els.speedDisplay.textContent = `${scrollSpeed.toFixed(1)}x`;
});

els.speedUpBtn.addEventListener('click', () => {
    scrollSpeed = Math.min(5.0, scrollSpeed + 0.2);
    els.speedDisplay.textContent = `${scrollSpeed.toFixed(1)}x`;
});

els.playPauseBtn.addEventListener('click', () => {
    if (isPlaying) stopAutoScroll();
    else startAutoScroll();
});

// Save to Disk (Builder)
els.builderSaveDiskBtn.addEventListener('click', async () => {
    const artist = els.builderArtist.value;
    const title = els.builderTitle.value;
    const content = els.builderInput.value;

    if (!artist || !title || !content) {
        alert('Please fill in Artist, Title, and Content.');
        return;
    }

    const songData = {
        title: title,
        artist: artist,
        versions: [{
            label: "ChordPro Version",
            capo: "Check Tab",
            body: content
        }]
    };

    await saveToDisk(songData);
});
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

    // Auto-Scroll (Speed Based)
    // We don't use timestamps anymore. We just scroll if playing.
    if (isPlaying && !isProgrammaticScroll) {
        // This is handled by the animation loop, not here.
        // handleSongUpdate just updates metadata now.
    }
}

// --- Auto Scroll Engine ---
let scrollFrameId = null;
let lastTime = 0;
let expectedAutoScrollPos = -1; // To detect user vs script scroll
let preciseScrollPos = 0; // Accumulator for sub-pixel scrolling
let isUserInteracting = false;
let interactionTimeout = null;

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function startAutoScroll() {
    if (scrollFrameId) return;
    isPlaying = true;
    els.playPauseBtn.innerHTML = PAUSE_ICON;
    lastTime = performance.now();

    // Initialize precise position from current DOM state
    preciseScrollPos = els.studioContainer.scrollTop;
    expectedAutoScrollPos = preciseScrollPos;

    scrollFrameId = requestAnimationFrame(scrollLoop);
}

function stopAutoScroll() {
    isPlaying = false;
    els.playPauseBtn.innerHTML = PLAY_ICON;
    if (scrollFrameId) {
        cancelAnimationFrame(scrollFrameId);
        scrollFrameId = null;
    }
    if (interactionTimeout) {
        clearTimeout(interactionTimeout);
        interactionTimeout = null;
    }
    isUserInteracting = false;
}

function scrollLoop(timestamp) {
    if (!isPlaying) return;

    if (isUserInteracting) {
        lastTime = timestamp;
        scrollFrameId = requestAnimationFrame(scrollLoop);
        return;
    }

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // Increased base speed for better responsiveness
    const baseSpeed = 20;
    const pixelsToScroll = (baseSpeed * scrollSpeed * deltaTime) / 1000;

    if (pixelsToScroll > 0) {
        // Update the precise float accumulator
        preciseScrollPos += pixelsToScroll;

        // Record expectation before applying
        expectedAutoScrollPos = preciseScrollPos;

        // Apply to DOM (browser will handle rounding, but we keep the float in preciseScrollPos)
        els.studioContainer.scrollTop = preciseScrollPos;
    }

    scrollFrameId = requestAnimationFrame(scrollLoop);
}

// Detect Manual Scroll
els.studioContainer.addEventListener('scroll', () => {
    if (!isPlaying) return;

    // Check if the current scroll position matches what we set
    // Allow a small margin of error (2px) for sub-pixel rendering/rounding
    const diff = Math.abs(els.studioContainer.scrollTop - expectedAutoScrollPos);

    // If diff is small, it's likely our own auto-scroll -> Ignore
    if (diff < 2) return;

    handleUserInteraction();
});

// Proactive Interaction Detection (Wheel, Touch, Click, Key)
const interactionEvents = ['wheel', 'mousedown', 'touchstart', 'keydown'];
interactionEvents.forEach(evt => {
    els.studioContainer.addEventListener(evt, handleUserInteraction, { passive: true });
});

function handleUserInteraction() {
    if (!isPlaying) return;

    isUserInteracting = true;

    if (interactionTimeout) clearTimeout(interactionTimeout);

    interactionTimeout = setTimeout(() => {
        isUserInteracting = false;
        // Sync precise position with where the user left it
        preciseScrollPos = els.studioContainer.scrollTop;
        expectedAutoScrollPos = preciseScrollPos;
    }, 400); // Reduced delay to 0.4s for instant resume
}

// --- File System Save ---
async function saveToDisk(songData) {
    const cleanArtist = songData.artist.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTitle = songData.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Save to a dedicated temp folder to avoid cluttering Downloads
    const filename = `chord-companion-temp/${cleanArtist}-${cleanTitle}.json`;
    const jsonStr = JSON.stringify(songData, null, 2);

    try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        await chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false // Save directly
        });

        // alert(`Saved ${filename} to Downloads.\nRun 'node tools/organize_downloads.js' to move it to your repo.`);
    } catch (e) {
        console.error('Download failed:', e);
        alert('Save failed. Copying JSON to clipboard instead.');
        await navigator.clipboard.writeText(jsonStr);
        alert('JSON copied to clipboard!');
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
        // Check for Visual Spacers
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

        // Check for Section Headers (e.g. [Verse 1], [Chorus])
        // If the line is JUST a bracketed text, treat as header
        const headerMatch = lineObj.text.match(/^\[(Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|Interlude).*?\]$/i);
        if (headerMatch) {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'section-header';
            headerDiv.textContent = lineObj.text.replace(/[\[\]]/g, '');
            headerDiv.style.color = 'var(--accent-color)';
            headerDiv.style.opacity = '0.8';
            headerDiv.style.fontSize = '0.9em';
            headerDiv.style.marginTop = '1rem';
            headerDiv.style.marginBottom = '0.5rem';
            headerDiv.style.textTransform = 'uppercase';
            headerDiv.style.letterSpacing = '1px';

            if (lineObj.time !== -1) {
                headerDiv.dataset.time = lineObj.time;
                headerDiv.classList.add('line'); // Add .line so it can be active/scrolled
            }

            els.studioContainer.appendChild(headerDiv);
            return;
        }

        const lineDiv = document.createElement('div');
        lineDiv.className = 'line';
        if (lineObj.time !== -1) {
            // Apply Sync Delay (e.g. +0.5s) to fix "running ahead"
            // If lyrics are ahead, it means they show up too early, so we need to increase the time?
            // "Lyrics are running ahead" -> They appear before the audio reaches that point.
            // So we need to wait longer.
            // Actually, if they are "ahead" (future), they are appearing too early.
            // Wait, "ahead" usually means "I see line 2 but audio is at line 1".
            // So the timestamp for line 2 is too small. We need to ADD delay.
            const SYNC_DELAY = 0.5;
            lineDiv.dataset.time = lineObj.time + SYNC_DELAY;
        }

        // Check if line has chords
        if (!lineObj.text.includes('[') && !lineObj.text.includes(']')) {
            lineDiv.classList.add('text-only');
            lineDiv.textContent = lineObj.text;
        } else {
            // Parse Chords for "Chords Above" style
            let chordLine = '';
            let lyricLine = '';

            // Regex to find chords: [Am]
            // We iterate through the string
            const parts = lineObj.text.split(/(\[.*?\])/);

            parts.forEach(part => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const content = part.slice(1, -1);
                    // Heuristic: If it's short (< 6 chars) or looks like a chord, treat as chord.
                    // Otherwise, treat as lyric (e.g. [spoken]).
                    // For now, assume all brackets are chords if not headers.

                    const chord = content;
                    // Add chord to chordLine at current position
                    while (chordLine.length < lyricLine.length) {
                        chordLine += ' ';
                    }
                    chordLine += chord + ' ';
                } else {
                    lyricLine += part;
                }
            });

            // Only render chord line if it has content
            const hasChords = chordLine.trim().length > 0;

            lineDiv.innerHTML = `
                ${hasChords ? `<div class="chord-line" style="color: var(--accent-color); font-weight: bold; height: 1.2em; white-space: pre; margin-bottom: -0.2em;">${chordLine}</div>` : ''}
                <div class="lyric-line" style="white-space: pre-wrap; line-height: 1.5;">${lyricLine}</div>
            `;
        }

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
            const repoRes = await fetchFromRepo(title, artist);
            if (repoRes && !repoRes.error) {
                data = repoRes;
                source = 'repo';
            } else if (repoRes && repoRes.error) {
                console.warn('Repo Error:', repoRes.error);
                // Store error to show in UI if everything else fails
                if (!data) data = { error: repoRes.error, path: repoRes.path };
            }
        } catch (e) {
            console.warn('Repo fetch failed:', e);
        }

        // 3. Fallback: Random Chords
        if (!data) {
            data = await fetchFromRandomChords(title, artist);
            source = 'random';
        }

        // 4. Fallback: Lyrics
        if (!data || data.error) {
            const lyricsData = await fetchLyrics(title, artist);
            if (lyricsData) {
                const text = lyricsData.syncedLyrics || lyricsData.plainLyrics;
                if (text) {
                    // If we had a repo error, keep it to show the user
                    const path = data && data.path ? data.path : 'unknown';
                    const errorMsg = data && data.error ? `[Repo Error: ${data.error} (Path: ${path})]` : '';
                    data = {
                        versions: [{ label: "Lyrics (LRCLIB)", body: text }],
                        repoError: null // Suppress error if we found lyrics
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

            // Show Repo Error if exists (and we are falling back to lyrics)
            if (data.repoError) {
                const errorEl = document.createElement('div');
                errorEl.style.color = '#ff4444';
                errorEl.style.padding = '10px';
                errorEl.style.textAlign = 'center';
                errorEl.innerText = data.repoError;
                els.studioContainer.prepend(errorEl);
            }
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
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');

        let errorDetails = '';
        if (repoData && repoData.error) {
            errorDetails = `\nRepo Error: ${repoData.error}`;
        }

        const debugMsg = `Could not find "${title}" by "${artist}".\n\nLooking for:\n${cleanArtist}/${cleanTitle}.json\n${errorDetails}\n\nChecked: Local, Repo, Lyrics.`;
        showPlaceholder(debugMsg, true);
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
