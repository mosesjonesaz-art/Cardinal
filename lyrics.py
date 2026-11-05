#!/usr/bin/env python3
"""Lyric checker: syllables, stress, rhyme schemes, rhyme and synonym finder.

Syllables come from the CMU Pronouncing Dictionary (via `pronouncing`).
Words the dictionary doesn't know fall back to the `syllables` estimator
and are marked with `~` so you know the count is a guess. Synonyms come
from WordNet (run ./setup.sh once per session to install it).

Usage:
  python lyrics.py analyze song.txt                      # syllables + rhyme scheme
  python lyrics.py analyze song.txt --target 8,8,8,8 --scheme ABAB
                                                         # flag misses, suggest fixes
  python lyrics.py analyze song.txt --suno               # also check Suno song rules
  python lyrics.py analyze -                             # read lyrics from stdin
  python lyrics.py line "I've been walking down this road" --target 8 --rhyme cold
  python lyrics.py rhymes fire --syllables 2             # perfect + slant rhymes
  python lyrics.py words tired --syllables 1             # synonyms, by syllable count
  python lyrics.py words burning --rhyme night           # synonyms that rhyme
  python lyrics.py compare fire higher wire              # how well words rhyme
  python lyrics.py style "Ethereal emo slowcore, 64 BPM, ..."   # check a Suno style prompt
  python lyrics.py album songs/my-album/album.md         # check every track of an album
  python lyrics.py album songs/my-album/album.md --track 3
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from functools import lru_cache

import pronouncing
import syllables

try:
    from wordfreq import zipf_frequency
except ImportError:  # optional: only used to rank suggestions
    zipf_frequency = None

try:
    from lemminflect import getAllInflections, getAllLemmas, getInflection
    from nltk.corpus import wordnet as wn

    wn.ensure_loaded()
except (ImportError, LookupError):  # thesaurus not installed: run ./setup.sh
    wn = None

TAG_RE = re.compile(r"^\s*\[([^\]]*)\]\s*$")  # [Chorus], [Verse 2], [Male]
PAREN_RE = re.compile(r"\(([^)]*)\)")  # (backing vocals)
WORD_RE = re.compile(r"[A-Za-z0-9']+")
VOWEL_RE = re.compile(r"^[AEIOU]")
CONS = r"(?: [^AEIOU ]\S*)*"  # any run of consonant phones

STRENGTH_ORDER = {"identical": 4, "perfect": 3, "slant": 2, "weak": 1, "none": 0, "unknown": 0}
RHYMES_OK = ("perfect", "slant", "identical")

STOPWORDS = set("""
a an the and or but so if then than to of in on at by for from with into onto up down out
over under as is am are was were be been being it its i me my mine you your yours he him his
she her hers we us our they them their this that these those there here what who whom when
where why how not no yes do does did don't can can't will won't would could should just oh
im i'm ive i've ill i'll id i'd youre you're it's dont cant wont aint ain't
""".split())

# Tags the Suno skill allows. A trailing number is fine: [Verse 2].
SUNO_TAGS = {"intro", "verse", "pre-chorus", "chorus", "bridge", "breakdown", "spoken word",
             "whispered", "break", "final chorus", "outro", "male", "female"}
# Tags that mark a voice or delivery change inside a section, not a new section.
INLINE_TAGS = {"male", "female", "whispered", "spoken word"}
# A line ending on one of these usually splits a clause; a line break is a breath.
DANGLING_ENDS = {"a", "an", "the", "to", "of", "and", "or", "but", "my", "your", "our",
                 "their", "its", "than", "if", "because"}
# Words that pulled songs out of their genre lane. Add to this when a track drifts.
DRIFT_WORDS = {
    "hammer": "metal", "iron": "metal", "forge": "metal", "blood": "metal",
    "steel": "metal", "anvil": "metal", "unstoppable": "metal",
    "marching snare": "metal", "galloping drums": "metal",
    "whiskey": "country", "truck": "country", "pickup": "country", "tailgate": "country",
    "porch": "country", "cowboy": "country", "boots": "country", "rodeo": "country",
    "moonshine": "country", "y'all": "country", "holler": "country", "honky": "country",
    "dirt road": "country",
}
CAPS_OK = {"i", "god", "lord", "heaven", "hell", "hallelujah", "amen"}


# ---------------------------------------------------------------- words ----

def tokenize(line: str) -> list[str]:
    """Split a lyric line into lowercase words (hyphens split, apostrophes kept)."""
    return [w.strip("'").lower() for w in WORD_RE.findall(line.replace("-", " ")) if w.strip("'")]


@lru_cache(maxsize=None)
def phones(word: str) -> tuple[str, ...]:
    """All CMU pronunciations for a word, trying common lyric spellings too."""
    w = word.lower()
    found = pronouncing.phones_for_word(w)
    if not found and w.endswith("in"):
        found = pronouncing.phones_for_word(w + "g")  # runnin' -> running
    if not found:  # compound: streetlights -> street + lights
        for i in range(len(w) - 2, 2, -1):
            head, rest = pronouncing.phones_for_word(w[:i]), pronouncing.phones_for_word(w[i:])
            if head and rest:
                found = [head[0] + " " + rest[0]]
                break
    return tuple(found)


def syllable_count(word: str) -> tuple[int, bool]:
    """(count, from_dictionary). Uses the first CMU pronunciation if known."""
    p = phones(word)
    if p:
        return pronouncing.syllable_count(p[0]), True
    return max(1, syllables.estimate(word)), False


def syllable_options(word: str) -> set[int]:
    """Every syllable count the word can be sung with (fire = 1 or 2)."""
    p = phones(word)
    if p:
        return {pronouncing.syllable_count(x) for x in p}
    return {syllable_count(word)[0]}


def phrase_syllables(phrase: str) -> int:
    return sum(syllable_count(w)[0] for w in tokenize(phrase))


def stress_pattern(word: str) -> str:
    """CMU stress digits: 1 = primary, 2 = secondary, 0 = unstressed. '?' if unknown."""
    p = phones(word)
    if p:
        return pronouncing.stresses(p[0])
    return "?" * syllable_count(word)[0]


def zipf(word: str) -> float:
    return zipf_frequency(word, "en") if zipf_frequency else 0.0


# --------------------------------------------------------------- rhymes ----

SCHWA_LIKE = {"AH", "IH", "EH", "UH"}  # unstressed, these all sound roughly like "uh"


def _strip_stress(phone_str: str) -> str:
    return re.sub(r"\d", "", phone_str)


# Before R, the dictionary is inconsistent (here = IY R, clear = IH R), so
# these vowel pairs count as the same sound there.
R_MERGE = {"IY": "IH", "EY": "EH", "OW": "AO", "UW": "UH"}
R_ALT = {"IH": "(?:IH|IY)", "EH": "(?:EH|EY)", "AO": "(?:AO|OW)", "UH": "(?:UH|UW)"}


def _norm(phone_str: str) -> str:
    """Merge the vowel pairs in R_MERGE when an R follows."""
    toks = phone_str.split()
    for i, t in enumerate(toks[:-1]):
        base = _strip_stress(t)
        if base in R_MERGE and toks[i + 1] == "R":
            toks[i] = R_MERGE[base] + t[len(base):]
    return " ".join(toks)


def _vowels(phone_str: str) -> list[str]:
    """Vowel sounds, stress removed; unstressed AH/IH/EH/UH collapse to '@'.

    The collapse lets broken (OW K AH N) slant-rhyme with hoping (OW P IH NG).
    """
    out = []
    for p in phone_str.split():
        if VOWEL_RE.match(p):
            base = _strip_stress(p)
            out.append("@" if p.endswith("0") and base in SCHWA_LIKE else base)
    return out


def _tail(phone_str: str) -> str:
    """Final consonant cluster (empty if the word ends in a vowel)."""
    out = []
    for p in reversed(_strip_stress(phone_str).split()):
        if VOWEL_RE.match(p):
            break
        out.append(p)
    return " ".join(reversed(out))


def _matching_vowels_from_end(a: str, b: str) -> int:
    va, vb = _vowels(a), _vowels(b)
    n = 0
    while n < min(len(va), len(vb)) and va[-1 - n] == vb[-1 - n]:
        n += 1
    return n


def _rate_pair(pa: str, pb: str) -> tuple[str, int]:
    pa, pb = _norm(pa), _norm(pb)
    ra, rb = pronouncing.rhyming_part(pa), pronouncing.rhyming_part(pb)
    depth = _matching_vowels_from_end(pa, pb)
    if _strip_stress(ra) == _strip_stress(rb):
        return "perfect", depth
    if _vowels(ra) and _vowels(ra) == _vowels(rb):
        return "slant", depth  # same vowel sounds, different consonants (time/line)
    if depth >= 1 or (_tail(pa) and _tail(pa) == _tail(pb)):
        return "weak", depth  # last vowel or final consonants match only
    return "none", depth


def rhyme_quality(a: str, b: str) -> tuple[str, int]:
    """Best rhyme between two words across all pronunciations.

    Returns (label, depth) where label is identical/perfect/slant/weak/none
    (or unknown if a word isn't in the dictionary) and depth is how many vowel
    sounds match counting back from the end (depth >= 2 is multisyllabic).
    """
    a, b = a.lower(), b.lower()
    if a == b:
        return "identical", len(_vowels(phones(a)[0])) if phones(a) else 1
    pa, pb = phones(a), phones(b)
    if not pa or not pb:
        return "unknown", 0
    best = ("none", 0)
    for x in pa:
        for y in pb:
            r = _rate_pair(x, y)
            if (STRENGTH_ORDER[r[0]], r[1]) > (STRENGTH_ORDER[best[0]], best[1]):
                best = r
    return best


def phrase_rhyme(a: str, b: str) -> tuple[str, int]:
    """Rhyme between the last words of two phrases."""
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return "unknown", 0
    return rhyme_quality(ta[-1], tb[-1])


def _perfect_pattern(rhyming_part: str) -> str:
    """Regex for pronunciations ending in this rhyming part.

    The first vowel must be stressed (primary or secondary), so road matches
    explode and railroad but not followed. Later vowels may have any stress.
    """
    parts, first = [], True
    toks = _strip_stress(_norm(rhyming_part)).split()
    for i, p in enumerate(toks):
        if VOWEL_RE.match(p):
            if i + 1 < len(toks) and toks[i + 1] == "R":
                p = R_ALT.get(p, p)
            p += "[12]" if first else r"\d"
            first = False
        parts.append(p)
    return r"(?:^| )" + " ".join(parts) + "$"


def _rank(words, include_rare: bool = False, min_zipf: float = 2.5) -> tuple[str, ...]:
    """Most common first. Drops hyphenated words and single letters except "i"."""
    words = {w for w in words if not re.search(r"['.\-]", w) and (len(w) > 1 or w == "i")}
    if zipf_frequency and not include_rare:
        words = {w for w in words if zipf(w) >= min_zipf}
    return tuple(sorted(words, key=lambda w: (-zipf(w), w)))


@lru_cache(maxsize=None)
def _rhyme_pool(word: str, include_rare: bool) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """All perfect and slant rhymes for a word, most common first (cached)."""
    p = phones(word)
    if not p:
        return (), ()
    perfect: set[str] = set()
    slant: set[str] = set()
    for pron in p:
        perfect.update(pronouncing.search(_perfect_pattern(pronouncing.rhyming_part(pron))))
    # Slant rhymes: same vowel sounds from the last stressed vowel on, any
    # consonants. Only the main pronunciation, so "fire" (F AY ER) suggests
    # lighter/tiger/iron rather than every word with an AY in it.
    # A vowel before R keeps its R (clear -> weird, years; not clear -> in, is).
    rp = _norm(pronouncing.rhyming_part(p[0]))
    toks = rp.split()
    vpat = []
    for i, t in enumerate(toks):
        if VOWEL_RE.match(t):
            base = _strip_stress(t)
            if i + 1 < len(toks) and toks[i + 1] == "R":
                vpat.append(R_ALT.get(base, base) + r"\d R")
            elif t.endswith("0") and base in SCHWA_LIKE:
                vpat.append(r"(?:AH|IH|EH|UH)0")
            else:
                vpat.append(base + r"\d")
    if vpat:
        # If the word ends in a consonant, require one (time -> line, not time -> my).
        end = r"(?: [^AEIOU ]\S*)+$" if _tail(rp) else CONS + "$"
        slant.update(pronouncing.search(r"(?:^| )" + (CONS + " ").join(vpat) + end))
    perfect.discard(word)
    slant -= perfect | {word}
    return _rank(perfect, include_rare), _rank(slant, include_rare)


def find_rhymes(word: str, include_rare: bool = False, limit: int = 40,
                syllables_: int | None = None) -> dict[str, list[str]]:
    """Perfect and slant rhymes for a word, most common words first.

    If `syllables_` is given, only words that can be sung with exactly that
    many syllables (any pronunciation counts, so fire fits 1 or 2).
    """
    perfect, slant = _rhyme_pool(word.lower(), include_rare)

    def pick(words: tuple[str, ...]) -> list[str]:
        if syllables_ is not None:
            words = tuple(w for w in words if syllables_ in syllable_options(w))
        return list(words[:limit])

    return {"perfect": pick(perfect), "slant": pick(slant)}


# ------------------------------------------------------------ thesaurus ----

_WN_POS = {"VERB": "v", "NOUN": "n", "ADJ": "a", "ADV": "r"}


@lru_cache(maxsize=None)
def synonyms(word: str, related: bool = False, include_rare: bool = False,
             senses: int = 3) -> tuple[str, ...]:
    """WordNet synonyms in the same form as `word` (climbing -> rising).

    Uses the `senses` most common meanings of each part of speech (all of
    them with include_rare). `related` adds broader and narrower words.
    Most common words first.
    """
    if wn is None:
        return ()
    w = word.lower()
    forms = {pos: lemmas[0] for pos, lemmas in getAllLemmas(w).items() if pos in _WN_POS}
    if not forms:
        forms = {pos: w for pos in _WN_POS}
    out: set[str] = set()
    for upos, lemma in forms.items():
        # Which inflections turn the lemma into the word (VBG for climbing)?
        tags = [None]
        if lemma != w:
            tags = [t for t, vals in getAllInflections(lemma, upos=upos).items() if w in vals]
            if "VBD" in tags and w in getInflection(lemma, tag="VBN"):
                tags.append("VBN")  # lemminflect lists "tired" only as past tense
            if forms.get("ADJ") == w and "VBN" in tags:
                tags = ["VBN"]  # tired as an adjective: worn, not wore
            if not tags:
                continue
        wpos = _WN_POS[upos]
        found = [syn for syn in wn.synsets(lemma)
                 if syn.pos() == wpos or (wpos == "a" and syn.pos() == "s")]
        for syn in found if include_rare else found[:senses]:
            pool = [syn] + syn.similar_tos() + syn.verb_groups()
            if related:
                pool += syn.hypernyms() + syn.hyponyms()
            for s in pool:
                for lem in s.lemmas():
                    name = lem.name()
                    if name[0].isupper() or name.lower() == lemma:
                        continue  # skip proper nouns and the word itself
                    for tag in tags:
                        parts = name.lower().split("_")
                        if tag:
                            inflected = getInflection(parts[0], tag=tag)
                            if not inflected:
                                continue
                            parts[0] = inflected[0]
                        if w not in parts and lemma not in parts:  # not "climbing up"
                            out.add(" ".join(parts))
    out = {p for p in out if "-" not in p and "." not in p}
    if zipf_frequency and not include_rare:
        out = {p for p in out if zipf(p) >= 2.0}
    return tuple(sorted(out, key=lambda p: (-zipf(p), p)))


def swap_hint(words: list[str], diff: int, limit: int = 4) -> str:
    """Synonym swaps for mid-line words that change the count by -diff."""
    if wn is None or diff == 0 or abs(diff) > 2:
        return ""
    parts = []
    for w in dict.fromkeys(words[:-1]):  # keep order, skip duplicates and the end word
        if w in STOPWORDS:
            continue
        want = syllable_count(w)[0] - diff
        if want < 1:
            continue
        options = [s for s in synonyms(w, senses=2)
                   if phrase_syllables(s) == want and zipf(s) >= 3][:3]
        if options:
            parts.append(f"{w} -> {', '.join(options)}")
        if len(parts) >= limit:
            break
    return "swap: " + "; ".join(parts) if parts else ""


# -------------------------------------------------------------- fixing ----

def suggest_endings(anchor: str, syllables_: int, exclude: set[str], limit: int = 8) -> str:
    """One-line list of end words that rhyme with `anchor` and have `syllables_` syllables."""
    res = find_rhymes(anchor, limit=limit + len(exclude), syllables_=syllables_)
    perfect = [w for w in res["perfect"] if w not in exclude][:limit]
    slant = [w for w in res["slant"] if w not in exclude][:max(0, limit - len(perfect))]
    parts = []
    if perfect:
        parts.append(", ".join(perfect))
    if slant:
        parts.append("slant: " + ", ".join(slant))
    return " | ".join(parts)


def fix_hint(words: list[str], count: int, want: int | None, rhyme_with: str | None) -> str:
    """Suggest how to fix a line that misses its syllable target and/or rhyme.

    Lists replacement end words that rhyme (with `rhyme_with`, or else the
    line's own end word) and, where possible, have the syllable count that
    fixes the line on their own.
    """
    if not words:
        return ""
    end = words[-1]
    end_syl = syllable_count(end)[0]
    anchor = rhyme_with or end
    diff = 0 if want is None else count - want
    count_fix = ""
    if diff > 0:
        count_fix = f"cut {diff} syllable{'s' * (diff > 1)}"
    elif diff < 0:
        count_fix = f"add {-diff} syllable{'s' * (-diff > 1)}"

    need = end_syl - diff  # end-word length that fixes the count by itself
    if 1 <= need <= 3:
        n, fixes_count = need, True
    elif rhyme_with:
        n, fixes_count = end_syl, False  # fix the rhyme now, the count elsewhere
    else:
        return f"fix: {count_fix} earlier in the line"
    if not phones(anchor):
        return f"fix: {count_fix or 'rework the line'} ('{anchor}' isn't in the dictionary)"

    options = suggest_endings(anchor, n, exclude={end, anchor})
    swap = (f"end on a {n}-syllable rhyme for '{anchor}': {options}" if options
            else f"no common {n}-syllable rhymes for '{anchor}'")
    if not count_fix:
        return f"fix: {swap}"
    if fixes_count:
        return f"fix: {count_fix}, or {swap}" if options else f"fix: {count_fix} ({swap})"
    return f"fix: {count_fix} earlier in the line, and {swap}"


# ------------------------------------------------------------- analysis ----

def analyze_line(line: str) -> dict:
    """Lead words are outside parentheses; words in parentheses are backing vocals."""
    lead = PAREN_RE.sub(" ", line)
    backing = " ".join(PAREN_RE.findall(line))
    words = tokenize(lead)
    counts = [syllable_count(w) for w in words]
    return {
        "text": line,
        "lead": lead,
        "words": words,
        "syllables": sum(c for c, _ in counts),
        "backing_syllables": sum(syllable_count(w)[0] for w in tokenize(backing)),
        "estimated": [w for w, (_, known) in zip(words, counts) if not known],
        "stress": " ".join(stress_pattern(w) for w in words),
    }


def line_rhyme(a: list[str], b: list[str]) -> tuple[str, int, str]:
    """Rhyme between the endings of two lines: (label, depth, extra note).

    If both lines end on the same word ("love you" / "above you"), the words
    before it are compared too, since that's usually where the real rhyme is.
    """
    label, depth = rhyme_quality(a[-1], b[-1])
    if label == "identical" and len(a) > 1 and len(b) > 1:
        inner, inner_depth = rhyme_quality(a[-2], b[-2])
        if inner in RHYMES_OK:
            return inner, inner_depth + 1, f"repeated '{a[-1]}'"
    return label, depth, ""


def is_self_rhyme(a: list[str], b: list[str]) -> bool:
    """Two different lines that only rhyme by ending on the same word."""
    label, _, extra = line_rhyme(a, b)
    return label == "identical" and not extra and a != b


def rhyme_scheme(lines: list[list[str]]) -> list[tuple[str, str]]:
    """Assign rhyme-scheme letters to lines (each a list of words).

    Returns [(letter, note), ...]. A line joins the earliest earlier group it
    rhymes with (perfect or slant). Uppercase = perfect, lowercase = slant only.
    A note of exactly "identical" means a different line ending on the same word.
    """
    groups: list[list[list[str]]] = []
    out: list[tuple[str, str]] = []
    for words in lines:
        placed = False
        for gi, members in enumerate(groups):
            label, depth, extra = max(
                (line_rhyme(words, m) for m in members),
                key=lambda r: (STRENGTH_ORDER.get(r[0], 0), r[1]))
            if label in RHYMES_OK:
                letter = chr(ord("A") + gi % 26)
                if label == "slant":
                    letter = letter.lower()
                if label == "identical" and any(words == m for m in members):
                    label, depth, extra = "repeated line", 0, ""
                note = ", ".join(x for x in (
                    label, f"{depth}-syllable" if depth >= 2 and label != "identical" else "",
                    extra) if x)
                members.append(words)
                out.append((letter, note))
                placed = True
                break
        if not placed:
            groups.append([words])
            out.append((chr(ord("A") + (len(groups) - 1) % 26), ""))
    return out


def internal_rhymes(words: list[str], next_words: list[str] | None) -> list[str]:
    """Perfect rhymes from a mid-line word to its line's end or the next line's middle."""
    def content(ws):
        return [w for w in dict.fromkeys(ws) if w not in STOPWORDS and len(w) > 2]

    if len(words) < 2:
        return []
    end, mids = words[-1], content(words[:-1])
    hits = [f"{m}/{end}" for m in mids if m != end and rhyme_quality(m, end)[0] == "perfect"]
    if next_words and len(next_words) > 1:
        for m in mids:
            hits += [f"{m}/{n}" for n in content(next_words[:-1])
                     if m != n and rhyme_quality(m, n)[0] == "perfect"]
    return hits


def _tag_base(tag: str) -> str:
    return re.sub(r"\s*\d+$", "", tag.strip()).lower()


def _scheme_shape(letters: list[str]) -> str:
    """Normalize detected letters so the same pattern compares equal (aBAB -> ABAB)."""
    seen: dict[str, str] = {}
    return "".join(seen.setdefault(l.upper(), chr(ord("A") + len(seen))) for l in letters)


def parse_sections(text: str) -> list[dict]:
    """Split lyrics into sections at blank lines and at section tags.

    Voice tags like [Male] or [Whispered] stay inside their section.
    """
    sections: list[dict] = [{"tag": None, "lines": []}]
    for raw in text.splitlines():
        line = raw.rstrip()
        m = TAG_RE.match(line)
        if not line.strip() or (m and _tag_base(m.group(1)) not in INLINE_TAGS):
            if sections[-1]["lines"] or sections[-1]["tag"]:
                sections.append({"tag": None, "lines": []})
            if m:
                sections[-1]["tag"] = m.group(1).strip()
            continue
        sections[-1]["lines"].append(line)
    return [s for s in sections if s["lines"] or s["tag"]]


def prepare_sections(text: str) -> list[dict]:
    """parse_sections plus each section's lead-line analyses and rhyme scheme."""
    sections = parse_sections(text)
    for s in sections:
        # Lead lines: not tag lines, and not lines that are only backing vocals.
        s["is_lead"] = [not TAG_RE.match(l) and bool(tokenize(PAREN_RE.sub(" ", l)))
                        for l in s["lines"]]
        s["analyses"] = [analyze_line(l) for l, lead in zip(s["lines"], s["is_lead"]) if lead]
        s["scheme"] = rhyme_scheme([a["words"] for a in s["analyses"]])
        s["shape"] = _scheme_shape([l for l, _ in s["scheme"]])
    return sections


def suno_checks(sections: list[dict]) -> list[str]:
    """Rules from the Suno songwriting skill that a program can check."""
    issues: list[str] = []
    by_base: dict[str, list[dict]] = {}
    for s in sections:
        tag = s["tag"] or "untagged"
        base = _tag_base(tag)
        if s["tag"] and base not in SUNO_TAGS:
            issues.append(f"[{tag}] isn't a standard Suno tag; put delivery notes in the style prompt")
        for line in s["lines"]:
            m = TAG_RE.match(line)
            if m and _tag_base(m.group(1)) not in SUNO_TAGS:
                issues.append(f"[{m.group(1)}] isn't a standard Suno tag")
        n = len(s["analyses"])
        if base == "verse" and not 4 <= n <= 6:
            issues.append(f"[{tag}] has {n} lines (verses: 4-6)")
        if base == "pre-chorus" and not 2 <= n <= 4:
            issues.append(f"[{tag}] has {n} lines (pre-choruses: 2-4)")
        by_base.setdefault(base, []).append(s)

        for a, (_, note) in zip(s["analyses"], s["scheme"]):
            words, where = a["words"], f"[{tag}] \"{a['text'].strip()}\""
            if note == "identical":
                issues.append(f"{where} rhymes '{words[-1]}' with itself")
            if words[-1] in DANGLING_ENDS:
                issues.append(f"{where} ends on '{words[-1]}': a line break is a breath, "
                              "don't split a clause")
            for rw in dict.fromkeys(w1 for w1, w2 in zip(words, words[1:]) if w1 == w2):
                issues.append(f"{where} repeats '{rw} {rw}': sound effect or spelled-out hook?")
            for m in WORD_RE.finditer(a["lead"]):
                tok, before = m.group(), a["lead"][:m.start()].rstrip()
                if (before and not before.endswith((".", "!", "?", '"')) and tok[0].isupper()
                        and tok.lower() not in CAPS_OK and not tok.lower().startswith("i'")):
                    issues.append(f"{where}: '{tok}' looks like a proper name (keep names out of lyrics)")
            joined = " ".join(tokenize(a["text"]))
            for term, lane in DRIFT_WORDS.items():
                if re.search(rf"\b{re.escape(term)}\b", joined):
                    issues.append(f"{where}: '{term}' can pull the song toward {lane}")

    for base in ("verse", "pre-chorus", "chorus"):
        shapes = {s["tag"]: s["shape"] for s in by_base.get(base, []) if s["shape"]}
        if len(set(shapes.values())) > 1:
            issues.append("matching sections use different rhyme schemes: "
                          + ", ".join(f"[{t}] {sh}" for t, sh in shapes.items()))
    choruses = ["\n".join(l.strip() for l in s["lines"]) for s in by_base.get("chorus", [])]
    if len(set(choruses)) > 1:
        issues.append("choruses differ; repeat the chorus exactly and vary only [Final Chorus]")

    def avg(group):
        counts = [a["syllables"] for s in group for a in s["analyses"]]
        return sum(counts) / len(counts) if counts else 0

    chorus_avg, verse_avg = avg(by_base.get("chorus", [])), avg(by_base.get("verse", []))
    if chorus_avg and verse_avg and chorus_avg >= verse_avg:
        issues.append(f"chorus averages {chorus_avg:.1f} syllables/line vs verses {verse_avg:.1f}; "
                      "keep the chorus leaner than the verses")
    return issues


def analyze_text(text: str, show_stress: bool = False, target: list[int] | None = None,
                 scheme: str | None = None, suno: bool = False) -> str:
    """Report syllables and rhyme groups per line.

    `target` (syllables per line) and `scheme` (e.g. "ABAB"; X = no rhyme
    needed) are cycled over the lines of each section. Lines that miss either
    get a flag plus "fix:" (rhyming end words) and "swap:" (synonyms) lines.
    `suno` adds the checks from the Suno songwriting skill.
    """
    sections = prepare_sections(text)
    out: list[str] = []
    total_estimated: set[str] = set()
    problems = lines_with_internal = total_lines = 0
    for s in sections:
        if s["tag"]:
            out.append(f"[{s['tag']}]")
        idx = 0
        first_of_letter: dict[str, list[str]] = {}
        for line, lead in zip(s["lines"], s["is_lead"]):
            if not lead:
                out.append(f"     {'' if TAG_RE.match(line) else 'bg':<2} {line.strip()}")
                continue
            a = s["analyses"][idx]
            letter, note = s["scheme"][idx]
            nxt = s["analyses"][idx + 1]["words"] if idx + 1 < len(s["analyses"]) else None
            internal = internal_rhymes(a["words"], nxt)
            total_lines += 1
            if internal:
                lines_with_internal += 1
                note = ", ".join(x for x in (note, "internal: " + " ".join(internal)) if x)
            flags = []
            want = target[idx % len(target)] if target else None
            if want is not None and a["syllables"] != want:
                flags.append(f"{a['syllables']} vs target {want}")
            rhyme_with = None  # word the suggestions should rhyme with
            if scheme:
                intended = scheme[idx % len(scheme)].upper()
                if intended not in "X-":
                    earlier = first_of_letter.get(intended)
                    if earlier is None:
                        first_of_letter[intended] = a["words"]
                    else:
                        rhyme_with = earlier[-1]
                        if is_self_rhyme(a["words"], earlier):
                            flags.append(f"rhymes '{rhyme_with}' with itself")
                        elif line_rhyme(a["words"], earlier)[0] not in RHYMES_OK:
                            flags.append(f"should rhyme with '{rhyme_with}' ({intended})")
            mark = "~" if a["estimated"] else " "
            bg = f" (+{a['backing_syllables']} bg)" if a["backing_syllables"] else ""
            out.append(f"{a['syllables']:>3}{mark} {letter:<2} {a['text'].strip()}{bg}"
                       + (f"   ({note})" if note else "")
                       + (f"  <-- {'; '.join(flags)}" if flags else ""))
            if flags:
                problems += 1
                out.append("          " + fix_hint(a["words"], a["syllables"], want, rhyme_with))
                swaps = swap_hint(a["words"], a["syllables"] - want if want else 0)
                if swaps:
                    out.append("          " + swaps)
            if show_stress:
                out.append(f"          stress: {a['stress']}")
            total_estimated.update(a["estimated"])
            idx += 1
        if s["analyses"]:
            total = sum(a["syllables"] for a in s["analyses"])
            out.append(f"          = {len(s['analyses'])} lines, {total} syllables "
                       f"(avg {total / len(s['analyses']):.1f}), scheme {s['shape']}")
        out.append("")

    out.append("Legend: number = syllables, letter = rhyme group "
               "(UPPER perfect, lower slant), ~ = contains estimated words, bg = backing vocals")
    if total_estimated:
        out.append("Estimated (not in CMU dictionary): " + ", ".join(sorted(total_estimated)))
    if total_lines:
        out.append(f"Internal rhymes on {lines_with_internal} of {total_lines} lines.")
    if target or scheme:
        out.append(f"{problems} line(s) need work." if problems else "All lines hit the targets.")
    if suno:
        issues = suno_checks(sections)
        out.append("")
        out.append("Suno checks: " + ("all passed." if not issues else f"{len(issues)} issue(s)"))
        out += [f"- {i}" for i in issues]
    return "\n".join(out).rstrip()


def check_style(prompt: str) -> list[str]:
    """Check a Suno style prompt against the skill's style-prompt rules."""
    p = prompt.strip()
    issues = []
    n = len(p)
    if not 200 <= n <= 350:
        issues.append(f"{n} characters (aim for 200-350)")
    if not re.search(r"\b\d{2,3}\s*bpm\b", p, re.I):
        issues.append("no BPM (e.g. '76 BPM')")
    if not re.search(r"vocal|voice|sung|singer|tenor|baritone|alto|soprano|falsetto", p, re.I):
        issues.append("no vocal description")
    low = " ".join(tokenize(p))
    for term, lane in DRIFT_WORDS.items():
        if re.search(rf"\b{re.escape(term)}\b", low):
            issues.append(f"'{term}' reads as {lane}")
    caps = [t for t in WORD_RE.findall(p)[1:] if t[0].isupper() and not t.isupper()]
    if caps:
        issues.append("capitalized words may be artist names (none allowed): " + ", ".join(caps))
    return issues


# ---------------------------------------------------------------- album ----

TRACK_RE = re.compile(r"^#{2,3}\s*(\d+)\s*[·.\-:]\s*(.+?)\s*$")
BPM_RE = re.compile(r"\b(\d{2,3})\s*bpm\b", re.I)


def parse_album(text: str) -> dict:
    """Read an album markdown file: tracklist table rows and track sections.

    A track section starts with a heading like "## 03 · Title" and holds a
    code block after a "Style" line and one after a "Lyrics" line.
    """
    tracks: list[dict] = []
    table: dict[int, list[str]] = {}
    current, expect, block = None, None, None
    for line in text.splitlines():
        if block is not None:
            if line.strip().startswith("```"):
                if current is not None and expect:
                    current[expect] = "\n".join(block)
                block, expect = None, None
            else:
                block.append(line)
            continue
        m = TRACK_RE.match(line)
        if m:
            current = {"num": int(m.group(1)), "title": m.group(2).strip(), "style": "", "lyrics": ""}
            tracks.append(current)
            continue
        if line.strip().startswith("```"):
            block = []
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.lstrip().startswith("|") else []
        if current is None and len(cells) > 1 and cells[0].isdigit():
            table[int(cells[0])] = cells
        if current is not None:
            low = line.lower()
            if "style" in low and "lyrics" not in low:
                expect = "style"
            elif "lyrics" in low:
                expect = "lyrics"
    return {"tracks": tracks, "table": table}


def album_report(text: str, track: int | None = None) -> str:
    """Check every track of an album file, or show one track in full."""
    album = parse_album(text)
    tracks = album["tracks"]
    if not tracks:
        return "No track sections found (headings like '## 01 · Title')."
    if track is not None:
        t = next((t for t in tracks if t["num"] == track), None)
        if t is None:
            return f"No track {track}."
        style_issues = check_style(t["style"]) if t["style"] else ["no Style block"]
        return (f"{t['num']:02d} · {t['title']}\n\n" + analyze_text(t["lyrics"], suno=True)
                + "\n\nStyle: " + ("looks good." if not style_issues else "")
                + "".join(f"\n- {i}" for i in style_issues))

    out, bpms = [], []
    for t in tracks:
        problems = []
        if not t["lyrics"]:
            problems.append("no Lyrics block")
        else:
            problems += suno_checks(prepare_sections(t["lyrics"]))
        problems += [f"style: {i}" for i in (check_style(t["style"]) if t["style"] else ["no Style block"])]
        m = BPM_RE.search(t["style"])
        bpm = int(m.group(1)) if m else None
        if bpm:
            bpms.append((bpm, t["num"]))
        row = album["table"].get(t["num"])
        if album["table"] and row is None:
            problems.append("missing from the tracklist table")
        elif row:
            if t["title"].lower() not in (c.lower() for c in row):
                problems.append(f"tracklist table title differs: {row[1]!r}")
            if bpm and str(bpm) not in row:
                problems.append(f"tracklist table BPM doesn't match the style prompt ({bpm})")
        status = "ok" if not problems else f"{len(problems)} issue(s)"
        out.append(f"{t['num']:02d} · {t['title']} ({bpm or '?'} BPM): {status}")
        out += [f"     - {p}" for p in problems]
    for n in album["table"]:
        if n not in {t["num"] for t in tracks}:
            out.append(f"tracklist table lists track {n}, but there's no section for it")
    nums = [t["num"] for t in tracks]
    if nums != list(range(1, len(nums) + 1)):
        out.append(f"track numbers aren't 1..{len(nums)} in order: {nums}")
    bpms.sort()
    close = [f"{a[1]:02d}/{b[1]:02d} ({a[0]}/{b[0]})" for a, b in zip(bpms, bpms[1:]) if b[0] - a[0] < 6]
    out.append("")
    out.append("BPMs: " + ", ".join(f"{b}" for b, _ in bpms))
    if close:
        out.append("BPMs within 5 of each other (spread them so nothing blurs): " + ", ".join(close))
    out.append("Details for one track: python lyrics.py album <file> --track N")
    return "\n".join(out)


# ------------------------------------------------------------------ cli ----

def _read(path: str) -> str:
    return sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="syllables + rhyme scheme for a lyric file or stdin (-)")
    a.add_argument("file")
    a.add_argument("--stress", action="store_true", help="show stress pattern per line")
    a.add_argument("--target", help="comma-separated syllable targets, cycled per section (e.g. 8,8,8,8)")
    a.add_argument("--scheme", help="rhyme scheme to check, cycled per section (e.g. ABAB, AABB; X = no rhyme)")
    a.add_argument("--suno", action="store_true", help="also check the Suno songwriting rules")

    l = sub.add_parser("line", help="syllables and stress for a single line")
    l.add_argument("text", nargs="+")
    l.add_argument("--target", type=int, help="syllable target; suggests words that hit it")
    l.add_argument("--rhyme", help="word the line should rhyme with")

    r = sub.add_parser("rhymes", help="perfect and slant rhymes for a word")
    r.add_argument("word")
    r.add_argument("--all", action="store_true", help="include rare words and names")
    r.add_argument("--limit", type=int, default=40)
    r.add_argument("--syllables", type=int, help="only rhymes with this many syllables")

    w = sub.add_parser("words", help="synonyms for a word, grouped by syllable count")
    w.add_argument("word")
    w.add_argument("--syllables", type=int, help="only words with this many syllables")
    w.add_argument("--rhyme", help="only words that rhyme with this one")
    w.add_argument("--related", action="store_true", help="include broader/narrower words (bird -> crow)")
    w.add_argument("--all", action="store_true", help="include rare words")

    c = sub.add_parser("compare", help="rate how well words rhyme with the first")
    c.add_argument("words", nargs="+")

    al = sub.add_parser("album", help="check every track in an album markdown file")
    al.add_argument("file")
    al.add_argument("--track", type=int, help="show one track's full analysis")

    st = sub.add_parser("style", help="check a Suno style prompt (text, a file path, or - for stdin)")
    st.add_argument("prompt", nargs="+")

    args = ap.parse_args(argv)

    if args.cmd == "analyze":
        target = [int(x) for x in args.target.split(",")] if args.target else None
        print(analyze_text(_read(args.file), args.stress, target, args.scheme, args.suno))

    elif args.cmd == "line":
        res = analyze_line(" ".join(args.text))
        print(f"syllables: {res['syllables']}")
        print(f"stress:    {res['stress']}")
        for word in res["words"]:
            n, known = syllable_count(word)
            print(f"  {word:<15} {n}{'' if known else ' (estimated)'}  {stress_pattern(word)}")
        label = None
        if args.rhyme and res["words"] and tokenize(args.rhyme):
            label, depth, extra = line_rhyme(res["words"], tokenize(args.rhyme))
            print(f"rhyme with '{args.rhyme}': {label}" + (f" ({extra})" if extra else ""))
        off_target = args.target is not None and res["syllables"] != args.target
        bad_rhyme = label is not None and label not in RHYMES_OK
        if off_target or bad_rhyme:
            rhyme_with = tokenize(args.rhyme)[-1] if label is not None else None
            print(fix_hint(res["words"], res["syllables"], args.target, rhyme_with))
            if off_target:
                swaps = swap_hint(res["words"], res["syllables"] - args.target)
                if swaps:
                    print(swaps)

    elif args.cmd == "rhymes":
        if not phones(args.word):
            print(f"'{args.word}' is not in the CMU dictionary; can't look up rhymes.")
            return 1
        res = find_rhymes(args.word, include_rare=args.all, limit=args.limit,
                          syllables_=args.syllables)
        print(f"{args.word}: {' / '.join(phones(args.word))}")
        print("perfect:", ", ".join(res["perfect"]) or "(none)")
        print("slant:  ", ", ".join(res["slant"]) or "(none)")

    elif args.cmd == "words":
        if wn is None:
            print("Thesaurus not installed. Run ./setup.sh first.")
            return 1
        found = synonyms(args.word, related=args.related, include_rare=args.all)
        if args.rhyme:
            found = tuple(p for p in found if phrase_rhyme(p, args.rhyme)[0] in ("perfect", "slant"))
        by_count: dict[int, list[str]] = {}
        for p in found:
            by_count.setdefault(phrase_syllables(p), []).append(p)
        if args.syllables is not None:
            by_count = {k: v for k, v in by_count.items() if k == args.syllables}
        if not by_count:
            print(f"no matches for '{args.word}'" + ("; try --related or --all" if not args.related else ""))
            return 1
        print(f"{args.word} ({phrase_syllables(args.word)} syllables):")
        for k in sorted(by_count):
            print(f"  {k}: {', '.join(by_count[k][:15])}")

    elif args.cmd == "compare":
        base, *others = args.words
        if not others:
            ap.error("compare needs at least two words")
        for o in others:
            label, depth = rhyme_quality(base, o)
            extra = f", {depth} vowel sound(s) match from the end" if depth else ""
            print(f"{base} / {o}: {label}{extra}")

    elif args.cmd == "album":
        print(album_report(_read(args.file), args.track))

    elif args.cmd == "style":
        text = " ".join(args.prompt)
        if text == "-" or os.path.isfile(text):
            text = _read(text)
        issues = check_style(text)
        print(f"{len(text.strip())} characters.")
        print("Style prompt looks good." if not issues else "\n".join(f"- {i}" for i in issues))
    return 0


if __name__ == "__main__":
    sys.exit(main())
