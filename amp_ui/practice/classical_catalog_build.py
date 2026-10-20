#!/usr/bin/env python3
"""Write each classical Practice track's recommended tone into riffs.json.

BPM comes from tracks.json. When piano_scores/<id>.json exists, its bpm must
match. delay_ms is a note value of that BPM (eighth or dotted eighth).

Phrases stay where they are. This script only replaces the tone object.

    python3 amp_ui/practice/classical_catalog_build.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRACTICE = ROOT / "amp_ui" / "static" / "practice"
TRACKS_PATH = PRACTICE / "tracks.json"
RIFFS_PATH = PRACTICE / "riffs.json"
SCORES_DIR = PRACTICE / "piano_scores"
FACTORY_PATH = ROOT / "presets" / "factory.json"
IRS_DIR = ROOT / "irs"

EIGHTH = 0.5
DOTTED_EIGHTH = 0.75

FINGERSTYLE_IR = "102_Dtar_small_fingerstyle-_ir.wav"
MESA_IR = "106 Mesa MKIIC+ TM1.wav"
MESA_IR_2 = "107 Mesa MKIIC+ TM 2.wav"

# slot, name, note value, feedback, mix, why, optional ir, optional extra overrides.
# why uses {bpm} and {delay}.
TRACK_TONES = {
    "moonlit-echo-piano": (
        110,
        "Dreamy Lead",
        DOTTED_EIGHTH,
        0.42,
        0.28,
        "Dreamy Lead for a romantic piano loop at {bpm} BPM. A dotted-eighth delay ({delay} ms) blooms the arpeggios through the preset Mesa cab IR.",
        None,
        None,
    ),
    "c-gentle-evening-piano": (
        108,
        "Nothing Clean",
        EIGHTH,
        0.22,
        0.16,
        "Nothing Clean for a soft evening loop at {bpm} BPM. An eighth-note delay ({delay} ms) sits under the melody through the preset Marshall cab IR.",
        None,
        None,
    ),
    "bach-prelude-d": (
        73,
        "Open Chordus PH",
        EIGHTH,
        0.2,
        0.14,
        "Open Chordus PH through the Mesa Mark IIC+ cab IR for a D major prelude at {bpm} BPM. An eighth-note delay ({delay} ms) leaves the broken chords clear.",
        MESA_IR,
        {"ir_mix": 1.0},
    ),
    "mozart-k545": (
        17,
        "Essex A30",
        DOTTED_EIGHTH,
        0.28,
        0.18,
        "Essex A30 for the K.545 allegro at {bpm} BPM. A dotted-eighth delay ({delay} ms) through the preset Marshall cab IR adds a little Alberti shimmer.",
        None,
        None,
    ),
    "paganini-caprice-24": (
        7,
        "MK IV lead 2",
        EIGHTH,
        0.22,
        0.16,
        "MK IV lead 2 for the Caprice 24 theme at {bpm} BPM. An eighth-note delay ({delay} ms) through the preset Mesa cab IR keeps the lead tight.",
        None,
        None,
    ),
    "paganini-caprice-5": (
        7,
        "MK IV lead 2",
        EIGHTH,
        0.16,
        0.1,
        "The same MK IV lead 2 voice, drier, for Caprice 5 at {bpm} BPM. An eighth-note delay ({delay} ms) through the preset Mesa cab IR.",
        None,
        None,
    ),
    "chopin-nocturne-e-major": (
        7,
        "MK IV lead 2",
        DOTTED_EIGHTH,
        0.35,
        0.22,
        "MK IV lead 2 with the drive pulled down to 12 for a lyrical nocturne at {bpm} BPM. A dotted-eighth delay ({delay} ms) through the preset Mesa cab IR.",
        None,
        {"drive": 12},
    ),
    "chopin-prelude-e-minor": (
        108,
        "Nothing Clean",
        EIGHTH,
        0.12,
        0.08,
        "Nothing Clean on the small fingerstyle acoustic IR for the E minor prelude at {bpm} BPM. A quiet eighth-note delay ({delay} ms) stays almost dry.",
        FINGERSTYLE_IR,
        {"ir_mix": 1.0},
    ),
    "debussy-clair-d-major": (
        110,
        "Dreamy Lead",
        DOTTED_EIGHTH,
        0.5,
        0.34,
        "Dreamy Lead for Clair de lune at {bpm} BPM. A long dotted-eighth delay ({delay} ms) through the preset Mesa cab IR gives the impressionist bloom.",
        None,
        None,
    ),
    "vivaldi-spring-e-major": (
        7,
        "MK IV lead 2",
        EIGHTH,
        0.18,
        0.12,
        "MK IV lead 2 with the second Mesa cab IR for Spring at {bpm} BPM, a high-gain violin lead. An eighth-note delay ({delay} ms) keeps the allegro articulate.",
        MESA_IR_2,
        {"ir_mix": 1.0},
    ),
    "beethoven-moonlight-a-minor": (
        3,
        "Taylor LIVE",
        EIGHTH,
        0.15,
        0.08,
        "Taylor LIVE with the drive at 0, on the small fingerstyle acoustic IR, for Moonlight at {bpm} BPM. No distortion, and a tiny eighth-note delay ({delay} ms).",
        FINGERSTYLE_IR,
        {"drive": 0, "ir_mix": 1.0},
    ),
}


def delay_ms(bpm: float, subdivision: float) -> int:
    """Nearest millisecond of a note value, inside the amp's 50–800 ms delay."""
    exact = (60000.0 / float(bpm)) * float(subdivision)
    rounded = int(round(exact))
    if not 50 <= rounded <= 800:
        raise ValueError(f"delay {rounded} ms at {bpm} BPM is outside 50–800")
    if abs(exact - rounded) > 2:
        raise ValueError(f"delay {rounded} ms is not a note value at {bpm} BPM ({exact:.2f})")
    return rounded


def _bpm_for(track: dict) -> int:
    bpm = int(track["bpm"])
    score_path = SCORES_DIR / f"{track['id']}.json"
    if not score_path.is_file():
        return bpm
    score = json.loads(score_path.read_text(encoding="utf-8"))
    score_bpm = int(score["bpm"])
    if score_bpm != bpm:
        raise ValueError(f"{track['id']}: piano score bpm {score_bpm} != tracks.json bpm {bpm}")
    return score_bpm


def _tone_for(track_id: str, bpm: int) -> dict:
    slot, name, subdivision, feedback, mix, why, ir, extra = TRACK_TONES[track_id]
    delay = delay_ms(bpm, subdivision)
    overrides = {}
    if extra:
        # drive and ir_mix sit ahead of the delay so the written object matches the catalog.
        if "drive" in extra:
            overrides["drive"] = extra["drive"]
        if "ir_mix" in extra:
            overrides["ir_mix"] = extra["ir_mix"]
    overrides["delay_ms"] = delay
    overrides["feedback"] = feedback
    overrides["mix"] = mix
    tone = {"slot": slot, "name": name}
    if ir:
        tone["ir"] = ir
    tone["overrides"] = overrides
    tone["why"] = why.format(bpm=bpm, delay=delay)
    return tone


def _load_factory() -> dict:
    catalog = json.loads(FACTORY_PATH.read_text(encoding="utf-8"))
    return {int(preset["slot"]): preset["name"] for preset in catalog["presets"]}


def _check_tone(track_id: str, tone: dict, names: dict) -> None:
    slot = int(tone["slot"])
    if slot not in names:
        raise ValueError(f"{track_id}: no factory preset in slot {slot}")
    if names[slot] != tone["name"]:
        raise ValueError(f"{track_id}: slot {slot} is {names[slot]!r}, not {tone['name']!r}")
    ir = tone.get("ir")
    if ir and not (IRS_DIR / ir).is_file():
        raise ValueError(f"{track_id}: missing IR {ir}")


def _object_end(text: str, open_brace: int) -> int:
    depth = 0
    in_string = False
    escaped = False
    for index in range(open_brace, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    raise ValueError("unclosed tone object")


def _render_tone(tone: dict) -> str:
    rendered = json.dumps(tone, indent=2, ensure_ascii=False)
    return "\n".join(("      " + line) if line else line for line in rendered.splitlines())


def _replace_tone(text: str, track_id: str, tone: dict) -> str:
    key_at = text.find(f'"{track_id}"')
    if key_at < 0:
        raise ValueError(f"{track_id} is missing from riffs.json")
    tone_at = text.find('"tone"', key_at)
    if tone_at < 0:
        raise ValueError(f"{track_id} has no tone object")
    brace = text.find("{", tone_at)
    end = _object_end(text, brace)
    return text[:brace] + _render_tone(tone) + text[end + 1 :]


def merge_catalog() -> tuple[list[str], dict]:
    """Apply TRACK_TONES onto riffs.json. Returns changed ids and the tone dict."""
    tracks = json.loads(TRACKS_PATH.read_text(encoding="utf-8"))["tracks"]
    by_id = {track["id"]: track for track in tracks}
    names = _load_factory()
    missing = [track_id for track_id in TRACK_TONES if track_id not in by_id]
    if missing:
        raise ValueError("tracks.json is missing " + ", ".join(missing))
    classical_ids = [track["id"] for track in tracks if track.get("genre") == "Classical"]
    extra = [track_id for track_id in classical_ids if track_id not in TRACK_TONES]
    if extra:
        raise ValueError("no TRACK_TONES entry for " + ", ".join(extra))

    CLASSICAL_RIFFS = {}
    text = RIFFS_PATH.read_text(encoding="utf-8")
    changed = []
    riffs = json.loads(text)
    for track_id in TRACK_TONES:
        tone = _tone_for(track_id, _bpm_for(by_id[track_id]))
        _check_tone(track_id, tone, names)
        CLASSICAL_RIFFS[track_id] = tone
        current = (riffs["tracks"].get(track_id) or {}).get("tone")
        if current == tone:
            continue
        if track_id not in riffs["tracks"]:
            raise ValueError(f"{track_id} is missing from riffs.json; phrases are not generated here")
        text = _replace_tone(text, track_id, tone)
        changed.append(track_id)
    if changed:
        json.loads(text)
        RIFFS_PATH.write_text(text)
    return changed, CLASSICAL_RIFFS


def main() -> None:
    changed, built = merge_catalog()
    if changed:
        print("updated " + ", ".join(changed))
    else:
        print(f"{len(built)} classical tones already match tracks.json")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"classical_catalog_build: {error}", file=sys.stderr)
        sys.exit(1)
