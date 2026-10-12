#!/usr/bin/env python3
"""Staff mapping from the tuner note (no audio hardware required beyond PortAudio import)."""

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from guitar_amp_engine import estimate_pitch, staff_from_tuner  # noqa: E402


def test_staff_from_tuner_guitar_range():
    cases = {
        ("E", 2): {"step": -12, "clef": "bass", "accidental": ""},
        ("A", 2): {"step": -9, "clef": "bass", "accidental": ""},
        ("C", 4): {"step": 0, "clef": "treble", "accidental": ""},
        ("E", 4): {"step": 2, "clef": "treble", "accidental": ""},
        ("F#", 4): {"step": 3, "clef": "treble", "accidental": "#"},
        ("A", 4): {"step": 5, "clef": "treble", "accidental": ""},
        ("C", 5): {"step": 7, "clef": "treble", "accidental": ""},
    }
    for (note, octave), expect in cases.items():
        got = staff_from_tuner(note, octave)
        for key, value in expect.items():
            if got[key] != value:
                raise AssertionError(f"{note}{octave} {key}={got[key]!r} expected {value!r}")
    print("staff_from_tuner guitar range: OK")


def test_estimate_pitch_puts_a4_on_staff():
    rate = 48000
    t = np.arange(int(rate * 0.35), dtype=np.float32) / np.float32(rate)
    tone = (np.float32(0.12) * np.sin(np.float32(2.0 * np.pi * 440.0) * t)).astype(np.float32)
    found = estimate_pitch(tone, rate)
    if not found or not found.get("active"):
        raise AssertionError("A4 sine should be a clear pitch")
    if found["note"] != "A" or found["octave"] != 4:
        raise AssertionError(f"expected A4, got {found['note']}{found['octave']}")
    staff = found.get("staff") or {}
    if staff.get("step") != 5 or staff.get("clef") != "treble":
        raise AssertionError(f"A4 staff should be treble step 5, got {staff}")
    print("estimate_pitch A4 → staff: OK")


def main():
    test_staff_from_tuner_guitar_range()
    test_estimate_pitch_puts_a4_on_staff()
    print("All verify_amp_staff checks passed.")


if __name__ == "__main__":
    main()
