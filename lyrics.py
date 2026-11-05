#!/usr/bin/env python3
"""Lyric checker: syllable counts, stress patterns, rhyme schemes, rhyme finder.

Syllables come from the CMU Pronouncing Dictionary (via `pronouncing`).
Words the dictionary doesn't know fall back to the `syllables` estimator
and are marked with `~` so you know the count is a guess.

Usage:
  python lyrics.py analyze song.txt            # per-line syllables + rhyme scheme
  python lyrics.py analyze -                   # read lyrics from stdin
  python lyrics.py analyze song.txt --stress   # also show stress pattern per line
  python lyrics.py analyze song.txt --target 8,8,8,8   # flag lines off target
  python lyrics.py line "I've been walking down this road"
  python lyrics.py rhymes fire                 # perfect + slant rhymes, common first
  python lyrics.py rhymes fire --all           # include rare words / names
  python lyrics.py compare fire higher         # how well two words rhyme
"""

from __future__ import annotations

import argparse
import re
import sys
from functools import lru_cache

import pronouncing
import syllables

try:
    from wordfreq import zipf_frequency
except ImportError:  # optional: only used to rank rhyme suggestions
    zipf_frequency = None

SECTION_RE = re.compile(r"^\s*[\[(].*[\])]\s*$")  # [Chorus], (Verse 2), etc.
WORD_RE = re.compile(r"[A-Za-z0-9']+")
VOWEL_RE = re.compile(r"^[AEIOU]")
CONS = r"(?: [^AEIOU ]\S*)*"  # any run of consonant phones

STRENGTH_ORDER = {"identical": 4, "perfect": 3, "slant": 2, "weak": 1, "none": 0}


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
    return tuple(found)


def syllable_count(word: str) -> tuple[int, bool]:
    """(count, from_dictionary). Uses the first CMU pronunciation if known."""
    p = phones(word)
    if p:
        return pronouncing.syllable_count(p[0]), True
    return max(1, syllables.estimate(word)), False


def stress_pattern(word: str) -> str:
    """CMU stress digits: 1 = primary, 2 = secondary, 0 = unstressed. '?' if unknown."""
    p = phones(word)
    if p:
        return pronouncing.stresses(p[0])
    n, _ = syllable_count(word)
    return "?" * n


def zipf(word: str) -> float:
    return zipf_frequency(word, "en") if zipf_frequency else 0.0


# --------------------------------------------------------------- rhymes ----

def _strip_stress(phone_str: str) -> str:
    return re.sub(r"\d", "", phone_str)


SCHWA_LIKE = {"AH", "IH", "EH", "UH"}  # unstressed, these all sound roughly like "uh"


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
    and depth is how many vowel sounds match counting back from the end
    (depth >= 2 is a multisyllabic rhyme).
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


def _perfect_pattern(rhyming_part: str) -> str:
    """Regex matching any pronunciation ending in this rhyming part (any stress)."""
    parts = [p + (r"\d" if VOWEL_RE.match(p) else "") for p in _strip_stress(rhyming_part).split()]
    return r"(?:^| )" + " ".join(parts) + "$"


def find_rhymes(word: str, include_rare: bool = False, limit: int = 40) -> dict[str, list[str]]:
    """Perfect and slant rhymes for a word, most common words first."""
    word = word.lower()
    p = phones(word)
    if not p:
        return {"perfect": [], "slant": []}
    perfect: set[str] = set()
    slant: set[str] = set()
    for pron in p:
        perfect.update(pronouncing.search(_perfect_pattern(pronouncing.rhyming_part(pron))))
    # Slant rhymes: same vowel sounds from the last stressed vowel on, any
    # consonants. Only the main pronunciation, so "fire" (F AY ER) suggests
    # lighter/tiger/iron rather than every word with an AY in it.
    rp = pronouncing.rhyming_part(p[0])
    vowels = _vowels(rp)
    if vowels:
        vpat = [r"(?:AH|IH|EH|UH)0" if v == "@" else v + r"\d" for v in vowels]
        # If the word ends in a consonant, require one (time -> line, not time -> my).
        end = r"(?: [^AEIOU ]\S*)+$" if _tail(rp) else CONS + "$"
        slant.update(pronouncing.search(r"(?:^| )" + (CONS + " ").join(vpat) + end))
    perfect.discard(word)
    slant -= perfect | {word}

    def rank(words: set[str]) -> list[str]:
        words = {w for w in words if "'" not in w and "." not in w}
        if zipf_frequency and not include_rare:
            words = {w for w in words if zipf(w) >= 2.5}
        return sorted(words, key=lambda w: (-zipf(w), w))[:limit]

    return {"perfect": rank(perfect), "slant": rank(slant)}


# ------------------------------------------------------------- analysis ----

def analyze_line(line: str) -> dict:
    words = tokenize(line)
    counts = [syllable_count(w) for w in words]
    return {
        "text": line,
        "words": words,
        "syllables": sum(c for c, _ in counts),
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
        if inner in ("perfect", "slant", "identical"):
            return inner, inner_depth + 1, f"repeated '{a[-1]}'"
    return label, depth, ""


def rhyme_scheme(lines: list[list[str]]) -> list[tuple[str, str]]:
    """Assign rhyme-scheme letters to lines (each a list of words).

    Returns [(letter, note), ...]. A line joins the earliest earlier group it
    rhymes with (perfect or slant). Uppercase = perfect, lowercase = slant only.
    """
    groups: list[list[list[str]]] = []
    out: list[tuple[str, str]] = []
    for words in lines:
        if not words:
            out.append(("-", ""))
            continue
        placed = False
        for gi, members in enumerate(groups):
            label, depth, extra = max(
                (line_rhyme(words, m) for m in members),
                key=lambda r: (STRENGTH_ORDER.get(r[0], 0), r[1]))
            if label in ("perfect", "identical", "slant"):
                letter = chr(ord("A") + gi % 26)
                if label == "slant":
                    letter = letter.lower()
                note = ", ".join(x for x in (
                    label, f"{depth}-syllable" if depth >= 2 else "", extra) if x)
                members.append(words)
                out.append((letter, note))
                placed = True
                break
        if not placed:
            groups.append([words])
            out.append((chr(ord("A") + (len(groups) - 1) % 26), ""))
    return out


def analyze_text(text: str, show_stress: bool = False, target: list[int] | None = None) -> str:
    stanzas: list[list[str]] = [[]]
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            if stanzas[-1]:
                stanzas.append([])
            continue
        stanzas[-1].append(line)

    out: list[str] = []
    total_estimated: set[str] = set()
    for stanza in stanzas:
        if not stanza:
            continue
        lyric_lines = [l for l in stanza if not SECTION_RE.match(l)]
        analyses = [analyze_line(l) for l in lyric_lines]
        scheme = iter(rhyme_scheme([a["words"] for a in analyses]))
        it = iter(analyses)
        idx = 0
        for line in stanza:
            if SECTION_RE.match(line):
                out.append(line.strip())
                continue
            a = next(it)
            letter, note = next(scheme)
            mark = "~" if a["estimated"] else " "
            flag = ""
            if target:
                want = target[idx % len(target)]
                if a["syllables"] != want:
                    flag = f"  <-- {a['syllables']} vs target {want}"
            out.append(f"{a['syllables']:>3}{mark} {letter:<2} {a['text'].strip()}"
                       + (f"   ({note})" if note else "") + flag)
            if show_stress:
                out.append(f"          stress: {a['stress']}")
            total_estimated.update(a["estimated"])
            idx += 1
        out.append("")

    out.append("Legend: number = syllables, letter = rhyme group "
               "(UPPER perfect, lower slant), ~ = contains estimated words")
    if total_estimated:
        out.append("Estimated (not in CMU dictionary): " + ", ".join(sorted(total_estimated)))
    return "\n".join(out).rstrip()


# ------------------------------------------------------------------ cli ----

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="syllables + rhyme scheme for a lyric file or stdin (-)")
    a.add_argument("file")
    a.add_argument("--stress", action="store_true", help="show stress pattern per line")
    a.add_argument("--target", help="comma-separated syllable targets, cycled per stanza line (e.g. 8,8,8,8)")

    l = sub.add_parser("line", help="syllables and stress for a single line")
    l.add_argument("text", nargs="+")

    r = sub.add_parser("rhymes", help="perfect and slant rhymes for a word")
    r.add_argument("word")
    r.add_argument("--all", action="store_true", help="include rare words and names")
    r.add_argument("--limit", type=int, default=40)

    c = sub.add_parser("compare", help="rate how well words rhyme with the first")
    c.add_argument("words", nargs="+")

    args = ap.parse_args(argv)

    if args.cmd == "analyze":
        text = sys.stdin.read() if args.file == "-" else open(args.file, encoding="utf-8").read()
        target = [int(x) for x in args.target.split(",")] if args.target else None
        print(analyze_text(text, args.stress, target))

    elif args.cmd == "line":
        res = analyze_line(" ".join(args.text))
        print(f"syllables: {res['syllables']}")
        print(f"stress:    {res['stress']}")
        for w in res["words"]:
            n, known = syllable_count(w)
            print(f"  {w:<15} {n}{'' if known else ' (estimated)'}  {stress_pattern(w)}")

    elif args.cmd == "rhymes":
        res = find_rhymes(args.word, include_rare=args.all, limit=args.limit)
        if not phones(args.word):
            print(f"'{args.word}' is not in the CMU dictionary; can't look up rhymes.")
            return 1
        print(f"{args.word}: {' / '.join(phones(args.word))}")
        print("perfect:", ", ".join(res["perfect"]) or "(none)")
        print("slant:  ", ", ".join(res["slant"]) or "(none)")

    elif args.cmd == "compare":
        base, *others = args.words
        if not others:
            ap.error("compare needs at least two words")
        for o in others:
            label, depth = rhyme_quality(base, o)
            extra = f", {depth} vowel sound(s) match from the end" if depth else ""
            print(f"{base} / {o}: {label}{extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
