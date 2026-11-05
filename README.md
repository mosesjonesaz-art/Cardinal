# Cardinal

Song lyric workshop: syllable counts, stress patterns, rhyme schemes, rhyme and synonym suggestions, and
checks for Suno songs and albums.

## Setup

```bash
./setup.sh      # installs the Python packages and the WordNet thesaurus
```

## Commands

```bash
python lyrics.py analyze song.txt                          # syllables + rhyme scheme per line
python lyrics.py analyze song.txt --target 8,8,7,7 --scheme AABB   # flag misses, suggest fixes
python lyrics.py analyze song.txt --suno                   # also check the Suno songwriting rules
python lyrics.py analyze song.txt --max 8                  # flag lines over 8 syllables (album takes --max too)
python lyrics.py line "I've been walking down this road" --target 8 --rhyme cold
python lyrics.py rhymes fire --syllables 1                 # perfect + slant rhymes, common words first
python lyrics.py words tired --syllables 1                 # synonyms: dead, spent, worn, drained...
python lyrics.py words burning --rhyme night               # synonyms that also rhyme
python lyrics.py compare broken token open hoping          # how well words rhyme
python lyrics.py style "Ethereal emo slowcore, 64 BPM, ..."    # check a Suno style prompt
python lyrics.py album songs/my-album/album.md             # check every track of an album
python lyrics.py album songs/my-album/album.md --track 3   # one track in full
```

Example `analyze` output with a target and scheme:

```
  9  A  Every night it's climbing higher   (perfect, 2-syllable)  <-- 9 vs target 8
          fix: cut 1 syllable, or end on a 1-syllable rhyme for 'fire': wire, hire, dire, ...
  8  C  Couldn't find the words to tell you  <-- 8 vs target 7; should rhyme with 'away' (B)
          fix: cut 1 syllable earlier in the line, and end on a 1-syllable rhyme for 'away': they, way, day, ...
```

- The number is syllables. The letter is the rhyme group: uppercase = perfect rhyme, lowercase = slant.
- `~` marks a line with a word missing from the dictionary (its count is estimated).
- Words in (parentheses) are backing vocals: left out of the line's count and shown as `+N bg`.
- `fix:` lists end words that rhyme and, where possible, fix the syllable count on their own. `swap:` lists
  synonyms for words mid-line that fix the count.
- Each section ends with a summary: lines, syllables, average per line, and its rhyme scheme.

Section tags like `[Verse 1]` split sections, as do blank lines. `[Male]`, `[Female]`, `[Whispered]` and
`[Spoken Word]` stay inside their section.

## Suno songs and albums

The project skill `.claude/skills/suno-concept-album-code` (a Claude Code version of the
`suno-concept-album` skill) has the songwriting rules, the album file layout, and the workflow. Albums live
in `songs/<album-slug>/album.md`, singles in `songs/singles/`.

`--suno` and `album` check the rules a program can check:

- **Rhyme rules:** no rhyming a word with itself, and matching sections (both verses, both pre-choruses)
  use the same scheme.
- **Section rules:** verses have 4-6 lines and pre-choruses 2-4. Choruses repeat exactly; only
  `[Final Chorus]` may change. The chorus must be leaner than the verses.
- **Tags:** only standard Suno tags, with no descriptions inside them.
- **Ready to paste:** every line written out, with no "(same)", "x2" or "repeat" shorthand. In duets,
  `[Male]`, `[Female]` or `[Male & Female]` must sit above every line.
- **Line rules:** no line ending on "the", "to", "and" and similar (a line break is a breath), no repeated
  sound-effect words, no proper names.
- **Genre drift:** words that pulled songs out of their genre. Edit `DRIFT_WORDS` in `lyrics.py` to add more.
- **Rhyme coverage:** every line should rhyme with another line in its section.
- **Mundane words:** utility objects and chores (oil can, kettle...). Add to `MUNDANE_WORDS` in `lyrics.py`.
- **Style prompts:** 200-350 characters, with a BPM, a vocal description and no artist names.
- **Album level:** BPMs spread out, and the tracklist table matching the track sections.

## How it works

- **Syllables and stress** come from the CMU Pronouncing Dictionary through `pronouncing`. Words it doesn't
  know fall back to the `syllables` estimator, after first trying them as two dictionary words
  (streetlights = street + lights).
- **Rhymes:** *perfect* means the sounds match from the last stressed vowel on (fire/higher). *Slant*
  means the vowels match but the consonants differ (time/line, broken/hoping). Matches over two or more
  syllables are marked (money/funny).
- **Synonyms** come from WordNet, put in the same form as your word (climbing → rising), using the most
  common meanings first.
- **Ranking** of suggestions uses `wordfreq`, so rare words are hidden unless you pass `--all`.
