# Cardinal: lyric writing

This repo helps Claude write and revise song lyrics with real syllable, rhyme and synonym checks instead of
guessing.

## Setup (run first in every session; the container starts fresh)

```bash
./setup.sh
```

## Suno songs and albums

For any Suno song or album, follow the project skill `suno-concept-album-code`
(`.claude/skills/suno-concept-album-code/SKILL.md`). It has Moses's songwriting rules, the album file
layout, and the check-and-fix loop with `lyrics.py album`.

## Other lyrics

1. Ask (or infer) the constraints: genre, structure, syllables per line, rhyme scheme, themes.
2. Write the draft to `songs/<song-name>.txt` with `[Section]` tags and blank lines between stanzas.
3. Check it: `python lyrics.py analyze songs/<song-name>.txt --target 8,8,8,8 --scheme ABAB` (both cycle
   over each section's lines; `X` in a scheme = no rhyme needed). Add `--stress` when meter matters.
4. Each flagged line gets `fix:` (rhyming end words that fix the count) and `swap:` (synonyms that fix the
   count) suggestions. Use them as raw material; rewriting the whole line is often better than swapping one
   word. Rerun until it says "All lines hit the targets." Don't count syllables by hand.
5. More options: `python lyrics.py rhymes <word> --syllables 2`, `python lyrics.py words <word>
   --syllables 1 --rhyme <word>`, `python lyrics.py line "<line>" --target 8 --rhyme <word>`.

The tools check counts and sounds, not quality. Imagery, emotion and singability still come first: don't
force a weak word just to hit a rhyme.

Commit and push lyric files after each round of changes so nothing is lost when the session ends.
