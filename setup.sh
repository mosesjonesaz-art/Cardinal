#!/usr/bin/env bash
# Install the lyric and audio tools. Run once per session: cloud sessions start fresh.
set -euo pipefail
cd "$(dirname "$0")"

pip install -q --root-user-action=ignore -r requirements.txt -r requirements-audio.txt

# WordNet (the thesaurus) is a data file, not a pip package. NLTK's own
# downloader refuses to run behind a proxy, so fetch the same file directly.
WORDNET="${NLTK_DATA:-$HOME/nltk_data}/corpora/wordnet.zip"
if [ ! -f "$WORDNET" ]; then
  mkdir -p "$(dirname "$WORDNET")"
  curl -sSfL --retry 3 -o "$WORDNET" \
    https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip
fi

python3 lyrics.py rhymes fire --limit 1 >/dev/null
python3 lyrics.py words tired --syllables 1 >/dev/null
command -v ffmpeg >/dev/null || { echo "audio.py needs ffmpeg (apt-get install -y ffmpeg)"; exit 1; }
python3 -c "import librosa, pyloudnorm, scipy, matplotlib"
echo "Lyric and audio tools ready."
