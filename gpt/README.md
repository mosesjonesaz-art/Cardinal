# Running Cardinal with ChatGPT

Everything Claude does in this repo, set up for ChatGPT. There are two ways in, matching how you use
Claude now:

| You use with Claude | ChatGPT equivalent | Files |
|---|---|---|
| Chat mode with the `suno-concept-album` skill | A **Custom GPT** (or a **ChatGPT Project**) | `instructions.md`, `suno-album-rules.md`, `lyric-tools.zip` |
| Claude Code on this repo (`CLAUDE.md` + `suno-concept-album-code` skill) | **Codex** connected to this GitHub repo | `../AGENTS.md` (Codex reads it automatically) |

## 1. Chat mode: the album skill as a Custom GPT

1. In ChatGPT: **Explore GPTs → Create → Configure**.
2. **Name:** e.g. "Suno Album Writer".
3. **Instructions:** paste all of `instructions.md` (about 5,800 characters; the limit is 8,000).
4. **Knowledge:** upload `suno-album-rules.md` (the full rules, reference style prompts and examples) and
   `lyric-tools.zip` (the syllable/rhyme checker).
5. **Capabilities:** turn on **Code Interpreter & Data Analysis** (needed to run the checker). Web search
   and image generation can stay off.
6. Save it as "Only me".

No Custom GPTs on your plan? Make a **Project** instead: paste `instructions.md` into the project
instructions and add the two files to the project files.

If ChatGPT won't accept the `.zip` as a knowledge file, upload `lyric-tools.zip` in the chat itself when
you start an album. The instructions find it either way.

Then just talk to it the way you talk to Claude: "make me a 10-track emo concept album about...", "just
alter the chorus of 04", "scrap 06", "generate 01 and 02".

### What the checker does in ChatGPT

`lyric-tools.zip` is `lyrics.py` plus the offline Python packages it needs (ChatGPT's Python sandbox has no
internet). The GPT unzips it, installs it, and runs the same checks Claude runs: syllables per line, rhyme
scheme per section, internal rhymes, every Suno rule (tags, verse/pre-chorus length, chorus repeats exactly
and stays leaner, duet labels, no shorthand, no dangling line ends, no names, genre-drift words), the style
prompt check (200-350 chars, BPM, vocals, no artist names) and the album-level checks (BPM spread,
tracklist matching the tracks). Tested working offline.

Two things are weaker than with Claude Code:

- **No thesaurus** (`words` command). WordNet is too big and not pure Python. ChatGPT picks synonyms itself.
- **Rhyme suggestions aren't ranked by how common the word is** (that package isn't bundled), so `rhymes`
  lists rare words and names too. The instructions tell it to skip those.

### Generating in Suno

Claude has a Suno connector. ChatGPT only can if you add one; otherwise the GPT hands you the Style and
Lyrics blocks to paste into Suno (custom mode, v6). Everything else in the Suno rules (two takes, v6,
Suno Voice tips) is in the knowledge file.

## 2. Repo mode: Codex

1. Connect Codex to the `mosesjonesaz-art/Cardinal` GitHub repo.
2. Give the Codex environment internet access for pip and `raw.githubusercontent.com` (for WordNet) so
   `./setup.sh` works. Without it, everything except the thesaurus still works if you install the
   packages in `requirements.txt` another way.
3. Codex reads `AGENTS.md` at the repo root automatically. It points to the same skill file Claude Code
   uses, so the rules, the album layout and the `lyrics.py` check-and-fix loop are identical.
4. Same saving rule: it gives songs in the chat and only saves to `songs/` and commits when you ask.

## Keeping it in sync

These files are copies. When a new standing rule gets added (to the Claude skill or `lyrics.py`):

1. Update `instructions.md` (if it's a core rule) and `suno-album-rules.md`, then re-upload them to the GPT.
2. If `lyrics.py` changed, run `gpt/build-kit.sh` and re-upload `lyric-tools.zip`.

Note: the chat-mode Claude skill (`suno-concept-album`) is older than the repo skill. It's missing two rules
that `suno-album-rules.md` has: write every line out (no "(same)" or "x2" shorthand), and put [Male] or
[Female] above every single duet line.
