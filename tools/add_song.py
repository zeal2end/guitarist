import os
import json
import re
import sys
import urllib.request
import urllib.parse
from html.parser import HTMLParser

# --- Configuration ---
REPO_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'chord-db', 'data')

# --- Helpers ---

def clean_filename(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def get_storage_path(artist, title):
    artist_clean = clean_filename(artist)
    title_clean = clean_filename(title)
    # Structure: data/a/artist/title.json
    first_letter = artist_clean[0] if artist_clean else 'misc'
    return os.path.join(REPO_ROOT, first_letter, artist_clean, f"{title_clean}.json")

# --- Scraper Logic (Basic HTML Parsing) ---
# Note: Random Chords sites are hard to scrape. We will try a basic search approach.
# If this fails due to anti-bot, we might need to ask the user to paste the URL or content.

class UGSearchParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self.in_result = False
        self.current_link = None
        self.current_title = None
    
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            href = dict(attrs).get('href')
            if href and 'tabs.ultimate-guitar.com/tab/' in href:
                self.current_link = href
                self.in_result = True

    def handle_data(self, data):
        if self.in_result and self.current_link:
            self.results.append({'link': self.current_link, 'title': data.strip()})
            self.in_result = False
            self.current_link = None

def search_ug(query):
    print(f"Searching for: {query}...")
    # This is a mock search because most sites have strict anti-scraping.
    # In a real scenario, we would use a library or Google Custom Search.
    # For this MVP, we will ask the user to PASTE the URL or Tab Content.
    return []

# --- Smart Converter ---

class ChordProConverter:
    @staticmethod
    def is_chord_line(line):
        # A line is a chord line if it contains only valid chords and whitespace.
        # Valid chords: A-G, optionally followed by #/b, then m/maj/dim/aug/sus, then numbers
        # This is a heuristic.
        if not line.strip():
            return False
            
        # Remove whitespace
        tokens = line.split()
        
        # Regex for a single chord
        chord_pattern = r'^[A-G](?:#|b)?(?:m|maj|dim|aug|sus|add)?(?:[0-9]{1,2})?(?:/[A-G](?:#|b)?)?$'
        
        for token in tokens:
            # Allow some common non-chord markers in tabs like |, -, (capo)
            if token in ['|', '-', 'N.C.']: 
                continue
                
            if not re.match(chord_pattern, token):
                return False
                
        return True

    @staticmethod
    def convert(lines):
        output = []
        i = 0
        while i < len(lines):
            line = lines[i].rstrip()
            
            # Check if this is a chord line
            if ChordProConverter.is_chord_line(line):
                # Look ahead for lyrics
                if i + 1 < len(lines) and not ChordProConverter.is_chord_line(lines[i+1]) and lines[i+1].strip():
                    lyrics_line = lines[i+1].rstrip()
                    merged_line = ChordProConverter.merge_lines(line, lyrics_line)
                    output.append(merged_line)
                    i += 2 # Skip both
                else:
                    # Chord line with no lyrics (e.g. Intro)
                    # Just bracket the chords
                    converted = re.sub(r'([A-G](?:#|b)?(?:m|maj|dim|aug|sus|add)?(?:[0-9]{1,2})?(?:/[A-G](?:#|b)?)?)', r'[\1]', line)
                    output.append(converted)
                    i += 1
            else:
                # Just a lyric line or empty line
                output.append(line)
                i += 1
        return "\n".join(output)

    @staticmethod
    def merge_lines(chord_line, lyric_line):
        # We need to insert chords into the lyric line at the correct visual position.
        # We iterate backwards to avoid messing up indices.
        
        # Find all chords and their indices in the chord_line
        chords = []
        for match in re.finditer(r'[A-G](?:#|b)?(?:m|maj|dim|aug|sus|add)?(?:[0-9]{1,2})?(?:/[A-G](?:#|b)?)?', chord_line):
            chords.append((match.start(), match.group()))
            
        # Reverse to insert from right to left
        chords.reverse()
        
        # Pad lyric line if chords extend beyond it
        if len(chord_line) > len(lyric_line):
            lyric_line += " " * (len(chord_line) - len(lyric_line))
            
        result = list(lyric_line)
        
        for index, chord in chords:
            # Insert [Chord] at the index
            # If the index is a space, we replace it or insert before it?
            # Usually tabs align the first letter of the chord with the letter to sing.
            # So we insert *before* that index.
            
            # Safety check
            if index >= len(result):
                result.append(f"[{chord}]")
            else:
                # Insert at position
                result.insert(index, f"[{chord}]")
                
        return "".join(result)

# --- Main Interactive CLI ---

def main():
    print("--- Chord Companion: Add Song ---")
    
    # 1. Get Metadata
    artist = input("Artist Name: ").strip()
    title = input("Song Title: ").strip()
    capo = input("Capo (e.g., '2nd fret', leave empty if none): ").strip()
    
    if not artist or not title:
        print("Error: Artist and Title are required.")
        return

    # 2. Get Content
    print("\nPaste the ChordPro OR Standard Tab content below.")
    print("The tool will automatically convert standard tabs to ChordPro format!")
    print("Tip: Copy from a Random Chords website. (Press Ctrl+D or Ctrl+Z on new line to finish)")
    print("-" * 40)
    
    lines = []
    try:
        while True:
            line = input()
            lines.append(line)
    except EOFError:
        pass
    
    # Process Content
    print("\nProcessing...")
    body = ChordProConverter.convert(lines)
    
    # 3. Create JSON
    song_data = {
        "title": title,
        "artist": artist,
        "versions": [
            {
                "label": "Main Version",
                "capo": capo,
                "body": body
            }
        ]
    }
    
    # 4. Save
    path = get_storage_path(artist, title)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    with open(path, 'w') as f:
        json.dump(song_data, f, indent=2)
    
    print(f"\n[Success] Saved to: {path}")
    print("Don't forget to 'git add' and 'git push'!")

if __name__ == "__main__":
    main()
