# Cardinal: lyric writing

This repo helps Claude write and revise song lyrics with real syllable and rhyme checks instead of guessing.

## Setup (run first in every session; the container starts fresh)

```bash
pip install -q -r requirements.txt
```

## Workflow when writing or editing lyrics

1. Ask (or infer) the constraints: genre, song structure, syllables per line, rhyme scheme, and themes.
2. Write the draft to `songs/<song-name>.txt` with `[Section]` labels and blank lines between stanzas.
3. Check it: `python lyrics.py analyze songs/<song-name>.txt --target 8,8,8,8 --scheme ABAB` (both
   cycle over each stanza's lines; `X` in a scheme = no rhyme needed). Add `--stress` when meter or flow
   matters.
4. Each flagged line gets a `fix:` line with replacement end words that rhyme and, where possible, have
   the syllable count that fixes the line. Use them as a starting point; rewriting the whole line is often
   better than swapping one word. Rerun until the output ends with "All lines hit the targets." Don't count
   syllables by hand: use the tool.
5. To work on one line: `python lyrics.py line "<line>" --target 8 --rhyme <word>`. For more options:
   `python lyrics.py rhymes <word> --syllables 2`, or `python lyrics.py compare <word> <candidates...>`.
   Rap and hip-hop lean on slant and multisyllabic rhymes, so look at the slant list too.
6. Words marked `~` aren't in the dictionary and their counts are estimated. Check those by ear.

The tool checks counts and sounds, not quality. Imagery, emotion and singability still come first: don't
force a weak word just to hit a rhyme.
