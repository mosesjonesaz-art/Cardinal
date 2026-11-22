---
name: "fresh"
description: "Use when Moses asks for a fresh song (\"make me a fresh song\", \"fresh one about...\"): write an original Suno style prompt and lyrics with full creative freedom, check the lyrics with lyrics.py for awareness, and deliver them. Replaces the suno-concept-album-code songwriting rules for that song."
---

# Fresh songs

"Fresh" means: write a Suno style prompt and lyrics, as a piece of art, with full freedom. This is the test
of what you can do on your own. Don't load or follow the songwriting rules in `suno-concept-album-code`
(rhyme schemes, chorus length, section sizes, the writing standard). Decide every craft choice yourself:
subject, form, voice, structure, rhyme or no rhyme. Put maximal effort into making it good.

## Concept first

Before writing a style prompt or a lyric, understand what the song is about: who is singing, to whom, what
just happened, and what it feels like from inside. If you can't say that plainly to yourself, you don't
understand it yet. Keep thinking until you do. Then write the style prompt and lyrics to serve it.

## Two passes: the literal draft, then the real text

Moses asked for this on every song from now on. Write the lyrics twice:

1. **The literal draft.** Write the whole song out, every section, saying exactly what happens and what it
   means, nail on the head. This is the subtext. He likes reading it, so show it to him.
2. **The real text.** Do a full rewrite on top of it. Keep every beat of the meaning, but carry it in
   image, symbol and metaphor, so the listener has to guess a little. Rename things instead of naming
   them: fire became "flowers" and "bouquets", matches "little red saints", the alarm "every bell in the
   city", the insured landlord "I'm covered". Plot words (job titles, procedures, places, the exact thing
   being done) go. Strong hooks and lines that are already images can stay. This rewrite is the version he
   generates.

In each track's note, say the subtext plainly ("Subtext: ...") so the literal meaning stays on record.

**Rhyme:** when the song rhymes, use mostly AABB couplets. Choruses and bridges can break the pattern for
the hook.

## Style prompt design

These lessons come from measuring Suno takes against the prompts that made them, in the audio analysis
work. They are about how Suno reads a style prompt, not about what any song should sound like.

- **Lead with the core identity:** genre or genre blend, time signature if unusual, BPM, then the voice.
  The opening words carry the most weight, especially at low style influence.
- **If the mood must override the genre's default, put the mood word first.** "Emo power ballad" pulls
  toward heartache on its own; "Euphoric emo power ballad" doesn't.
- **Comma-separated tags, not sentences.** Linking words ("frame", "deepen the arrangement") carry no
  instruction and use up space.
- **Concrete and tied to a moment beats vague.** Suno followed "building to full-band drums at the
  chorus", "drums fall away" and "sub vanishes before each drop" almost literally. "Gradually",
  "cinematic", "epic" and "story" give it nothing to aim at.
- **Fewer, compatible instructions.** Think mood board, not spec sheet. Conflicting pairs, like a
  four-on-the-floor kick with half-time drops, make the result crowded and compromised. A prompt with no
  conflicts holds up at any style influence setting.
- **The voice is one clear block, with an emotional reason.** For example, "lovestruck swooning raspy
  male tenor vocals". Rasp alone can read as pain.
- **Word color counts.** "Shimmering" and "blooming" pull warmer than "chiming" and "building". One mood
  word like "eerie" can drag a whole song sad. End on a short mood with a twist.
- **What Suno follows:**
  - BPM: almost exactly.
  - Key: about two takes in three. Name a specific key ("D major") when it matters; "major key" is the
    strongest signal for joy.
- **What it ignores:** loudness and mastering words ("clipped", "loud"). Don't spend characters on them.
- **Sections can sound different.** Describe the shift in the style prompt ("choruses lift into bright
  major, near a cappella"). Bracketed tags in the lyrics, like `[Falsetto]` and `[Acapella]`, are acted on
  as instructions, not sung.
- **The lyrics steer too.** Lyrics full of loss will pull a euphoric prompt sad again, so make them agree.
- **Limits:** roughly 200-350 characters, no artist names, no negations ("no drums" can summon drums).
- **When generating:** use plain custom mode with the exact style and lyrics. In earlier tests, Inspiration
  mode rewrote the prompts and copied other songs' lyrics.

## How Suno reads lyrics

- It sings exactly what's in the box. Write out every line and every repeat, with no shorthand.
- `[Section]` tags and other bracketed tags are instructions. Words in (parentheses) are sung as backing
  vocals.
- A line break is a breath.

## Workflow

1. Concept, then style prompt, then lyrics.
2. Pipe the lyrics through the checker for awareness, not as a pass/fail gate:
   ```bash
   python lyrics.py analyze - --stress <<'EOF'
   ...lyrics...
   EOF
   ```
   Read the syllable counts, detected rhymes and stress. Adjust anything you see fit: uneven lines that
   would trip the melody, rhymes you meant that didn't land, accidental ones. Use
   `python lyrics.py rhymes <word>` and `python lyrics.py words <word>` when you want options.
3. Check the style prompt: `python lyrics.py style "<prompt>"`.
4. Deliver in the chat: the title, a line or two on what the song is, **Style** in its own code block and
   **Lyrics** in its own code block. Don't save unless he asks. Generate in Suno only when he asks, with
   model "v6" unless he names another.
