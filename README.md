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
python lyrics.py analyze songs/my-song.txt --target 8,8,7,7 --scheme AABB
                                                     # flag lines that miss, with suggested fixes
python lyrics.py line "I've been walking down this road" --target 8 --rhyme cold
python lyrics.py rhymes fire                         # perfect + slant rhymes, common words first
python lyrics.py rhymes fire --syllables 1           # only rhymes that fit in 1 syllable
python lyrics.py compare broken token open hoping    # how well words rhyme
```

When you give a syllable target (`--target`) or rhyme scheme (`--scheme`, `X` = no rhyme needed), each
line that misses gets a `fix:` line with replacement end words. Where possible, the suggested words rhyme
and also have the syllable count that fixes the line on their own:

```
  9  A  Every night it's climbing higher   (perfect, 2-syllable)  <-- 9 vs target 8
          fix: cut 1 syllable, or end on a 1-syllable rhyme for 'fire': wire, hire, dire, ...
  8  C  Couldn't find the words to tell you  <-- 8 vs target 7; should rhyme with 'away' (B)
          fix: cut 1 syllable earlier in the line, and end on a 1-syllable rhyme for 'away': they, way, day, ...
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
