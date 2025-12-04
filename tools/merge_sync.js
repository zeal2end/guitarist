const fs = require('fs');

const lrcText = `[00:02.98] I found a love, for me
[00:10.36] Darling, just dive right in and follow my lead
[00:17.69] Well, I found a girl, beautiful and sweet
[00:25.37] Oh, I never knew you were the someone waiting for me
[00:31.85] 'Cause we were just kids when we fell in love
[00:36.78] Not knowing what it was
[00:40.74] I will not give you up this time
[00:48.12] But darling, just kiss me slow
[00:51.92] Your heart is all I own
[00:55.78] And in your eyes, you're holding mine
[01:02.37] Baby, I'm dancing in the dark
[01:09.84] With you between my arms
[01:13.76] Barefoot on the grass
[01:17.45] Listening to our favourite song
[01:20.45] When you said you looked a mess
[01:24.20] I whispered underneath my breath
[01:27.76] But you heard it
[01:30.51] Darling, you look perfect tonight
[01:41.07] Well, I found a woman, stronger than anyone I know
[01:48.83] She shares my dreams, I hope that someday I'll share her home
[01:56.58] I found a lover, to carry more than just my secrets
[02:04.51] To carry love, to carry children of our own
[02:10.64] We are still kids, but we're so in love
[02:15.32] Fighting against all odds
[02:19.31] I know we'll be alright this time
[02:26.76] Darling, just hold my hand
[02:30.26] Be my girl, I'll be your man
[02:34.35] I see my future in your eyes
[02:41.01] Baby, I'm dancing in the dark
[02:48.27] With you between my arms
[02:52.32] Barefoot on the grass
[02:55.99] Listening to our favorite song
[02:59.23] When I saw you in that dress, looking so beautiful
[03:05.32] I don't deserve this
[03:09.07] Darling, you look perfect tonight
[03:26.30] Baby, I'm dancing in the dark
[03:33.61] With you between my arms
[03:37.72] Barefoot on the grass
[03:41.42] Listening to our favorite song
[03:44.70] I have faith in what I see
[03:48.49] Now I know I have met an angel in person
[03:54.46] And she looks perfect
[03:58.26] I don't deserve this
[04:02.44] You look perfect tonight`;

const chordProBody = `[Intro]
[G]

[Verse 1]
I found a [G]love for [Em]me
Darling, just [C]dive right in, and follow my [D]lead
Well, I found a [G]girl beauti[Em]ful and sweet
I never [C]knew you were the someone waiting for [D]me

[Pre-Chorus]
Cause we were just kids when we [G]fell in love
Not knowing [Em]what it was, I will not [C]give you up this [G]ti-[D]ime
Darling just [G]kiss me slow, your heart is [Em]all I own
And in your [C]eyes you're holding mi[D]ne

[Chorus]
Baby, [Em]I'm d[C]ancing in the [G]dark, with [D]you between my [Em]arms
[C]Barefoot on the g[G]rass, [D]listening to our [Em]favourite song
When you s[C]aid you looked a [G]mess, I whispered [D]underneath my b[Em]reath
But you h[C]eard it, darling [G]you look [D]perfect ton[G]ight

|(G) D/F# Em D | C  D  |

[Verse 2]
Well, I found a [G]woman, stronger than [Em]anyone I know
She shares my [C]dreams, I hope that someday I'll share her [D]home
I found a l[G]ove, to carry [Em]more than just my secrets
To carry [C]love, to carry children of our [D]own

[Pre-Chorus]
We are still kids, but we're [G]so in love, fighting a[Em]gainst all odds
I know we'll [C]be alright this [G]ti-[D]ime
Darling just [G]hold my hand, be my girl, I'll [Em]be your man
I see my [C]future in your e[D]yes

[Chorus]
Baby, [Em]I'm d[C]ancing in the d[G]ark, with [D]you between my [Em]arms
[C]Barefoot on the g[G]rass, [D]listening to our [Em]favourite song
When I s[C]aw you in that dr[G]ess, looking so b[D]eautiful
I [Em]don't des[C]erve this, darling [G]you look [D]perfect ton[G]ight

[Interlude]
|(G) | G | Em | % |
| C  | % | D  | % |

[Chorus]
Baby, [Em]I'm d[C]ancing in the d[G]ark, with [D]you between my [Em]arms
[C]Barefoot on the g[G]rass, [D]listening to our [Em]favourite song
I have f[C]aith in what I [G]see, now I know [D]I have met an [Em]angel
In p[C]erson, and [G]she looks [D]perfect

[Outro]
I [G/B]don't de[C]serve this, [Dsus4]you look [D]perfect ton[G]ight

|(G) D/F# Em D | C  D  | G`;

function normalize(str) {
    // Remove chords, punctuation, extra spaces, lowercase
    return str.replace(/\[.*?\]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function merge() {
    const lrcLines = lrcText.split('\n').filter(l => l.trim());
    const chordLines = chordProBody.split('\n');

    let lrcIndex = 0;
    const output = [];

    // Parse LRC lines into { time, text }
    const parsedLrc = lrcLines.map(line => {
        const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\](.*)/);
        if (match) {
            return { time: match[1], text: normalize(match[2]) };
        }
        return null;
    }).filter(Boolean);

    for (let i = 0; i < chordLines.length; i++) {
        const line = chordLines[i];
        const normalizedLine = normalize(line);

        if (!normalizedLine) {
            // Empty line or just chords/headers
            // If it's just chords (e.g. [G]), we might want to give it the timestamp of the *next* lyric line?
            // Or just leave it.
            output.push(line);
            continue;
        }

        // Try to find a match in LRC
        // We look ahead a bit in case of mismatch
        let found = false;
        for (let j = lrcIndex; j < Math.min(lrcIndex + 5, parsedLrc.length); j++) {
            // Fuzzy match: if one contains the other
            if (parsedLrc[j].text.includes(normalizedLine) || normalizedLine.includes(parsedLrc[j].text)) {
                output.push(`[${parsedLrc[j].time}] ${line}`);
                lrcIndex = j + 1;
                found = true;
                break;
            }
        }

        if (!found) {
            output.push(line);
        }
    }

    console.log(output.join('\\n'));
}

merge();
