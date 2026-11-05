# Cardinal: lyric writing

This repo helps Claude write and revise song lyrics with real syllable and rhyme checks instead of guessing.

## Setup (run first in every session; the container starts fresh)

```bash
pip install -q -r requirements.txt
```

## Workflow when writing or editing lyrics

1. Ask (or infer) the constraints: genre, song structure, syllables per line, rhyme scheme, and themes.
2. Write the draft to `songs/<song-name>.txt` with `[Section]` labels and blank lines between stanzas.
3. Check it: `python lyrics.py analyze songs/<song-name>.txt` (add `--target 8,8,8,8` when a syllable
   pattern is wanted, `--stress` when the meter or flow matters).
4. Rewrite any line that misses its syllable target or breaks the rhyme scheme, then run the check again.
   Repeat until it passes. Don't count syllables by hand: use the tool.
5. To find a better rhyme, use `python lyrics.py rhymes <word>` (perfect and slant, common words first).
   Use `python lyrics.py compare <word> <candidates...>` to test specific options. Rap and hip-hop lean on
   slant and multisyllabic rhymes, so look at the slant list too.
6. Words marked `~` aren't in the dictionary and their counts are estimated. Check those by ear.

The tool checks counts and sounds, not quality. Imagery, emotion and singability still come first: don't
force a weak word just to hit a rhyme.
