# Cardinal: lyric writing (instructions for Codex and other coding agents)

Same process as `CLAUDE.md`. This repo helps an agent write and revise song lyrics with real syllable,
rhyme and synonym checks instead of guessing.

## Setup (run first in every session; the container starts fresh)

```bash
./setup.sh
```

It needs internet for pip and the WordNet download. If WordNet can't download, everything except the
`words` thesaurus still works.

## Suno songs and albums

For any Suno song or album, read and follow `.claude/skills/suno-concept-album-code/SKILL.md` in full
before the first draft. It has Moses's songwriting rules, the album file layout, and the check-and-fix
loop with `python lyrics.py album`. Where it says "Suno tools", use a Suno tool only if one is connected;
otherwise give Moses the Style and Lyrics blocks to paste into Suno (model v6).

## Other lyrics

1. Ask (or infer) the constraints: genre, structure, syllables per line, rhyme scheme, themes.
2. Write the draft with `[Section]` tags and blank lines between stanzas.
3. Check it by piping it in (`-` reads stdin): `python lyrics.py analyze - --target 8,8,8,8 --scheme ABAB
   <<'EOF' ... EOF` (both options cycle over each section's lines; `X` in a scheme = no rhyme needed). Add
   `--stress` when meter matters.
4. Each flagged line gets `fix:` (rhyming end words that fix the count) and `swap:` (synonyms that fix the
   count) suggestions. Use them as raw material; rewriting the whole line is often better than swapping one
   word. Rerun until it says "All lines hit the targets." Don't count syllables by hand.
5. More options: `python lyrics.py rhymes <word> --syllables 2`, `python lyrics.py words <word>
   --syllables 1 --rhyme <word>`, `python lyrics.py line "<line>" --target 8 --rhyme <word>`.

The tools check counts and sounds, not quality. Imagery, emotion and singability still come first: don't
force a weak word just to hit a rhyme.

**Don't save songs or style prompts (files or commits) unless Moses asks.** Give them in the chat. When he
asks to save, use `songs/` and commit and push.

## Keeping the GPT kit in sync

`gpt/` holds the ChatGPT version of this process. When the skill or `lyrics.py` changes, update
`gpt/instructions.md` and `gpt/suno-album-rules.md` to match, and run `gpt/build-kit.sh` to rebuild
`gpt/lyric-tools.zip`.
