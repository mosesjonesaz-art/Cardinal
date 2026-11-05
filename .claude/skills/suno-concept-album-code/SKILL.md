---
name: "suno-concept-album-code"
description: "Use when writing or generating Suno songs or a Suno concept album in the Cardinal repo with Claude Code: turning ideas into a tracklist, writing lyrics, writing style prompts with BPM, checking them with lyrics.py, saving them as album files, and generating in Suno."
---

# Suno concept albums (Claude Code + lyric tools)

This is the Claude Code version of the `suno-concept-album` skill. The taste rules are the same, word for
word. What's new: songs live as files in this repo, and every draft is checked with `lyrics.py` before
Moses sees it, so syllable counts, rhymes and the mechanical rules are verified, not guessed.

Moses makes concept albums and single songs in Suno. The job: turn his notes (or a concept you pick when he
asks) into a tracklist, then write a style prompt and lyrics for every track, and generate them when he
asks. These rules come from his feedback. Follow them on the first draft so he never has to repeat them.

## Setup (once per session)

```bash
./setup.sh
```

## Every song, every time

These apply to every song, single or album, unless he says otherwise for that song:

- **Figurative, not on the nose.** Symbol, metaphor and image carry the meaning. Never state the feeling or
  the plot outright; let a concrete picture do it.
- **Catchy beats clever.** Aim for a hook he can hum after one listen: short repeated phrases, the title
  inside the chorus, a melody-friendly shape.
- **Always a rhyme scheme.** Give every section a deliberate scheme (ABAB, XAXA, and so on) and hold the
  same scheme across matching sections, so both verses match and both pre-choruses match. Slant rhymes are
  fine; rhyming a word with itself is not.
- **Internal rhymes sometimes.** Now and then put a rhyme inside a line too, a word mid-line that chimes
  with the line's end or the next line's middle. Use it for lift, not on every line.
- **Lean choruses.** Minimize words and syllables in the chorus: the fewest that still carry the hook and
  the image. Verses can carry more detail than the chorus.
- **Generate in v6.** When generating with the Suno tools, pass model "v6" unless he names a different
  model.
- **Rhyme like a catchy song.** His complaint was too little rhyme, but the goal is a song that's catchy
  and sounds great, not the most rhymes possible. Meet the catchy minimum: choruses and pre-choruses rhyme
  every line, verses and bridges at least every other line. Go past it only where it sounds better.
  Choose each rhyme by ear: a perfect rhyme when it comes naturally, a slant rhyme when the perfect one
  would force a weak word. Never stack rhymes, or swap in slant rhymes, just to raise the count.
  `lyrics.py --suno` flags sections below the minimum.
- **Short lines.** Lyrics run too wordy. Keep every line to 8 syllables or fewer unless he sets a different
  limit, and keep choruses shorter than verses. Check with `--max 8`.
- **No mundane objects.** Utility objects, chores and logistics read as dumb in a song: "the oil can's
  waiting on the shelf," "I put the kettle on for two," "it's half an hour, a turn or two." Choose images
  with charge, a little dangerous or a little beautiful: a hinge singing in the rain, yes; the oil can that
  fixes it, no. `lyrics.py --suno` flags words from `MUNDANE_WORDS`.
- **"Replace" means a new idea.** When he writes "replace X", X is the wrong concept, not the wrong word.
  Swap in a different image that fits the song's world, never a synonym (don't reach for
  `lyrics.py words` here). Then add X to `MUNDANE_WORDS` in `lyrics.py` so the check catches it next time.

## Deliverable

**Don't save songs or style prompts unless he tells you to.** No files in the repo, no commits. Give the
work in the chat, and run the checks by piping the text to `lyrics.py` (see Workflow), so nothing is
written to disk.

The deliverable, in the chat (or in the file he asks for), in this order. A single song is just the track
section, without the tracklist or threads tables:

1. **Concept**: a short paragraph, plus the recurring personas or attitudes if the album has them.
2. **Tracklist table**: #, title, persona/attitude, BPM, one-line vibe.
3. **Recurring threads table**: every callback between songs and where it travels.
4. **Suno tips**: the formatting rules below, kept short.
5. **One section per track**: heading "NN · Title", a 1-3 sentence note (what the song is, which callbacks
   it carries), then **Style** in its own code block and **Lyrics** in its own code block so each copies
   in one tap.

~~~markdown
# Album Title

## Concept
...

## Tracklist
| # | Title | Persona | BPM | Vibe |
|---|-------|---------|-----|------|
| 1 | First Song | the ghost | 70 | swooning, eerie |

## Recurring threads
| Thread | Where it travels |
|--------|------------------|
| chalk outline | 01 hook → 04 bridge (flipped) |

## Suno tips
- ...

## 01 · First Song
One to three sentences: what the song is, which callbacks it carries.

**Style**
```
(style prompt)
```

**Lyrics**
```
[Verse 1]
...
```
~~~

`lyrics.py album` reads this layout, so keep the headings ("## 01 · Title") and the **Style** / **Lyrics**
labels exactly like this. Keep track numbers, the tracklist, and the threads table in sync whenever a
track is added, moved, or rewritten; `lyrics.py album` flags tracklist rows whose title or BPM don't match.

When he asks you to save: albums go in `songs/<album-slug>/album.md` and singles in
`songs/singles/<song-slug>.md`, in this layout. Commit and push what he asked to save. If he asks for a
Claude doc, publish to one with the docs tools, when available.

## Workflow

1. Draft the tracklist and threads first, then each track.
2. Write each track's lyrics and style prompt in the layout above.
3. Check it by piping the text in (`-` reads stdin), so nothing is saved:
   ```bash
   python lyrics.py album - --track 1 <<'EOF'
   ...the album or song text in the layout above...
   EOF
   ```
   Without `--track`, `album -` summarizes every track. The full view shows syllables and the detected
   rhyme scheme per line, internal rhymes, a summary for each section, the Suno checks, and the style check.
4. Fix what it flags, then check again until it's clean. For lines you want tighter (choruses), or when you
   chose a scheme, pipe just the lyrics into `python lyrics.py analyze - --scheme XAXA --target 6,6,6,6`.
   When he sets a syllable limit, add `--max 8` to either command. Lines that miss get `fix:`
   suggestions (end words that rhyme and fix the count) and `swap:` suggestions (synonyms with the right
   syllable count).
5. To find words: `python lyrics.py rhymes <word> [--syllables N]` for perfect and slant rhymes;
   `python lyrics.py words <word> [--syllables N] [--rhyme X] [--related]` for synonyms;
   `python lyrics.py compare <word> <candidates...>` to test a rhyme. Suggestions are raw material: pick
   ones that fit the image and the genre lane, and rewrite the line when one swapped word isn't enough.
6. The tools check counts, sounds and mechanical rules. They can't judge taste. Read every line against
   the writing standard below before showing it to him.
7. Show him the result in the chat. Save or commit only when he asks.

What the tools check, and what's left to you:

| Rule | Checked by `lyrics.py` | Your judgment |
|------|------------------------|---------------|
| Rhyme scheme held across matching sections | yes: section schemes compared | which scheme fits |
| No rhyming a word with itself | yes | |
| Every line rhymes with another line in its section | yes | which lines pair up |
| Lines of 8 syllables or fewer | yes, with `--max 8` | where to cut |
| No mundane objects; "replace" words | flags `MUNDANE_WORDS` (add each "replace" word) | what's cool: the new image |
| Internal rhymes sometimes | counts them per line | where they add lift |
| Lean chorus | flags a chorus as long as the verses; shows syllables per section | the fewest words that carry the hook |
| Verses 4-6 lines, pre-choruses 2-4 | yes | |
| Choruses repeat exactly | yes, except [Final Chorus] | |
| Standard tags only, no descriptions in tags | yes | |
| Duets: [Male]/[Female] above every line | yes | who sings what |
| Every line written out, no "(same)" shorthand | flags "(same)", "x2", "repeat" | |
| A line break is a breath | flags lines ending on "the", "to", "and"... | clauses that split elsewhere |
| No sound-effect words | flags repeated words ("ding ding") | other sound effects |
| No proper names or media references | flags capitalized words mid-line | references in lowercase |
| Genre drift words | flags words from a list (edit `DRIFT_WORDS` in `lyrics.py` when a track drifts) | the lane as a whole |
| Style prompt: 200-350 chars, BPM, vocals, no artist names | yes | the fusion, the arc, the twist |
| BPM spread across the album | flags tracks within 5 BPM | |
| Figurative, angsty-not-cheesy, catchy | no | all of it |

## Album shape

- Loosely cohesive, not a book. Mix plot-beat songs with pure-attitude songs (emotional expressions,
  declarations). Story beats arrive through metaphor, never narration.
- Heavy symbolism with overlapping callbacks. Each callback is a single line, easy to miss on first listen.
  The strongest ones flip an earlier hook: "you're all dead men walking" becomes "get up, dead man, and
  walk"; "count the heads, there's only one" becomes "for the first time... there's two."
- Adjacent songs can hand off: an outro of footsteps on the stairs, then the next song opens with who came.
- Spread the BPMs so nothing blurs together. Every track gets a real hook, quiet ones included. Nothing too
  chill or forgettable.
- If the album needs a consistent singer, make track 01 a strong vocal anchor so he can create a Suno Voice
  from it.

## Writing standard: angsty, not cheesy

Saying exactly what you mean hurts these songs. Show the feeling through concrete images that are a little
dangerous or a little beautiful, and take the song completely seriously. A blunt line is allowed only where
it hits hardest, usually the hook.

Cut on sight:

- The mundane, literal thing: "Wake up. Clock in. Do the right things." (reads like a kid wrote it)
- Utility objects and chores: "The oil can's waiting on the shelf," "I put the kettle on for two"
- Cutesy-clever lines: "I'm a lion doing taxes in a very nice cage"
- Metaphors that announce the concept: "two moths in a jar"
- Spelling out the meaning: "here comes the truth like a cannonball," "let's avoid this," "unconditional,
  unconditional"
- Motivational-poster lines: "if it knocks me down, I'll learn it," "when you expect nothing, nothing can
  let you down"
- Songs that explain the album's own concept: "there's six of me, did they warn you, dear?"
- Parent figures as the emotional payoff, unless he asks for one

Aim for lines like:

- "Applause for a statue that learned how to breathe, / hands folded clean over teeth underneath."
- "I woke up in my own chalk outline"
- "you picked up the chalk where I'd fallen, / and drew yourself next to me, that's all"
- "Hallelujah, I hate it here"

Be concise: verses of 4-6 short lines, pre-choruses of 2-4, choruses that repeat exactly (vary only the
final one) and stay lean. No yapping.

Dark imagery (guns, killers, crash-outs, villains) is emo metaphor in these albums. Write it with
conviction and without disclaimers, and keep it clearly metaphorical. With religious imagery, mock
shortcuts and hypocrisy, not faith.

No proper names or media references in lyrics or style prompts. Use his references as inspiration only.

## Genre discipline

Lyric vocabulary steers Suno's genre as much as the style prompt does. Keep words inside the album's lane.
Hammer, iron, forge, and blood pushed an emo song toward metal; country-coded words gave a rock album a
Southern accent. Style prompts work the same way: marching snare, galloping drums, and "unstoppable" read
as metal. When a track drifts, rebuild its style prompt from the core descriptors of the album's anchor
track, and add the words that caused the drift to `DRIFT_WORDS` in `lyrics.py` so the check catches them
next time.

When picking synonyms with `lyrics.py words`, check them against the lane too: the thesaurus doesn't know
genres.

## Suno formatting

- **Write out every line, ready to paste into Suno.** Every section in full, every time it's sung,
  including repeated choruses. Never shorthand like "(same)", "[Chorus x2]", "repeat chorus" or "...":
  Suno sings exactly what's in the lyrics box. This applies to lyrics shown in the chat too.
- Section tags stay short and standard: [Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Bridge]
  [Breakdown] [Spoken Word] [Whispered] [Break] [Final Chorus] [Outro]. Never put descriptions inside
  tags; Suno reads them aloud or ignores them. Delivery and production notes go in the style prompt.
- Words in parentheses get sung as backing vocals. Use them only for echoes, call-and-response, or gang
  shouts. (`lyrics.py` leaves them out of the line's syllable count and shows them as `+N bg`.)
- A line break is a breath. End a line only where a pause belongs, and never split a clause across lines
  ("too tired to be able / to remember" produced a long pause after "able").
- No sound-effect words like "ding ding."
- **Duets: label every line.** In a male/female duet, put [Male] or [Female] on its own line above every
  single lyric line, even when the same singer has several lines in a row. Use [Male & Female] above a
  line they sing together. `lyrics.py --suno` flags any duet line without a label. Two characters of the
  same voice type work better as one singer shifting delivery, with the other character's replies in
  parentheses.

## Style prompts

The pattern of his favorites: genre plus one distinctive fusion or feel, BPM (and time signature if
unusual), a specific vocal description, 3-5 concrete instruments with what they do, the arrangement arc
(what enters when), and a mood with a twist. Roughly 200-350 characters, no artist names. Match his stated
vocal range when he gives one. When he supplies his own style prompt, use it word for word unless he allows
changes. Check each one with `python lyrics.py style "<prompt>"` (the album check does this for every
track).

Reference prompts he rated highest:

```
Emo power ballad with a 1950s doo-wop slow-dance feel, 6/8 time, 70 BPM, tender swooning raspy male tenor vocals, chiming arpeggiated guitars, warm organ, brushed drums building to full band, glam rock backing harmonies, dreamy and romantic with a faint eerie edge
```

```
2000s emo-punk duet, swing-punk with a cabaret bounce, 138 BPM, male and female call-and-response vocals, raspy male tenor and bright sassy female vocal, palm-muted guitars exploding into a big chorus, walking punk bassline, handclaps, playful and theatrical with nervous tension
```

```
Ethereal emo slowcore, dreamy shoegaze guitars drenched in reverb, 64 BPM, floating whispery male vocals, soft piano, distant music box, slow swelling drums, whispered eerie horror-tinged bridge, soft spoken final line, weightless and haunting
```

```
Emotional emo piano ballad building to a massive rock crescendo, 76 BPM, opens with solo piano and fragile raspy male vocals, strings enter on the second verse, full band in the bridge with raw cracking screams, ends back on solo piano, desperate and prayerful
```

## Generating in Suno

Only when he asks. With the Suno tools (`audio-create`, then `audio-wait`):

- Custom mode: pass the track's **Lyrics** block as `lyrics`, its **Style** block as `style`, the track
  title as `title`, and `model: "v6"` unless he names another model. Don't send `description` with lyrics.
- Use model "v6" for every generation unless he names another model. If v6 is refused, check
  `account-usage` for the allowed models and tell him; don't silently switch.
- Each generation makes two takes; give him links to both. Pass every returned clip id to `audio-wait` in
  one call.
- If Suno says songs are starting too quickly, wait the seconds it asks and retry that song.
- Generating spends his credits: generate only the tracks he asks for.
- If he has asked you to save the song, add a `Takes:` line with both links under its track section.

## Suno Voice tips (check the current Suno UI if anything looks different)

- Create a Voice from the song whose singer he likes. Put only vocal descriptors in its Styles field (no BPM
  or instruments), and delete the source song's lyrics from it.
- For each new track, paste that track's style prompt over whatever the Voice auto-fills.

## His keywords

- **"Upgrade"** means a light touch on a song he already likes, sung on its original melody (a cover).
  A heavy rewrite of 13 songs made them "a lot worse than the originals": the covers kept the old melody,
  and lines with new syllable counts no longer fit it. On an existing song:
  1. **Fit the melody.** Every changed line keeps the original line's syllable count and pickup (the
     unstressed syllables before the first stressed word). Check with `python lyrics.py fit <original>
     <new>`; it must report every line fitting. Pass the two versions with `<(cat <<'EOF' ... EOF)` so
     nothing is saved.
  2. **Bring rhyme up to catchy.** Choruses and pre-choruses: every line rhymes with another line
     (repeated hook lines count). Verses and bridges: at least every other line (XAXA). Ideally one internal
     rhyme in the chorus. The minimum is a floor, not a goal: stop once it's met and the song sounds right,
     and pick whichever rhyme sounds best, perfect or slant. Reach the floor by swapping end words for
     ones with the same syllable count, changing as little else as possible. `--suno` flags sections
     below the minimum.
  3. **Swap mundane objects for charged images** (oil can, kettle, mop, and words he marks "replace"), with
     the same syllable count and stress as the words they replace, so the melody still fits.
  4. **Point out crowded lines, don't silently cut them.** `--suno` flags lines 3 or more syllables
     longer or shorter than the rest of their section. Cutting syllables on a cover leaves notes over (a
     held note, or a late entry), so list the crowded lines and ask how he wants them handled (see
     "Crowded lines and the melody" below).
  5. Leave choruses, hook lines and lines that already work alone unless a rule above needs them changed.

  The strict defaults above (every line to 8 syllables, perfect rhymes first) are for new songs, which get
  a fresh melody anyway.
- **"Boost"** means: make the song more awesome. Everything "upgrade" does, plus freedom to rewrite lines
  for impact.
  1. A sharper, more singable hook.
  2. Bolder images, a little dangerous or a little beautiful.
  3. Internal rhymes for lift.
  4. A final chorus that flips or twists the hook.
  5. A bridge that raises the stakes.

  Keep the concept, title, section structure, and style prompt unless he says otherwise. Hold to the
  writing standard: awesome, not cheesy.
- **"Replace X"** means X is the wrong concept: see "No mundane objects" above.

These can be combined ("upgrade and boost this"), and they apply to songs he pastes or names from his
Suno library.

## Improving his existing songs

When he names songs to improve:

1. Find each one in his Suno library with `library-search` (or `library-list`), then read its lyrics and
   style prompt with `audio-retrieve`. Every generation makes two takes, so each song usually appears
   twice with the same lyrics (that's why his albums always have an even number of songs). Read one take
   unless the two differ.
2. Do what his keyword asks ("upgrade", "boost", or both; with no keyword, upgrade). Check with
   `python lyrics.py analyze - --suno` and fix only what the keyword covers.
3. Give each song back in the chat, every line written out and ready to paste. Say in a few bullets what
   changed. Don't save anything, and generate in Suno only when he asks.
4. **Regenerate an existing song as a cover of its original**, not a fresh generation: `audio-covers-create`
   with the original clip's id, the new lyrics, its style prompt, and `model: "v6"`. Set
   `controls.audio_influence` to:
   - **0.5 when any line's syllable count changed.** This is what worked: both 0.5 covers of "Stay in the
     Story" were "great". Suno keeps the original's feel and re-phrases the changed lines.
   - 0.8 only when every changed line fits the original exactly (`fit` passes on every line). At 0.8,
     shortened lines were forced onto the old notes and sounded rushed.

   A fresh generation writes a brand-new melody even when the chorus words are identical. On "Stay in the
   Story" the fresh generation was "a miss" next to the covers, so don't generate fresh unless he asks. Keep changed lines close to the original's syllable count so they fit the old melody: a
   line one syllable short or long at the start ("let the last page" vs "the last page") is enough to
   sound rushed.

## Crowded lines and the melody

A melody sets one note per syllable, more or less. When a cover keeps the original melody, every line
keeps its notes: extra syllables get crammed in (rushed), and missing syllables leave a note held or move
where the singer comes in (moving "Stay" off the beat it used to land on). So making a line less crowded
and keeping its melody pull against each other. The options, best first:

1. **Keep the count, lighten the sound.** Crowding often comes from consonant clusters and stressed words on
   quick notes, not from the count itself. Swap in words with the same count and open vowels.
2. **Let the melody move.** Cover at `audio_influence` 0.5 (his "great" results). Suno keeps the feel and
   re-phrases lines to fit the new counts. A long line answered by a short one works: "Stay in the story
   for a little while / don't turn the last page yet" (10, then 6).
3. **New melody.** A fresh generation writes a melody for the new lyrics. It loses the old one entirely.
4. **Fix one section.** Suno's editor on suno.com may let him regenerate only part of a song with new
   lyrics. The connector can't do that, so suggest he try it there.

## Revisions

- Change only what he asks. "Just alter X" means touch nothing else.
- "Scrap it" or "full rewrite" means a fresh concept for that slot, built from the surrounding songs and his
  notes, not a polish of the old one.
- When he loves a song, treat it as the bar for rewrites of its neighbors.
- After feedback on some tracks, offer to apply it to the tracks he hasn't generated yet.
- When feedback becomes a new standing rule, add it to this skill (and to `lyrics.py` if a program can
  check it) so it applies from the next draft on.
