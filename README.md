# Cardinal

Tools for writing song lyrics: syllable counts, stress patterns, rhyme schemes and rhyme suggestions.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
python lyrics.py analyze songs/my-song.txt           # syllables + rhyme scheme per line
python lyrics.py analyze songs/my-song.txt --stress  # also show stressed syllables
python lyrics.py analyze songs/my-song.txt --target 8,8,7,7   # flag lines that miss a syllable target
python lyrics.py line "I've been runnin' through the fire"
python lyrics.py rhymes fire                         # perfect + slant rhymes, common words first
python lyrics.py compare broken token open hoping    # how well words rhyme
```

Example `analyze` output:

```
[Chorus]
  5  A  Hold on to the time
  6  a  Every broken line   (slant)
  7  A  We were hoping for a sign   (perfect)
  7  A  Ain't nobody's fault but mine   (perfect)
```

The number is syllables, the letter is the rhyme group (uppercase = perfect rhyme, lowercase = slant
rhyme), and `~` marks a line with a word missing from the dictionary (its count is estimated).

Put lyrics in `songs/` as plain text. Section labels like `[Verse 1]` or `(Chorus)` are skipped, and blank
lines separate stanzas.

## How it works

- **Syllables and stress** come from the CMU Pronouncing Dictionary through `pronouncing`. Words it
  doesn't know (slang, made-up words) fall back to the `syllables` estimator.
- **Rhymes**: *perfect* means the sounds match from the last stressed vowel on (fire/higher). *Slant*
  means the vowels match but the consonants differ (time/line, broken/hoping). Matches across two or more
  syllables are shown as multisyllabic (money/funny).
- **Rhyme suggestions** are ranked by how common the word is (`wordfreq`), so rare words and names are
  hidden unless you pass `--all`.
