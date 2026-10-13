#!/usr/bin/env python3
"""Every recommended tone in riffs.json loads as a factory preset plus overrides the engine accepts."""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from amp_presets import apply_overrides, engine_params, get_preset  # noqa: E402
from guitar_amp_engine import validate_params  # noqa: E402

RIFFS = REPO / "amp_ui" / "static" / "practice" / "riffs.json"
CHECKED = ("feedback", "mix", "volume", "wah_mix", "wah_q", "wah_freq", "bass", "mid", "treble", "presence", "ir_mix", "low_cut", "high_cut")


def test_every_recommended_tone_loads():
    tracks = json.loads(RIFFS.read_text(encoding="utf-8"))["tracks"]
    for track_id, entry in tracks.items():
        tone = entry["tone"]
        preset = get_preset(slot=tone["slot"])
        if preset["name"] != tone["name"]:
            raise AssertionError(f"{track_id}: slot {tone['slot']} is {preset['name']!r}, not {tone['name']!r}")
        base = engine_params(preset)
        params = apply_overrides(base, tone.get("overrides"), tone.get("ir"))
        validate_params(**{key: params[key] for key in CHECKED if key in params})
        for key, value in (tone.get("overrides") or {}).items():
            if abs(float(params[key]) - float(value)) > 1e-9:
                raise AssertionError(f"{track_id}: {key} not applied")
        if tone.get("ir") and params["ir"] != tone["ir"]:
            raise AssertionError(f"{track_id}: IR not applied")
        if params["volume"] != base["volume"] or params["preset"] != preset["name"]:
            raise AssertionError(f"{track_id}: overrides must not touch volume or the preset name")
    print(f"recommended tones: {len(tracks)} load cleanly")


def test_overrides_are_validated():
    base = engine_params(get_preset(slot=0))
    for bad in ({"volume": 1.0}, {"delay_ms": 5000}, {"feedback": 2}, {"preset": "x"}):
        try:
            apply_overrides(base, bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted bad override {bad}")
    for bad_ir in ("../amp_presets.py", "missing.wav"):
        try:
            apply_overrides(base, {}, bad_ir)
        except ValueError:
            continue
        raise AssertionError(f"accepted bad IR {bad_ir}")
    print("override validation: OK")


def main():
    test_every_recommended_tone_loads()
    test_overrides_are_validated()
    print("All verify_practice_tones checks passed.")


if __name__ == "__main__":
    main()
