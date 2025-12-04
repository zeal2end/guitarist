# Chord Companion

A Chrome Extension that displays interleaved lyrics and chords for songs playing on Spotify or YouTube. It features auto-scrolling, local editing, and a smart import tool for adding new songs.

## Features

-   **Synced Chords**: Automatically finds and displays chords for the currently playing song.
-   **Auto-Scroll**: smooth scrolling synchronized with the song's duration.
-   **Smart Import**: Paste standard tabs (from sites like Random Chords), and they are automatically converted to the required format.
-   **Local & Cloud**: Works with a local database or a shared GitHub repository.
-   **Transposition**: (Coming soon) Capo support and key changes.

## Installation

1.  **Clone or Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer Mode** (top right toggle).
4.  Click **Load Unpacked**.
5.  Select the `ChordCompanion/extension` folder.

## Adding Songs

We provide a Python tool to easily add new songs to your database.

1.  Open your terminal.
2.  Navigate to the `ChordCompanion` directory.
3.  Run the tool:
    ```bash
    python3 tools/add_song.py
    ```
4.  Enter the **Artist** and **Title**.
5.  **Paste the content**: You can copy "chords-over-lyrics" tabs directly from websites. The tool's **Smart Converter** will automatically format them for the extension.
6.  The song is saved to `chord-db/data/...`.

## GitHub Integration (Sync Across Devices)

To share your chord database across devices or with friends, you can host it on GitHub.

### 1. Create a Repository
1.  Go to GitHub and create a new repository (e.g., `my-chord-db`).
2.  Initialize it in your `ChordCompanion` folder:
    ```bash
    cd ChordCompanion
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/my-chord-db.git
    git push -u origin main
    ```

### 2. Configure the Extension
1.  Open `extension/src/utils/api.js`.
2.  Find the `REPO_BASE_URL` constant.
3.  Update it with your raw GitHub URL:
    ```javascript
    // Replace YOUR_USERNAME and REPO_NAME
    const REPO_BASE_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/my-chord-db/main/chord-db/data';
    ```
4.  **Reload the extension** in `chrome://extensions`.

Now, the extension will fetch songs from your GitHub repository!
