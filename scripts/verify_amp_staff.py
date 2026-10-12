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


def _plucked(hz, rate, seconds=0.35):
    t = np.arange(int(rate * seconds), dtype=np.float64) / rate
    partials = ((1, 1.0), (2, 0.8), (3, 0.55), (4, 0.35), (5, 0.2))
    tone = sum(amp * np.sin(2.0 * np.pi * hz * k * t) for k, amp in partials)
    return (0.1 * tone * np.exp(-t * 3.0)).astype(np.float32)


def test_estimate_pitch_whole_neck_with_harmonics():
    rate = 48000
    for midi in (40, 45, 50, 55, 59, 64, 69, 72, 76, 81, 84):
        hz = 440.0 * 2.0 ** ((midi - 69) / 12.0)
        found = estimate_pitch(_plucked(hz, rate), rate)
        if not found or found["midi"] != midi:
            got = found and found["midi"]
            raise AssertionError(f"midi {midi} ({hz:.1f} Hz) read as {got}")
    print("estimate_pitch E2..C6 with harmonics: OK")


def main():
    test_staff_from_tuner_guitar_range()
    test_estimate_pitch_puts_a4_on_staff()
    test_estimate_pitch_whole_neck_with_harmonics()
    print("All verify_amp_staff checks passed.")


if __name__ == "__main__":
    main()
