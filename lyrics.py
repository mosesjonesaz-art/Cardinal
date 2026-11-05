#!/usr/bin/env python3
"""Lyric checker: syllable counts, stress patterns, rhyme schemes, rhyme finder.

Syllables come from the CMU Pronouncing Dictionary (via `pronouncing`).
Words the dictionary doesn't know fall back to the `syllables` estimator
and are marked with `~` so you know the count is a guess.

Usage:
  python lyrics.py analyze song.txt            # per-line syllables + rhyme scheme
  python lyrics.py analyze -                   # read lyrics from stdin
  python lyrics.py analyze song.txt --stress   # also show stress pattern per line
  python lyrics.py analyze song.txt --target 8,8,8,8 --scheme ABAB
                                               # flag lines that miss, with suggested fixes
  python lyrics.py line "I've been walking down this road" --target 8 --rhyme cold
  python lyrics.py rhymes fire                 # perfect + slant rhymes, common first
  python lyrics.py rhymes fire --syllables 2   # only 2-syllable rhymes
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


def syllable_options(word: str) -> set[int]:
    """Every syllable count the word can be sung with (fire = 1 or 2)."""
    p = phones(word)
    if p:
        return {pronouncing.syllable_count(x) for x in p}
    return {syllable_count(word)[0]}


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
    """Regex for pronunciations ending in this rhyming part.

    The first vowel must be stressed (primary or secondary), so road matches
    explode and railroad but not followed. Later vowels may have any stress.
    """
    parts, first = [], True
    for p in _strip_stress(rhyming_part).split():
        if VOWEL_RE.match(p):
            p += "[12]" if first else r"\d"
            first = False
        parts.append(p)
    return r"(?:^| )" + " ".join(parts) + "$"


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
    rp = pronouncing.rhyming_part(p[0])
    vowels = _vowels(rp)
    if vowels:
        vpat = [r"(?:AH|IH|EH|UH)0" if v == "@" else v + r"\d" for v in vowels]
        # If the word ends in a consonant, require one (time -> line, not time -> my).
        end = r"(?: [^AEIOU ]\S*)+$" if _tail(rp) else CONS + "$"
        slant.update(pronouncing.search(r"(?:^| )" + (CONS + " ").join(vpat) + end))
    perfect.discard(word)
    slant -= perfect | {word}

    def rank(words: set[str]) -> tuple[str, ...]:
        # Drop hyphenated compounds (on-line) and single letters except "i".
        words = {w for w in words if not re.search(r"['.\-]", w) and (len(w) > 1 or w == "i")}
        if zipf_frequency and not include_rare:
            words = {w for w in words if zipf(w) >= 2.5}
        return tuple(sorted(words, key=lambda w: (-zipf(w), w)))

    return rank(perfect), rank(slant)


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


def analyze_text(text: str, show_stress: bool = False, target: list[int] | None = None,
                 scheme: str | None = None) -> str:
    """Report syllables and rhyme groups per line.

    `target` (syllables per line) and `scheme` (e.g. "ABAB"; X = no rhyme
    needed) are cycled over the lines of each stanza. Lines that miss either
    get a flag plus a "fix:" line with end words that would fix them.
    """
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
    problems = 0
    for stanza in stanzas:
        if not stanza:
            continue
        lyric_lines = [l for l in stanza if not SECTION_RE.match(l)]
        analyses = [analyze_line(l) for l in lyric_lines]
        detected = iter(rhyme_scheme([a["words"] for a in analyses]))
        it = iter(analyses)
        idx = 0
        first_of_letter: dict[str, list[str]] = {}
        for line in stanza:
            if SECTION_RE.match(line):
                out.append(line.strip())
                continue
            a = next(it)
            letter, note = next(detected)
            mark = "~" if a["estimated"] else " "
            flags = []
            want = target[idx % len(target)] if target else None
            if want is not None and a["syllables"] != want:
                flags.append(f"{a['syllables']} vs target {want}")
            rhyme_with = None  # word suggestions should rhyme with
            if scheme and a["words"]:
                intended = scheme[idx % len(scheme)].upper()
                if intended not in "X-":
                    earlier = first_of_letter.get(intended)
                    if earlier is None:
                        first_of_letter[intended] = a["words"]
                    else:
                        rhyme_with = earlier[-1]
                        if line_rhyme(a["words"], earlier)[0] not in ("perfect", "slant", "identical"):
                            flags.append(f"should rhyme with '{rhyme_with}' ({intended})")
            out.append(f"{a['syllables']:>3}{mark} {letter:<2} {a['text'].strip()}"
                       + (f"   ({note})" if note else "")
                       + (f"  <-- {'; '.join(flags)}" if flags else ""))
            if flags:
                problems += 1
                out.append("          " + fix_hint(a["words"], a["syllables"], want, rhyme_with))
            if show_stress:
                out.append(f"          stress: {a['stress']}")
            total_estimated.update(a["estimated"])
            idx += 1
        out.append("")

    out.append("Legend: number = syllables, letter = rhyme group "
               "(UPPER perfect, lower slant), ~ = contains estimated words")
    if total_estimated:
        out.append("Estimated (not in CMU dictionary): " + ", ".join(sorted(total_estimated)))
    if target or scheme:
        out.append(f"{problems} line(s) need work." if problems else "All lines hit the targets.")
    return "\n".join(out).rstrip()


# ------------------------------------------------------------------ cli ----

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="syllables + rhyme scheme for a lyric file or stdin (-)")
    a.add_argument("file")
    a.add_argument("--stress", action="store_true", help="show stress pattern per line")
    a.add_argument("--target", help="comma-separated syllable targets, cycled per stanza line (e.g. 8,8,8,8)")
    a.add_argument("--scheme", help="rhyme scheme to check, cycled per stanza (e.g. ABAB, AABB; X = no rhyme)")

    l = sub.add_parser("line", help="syllables and stress for a single line")
    l.add_argument("text", nargs="+")
    l.add_argument("--target", type=int, help="syllable target; suggests end words that hit it")
    l.add_argument("--rhyme", help="word the line should rhyme with")

    r = sub.add_parser("rhymes", help="perfect and slant rhymes for a word")
    r.add_argument("word")
    r.add_argument("--all", action="store_true", help="include rare words and names")
    r.add_argument("--limit", type=int, default=40)
    r.add_argument("--syllables", type=int, help="only rhymes with this many syllables")

    c = sub.add_parser("compare", help="rate how well words rhyme with the first")
    c.add_argument("words", nargs="+")

    args = ap.parse_args(argv)

    if args.cmd == "analyze":
        text = sys.stdin.read() if args.file == "-" else open(args.file, encoding="utf-8").read()
        target = [int(x) for x in args.target.split(",")] if args.target else None
        print(analyze_text(text, args.stress, target, args.scheme))

    elif args.cmd == "line":
        res = analyze_line(" ".join(args.text))
        print(f"syllables: {res['syllables']}")
        print(f"stress:    {res['stress']}")
        for w in res["words"]:
            n, known = syllable_count(w)
            print(f"  {w:<15} {n}{'' if known else ' (estimated)'}  {stress_pattern(w)}")
        label = None
        if args.rhyme and res["words"] and tokenize(args.rhyme):
            label, depth, extra = line_rhyme(res["words"], tokenize(args.rhyme))
            print(f"rhyme with '{args.rhyme}': {label}" + (f" ({extra})" if extra else ""))
        off_target = args.target is not None and res["syllables"] != args.target
        bad_rhyme = label is not None and label not in ("perfect", "slant", "identical")
        if off_target or bad_rhyme:
            rhyme_with = tokenize(args.rhyme)[-1] if label is not None else None
            print(fix_hint(res["words"], res["syllables"], args.target, rhyme_with))

    elif args.cmd == "rhymes":
        res = find_rhymes(args.word, include_rare=args.all, limit=args.limit,
                          syllables_=args.syllables)
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
