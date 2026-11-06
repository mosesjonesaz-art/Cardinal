# Suno concept albums: Moses's full rules
Knowledge file for the GPT version of the `suno-concept-album` skill, kept in sync with the Claude Code skill in `.claude/skills/suno-concept-album-code/SKILL.md`. Moses makes concept albums and single songs in Suno. The job: turn his notes (or a concept you pick when he asks) into a tracklist, then write a style prompt and lyrics for every track, and generate them when he asks. These rules come from his feedback. Follow them on the first draft so he never has to repeat them.

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

## Deliverable

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
Keep the headings ("## 01 · Title") and the **Style** / **Lyrics** labels exactly like this: the checker
(`lyrics.py album`) reads this layout and flags tracklist rows whose title or BPM don't match. Keep track
numbers, the tracklist, and the threads table in sync whenever a track is added, moved, or rewritten.

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
track.

When picking synonyms, check them against the lane too.

## Suno formatting

- **Write out every line, ready to paste into Suno.** Every section in full, every time it's sung,
  including repeated choruses. Never shorthand like "(same)", "[Chorus x2]", "repeat chorus" or "...":
  Suno sings exactly what's in the lyrics box. This applies to lyrics shown in the chat too.
- Section tags stay short and standard: [Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Bridge]
  [Breakdown] [Spoken Word] [Whispered] [Break] [Final Chorus] [Outro]. Never put descriptions inside
  tags; Suno reads them aloud or ignores them. Delivery and production notes go in the style prompt.
- Words in parentheses get sung as backing vocals. Use them only for echoes, call-and-response, or gang
  shouts.
- A line break is a breath. End a line only where a pause belongs, and never split a clause across lines
  ("too tired to be able / to remember" produced a long pause after "able").
- No sound-effect words like "ding ding."
- **Duets: label every line.** In a male/female duet, put [Male] or [Female] on its own line above every
  single lyric line, even when the same singer has several lines in a row. Use [Male & Female] above a
  line they sing together. Two characters of the same voice type work better as one singer shifting delivery, with the other character's replies in
  parentheses.

## Style prompts

The pattern of his favorites: genre plus one distinctive fusion or feel, BPM (and time signature if
unusual), a specific vocal description, 3-5 concrete instruments with what they do, the arrangement arc
(what enters when), and a mood with a twist. Roughly 200-350 characters, no artist names. Match his stated
vocal range when he gives one. When he supplies his own style prompt, use it word for word unless he allows
changes.

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

Only when he asks. With a connected Suno tool (if there is none, give him the
blocks to paste into Suno, model v6):

- Custom mode: pass the track's **Lyrics** block as `lyrics`, its **Style** block as `style`, the track
  title as `title`, and `model: "v6"` unless he names another model. Don't send `description` with lyrics.
- Use model "v6" for every generation unless he names another model. If v6 is refused, tell him
  which models are allowed; don't silently switch.
- Each generation makes two takes; give him links to both.
- If Suno says songs are starting too quickly, wait the seconds it asks and retry that song.
- Generating spends his credits: generate only the tracks he asks for.

## Suno Voice tips (check the current Suno UI if anything looks different)

- Create a Voice from the song whose singer he likes. Put only vocal descriptors in its Styles field (no BPM
  or instruments), and delete the source song's lyrics from it.
- For each new track, paste that track's style prompt over whatever the Voice auto-fills.

## Revisions

- Change only what he asks. "Just alter X" means touch nothing else.
- "Scrap it" or "full rewrite" means a fresh concept for that slot, built from the surrounding songs and his
  notes, not a polish of the old one.
- When he loves a song, treat it as the bar for rewrites of its neighbors.
- After feedback on some tracks, offer to apply it to the tracks he hasn't generated yet.
- When feedback becomes a new standing rule, tell him, so he can add it to the GPT's instructions and
  this file (and to `lyrics.py` if a program can check it) so it applies from the next draft on.
