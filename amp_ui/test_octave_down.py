#!/usr/bin/env python3
"""Down-Octave (Bass Mode): sub-octave divider, tuner shift and take capture.

Run from the repo root: python3 amp_ui/test_octave_down.py
"""

import io
import os
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["AMP_GATE_OFF"] = "1"

from guitar_amp_engine import FastAmp  # noqa: E402

RATE = 48000


def _amp(octave_down=0.0):
    return FastAmp(RATE, 380.0, 0.0, 0.0, 6.0, 0.35, octave_down=octave_down)


def _sine(freq, seconds, amp=0.3):
    t = np.arange(int(RATE * seconds), dtype=np.float64) / RATE
    return (amp * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def _band_energy(signal, lo, hi):
    spectrum = np.abs(np.fft.rfft(signal * np.hanning(signal.size)))
    freqs = np.fft.rfftfreq(signal.size, 1.0 / RATE)
    return float(np.sum(spectrum[(freqs >= lo) & (freqs <= hi)] ** 2))


def test_off_is_bit_exact_passthrough():
    amp = _amp(0.0)
    x = _sine(110.0, 0.1)
    assert np.array_equal(amp._apply_octave_down(x), x)


def test_low_e_drops_one_octave():
    # Open low E (82.4 Hz) with Down-Octave on should grow a strong 41.2 Hz sub.
    amp = _amp(1.0)
    x = _sine(82.41, 1.0)
    y = np.concatenate([amp._apply_octave_down(x[i:i + 256]) for i in range(0, x.size, 256)])
    y = y[RATE // 4:]  # skip the filter settling
    sub = _band_energy(y, 36.0, 46.0)
    dry_sub = _band_energy(x[RATE // 4:], 36.0, 46.0)
    fundamental = _band_energy(y, 78.0, 87.0)
    assert sub > 50.0 * max(dry_sub, 1e-9), (sub, dry_sub)
    assert sub > fundamental, (sub, fundamental)
    assert np.all(np.isfinite(y))


def test_state_carries_across_blocks():
    whole = _amp(1.0)._apply_octave_down(_sine(98.0, 0.2))
    amp = _amp(1.0)
    x = _sine(98.0, 0.2)
    chunked = np.concatenate([amp._apply_octave_down(x[i:i + 128]) for i in range(0, x.size, 128)])
    assert np.allclose(whole, chunked, atol=1e-5)


def _tuner_after(amp, freq):
    x = _sine(freq, 0.5)
    for i in range(0, x.size, 256):
        amp._push_tuner(x[i:i + 256])
    return amp.tuner


def test_tuner_reads_an_octave_down_in_bass_mode():
    # Open A string (110 Hz): guitar mode reads A2, Bass Mode scores it as A1 like a real bass.
    normal = _tuner_after(_amp(0.0), 110.0)
    bass = _tuner_after(_amp(1.0), 110.0)
    assert normal.get("midi") == 45, normal
    assert bass.get("midi") == 33, bass
    assert bass.get("octave_shifted") is True


def test_take_capture_writes_a_wav():
    amp = _amp(0.0)
    amp.start_recording("rhythm")
    for _ in range(4):
        block = np.zeros((256, 2), dtype=np.float32)
        block[:, 1] = _sine(110.0, 256 / RATE)
        amp.render(block, 256)
    data, seconds, part = amp.stop_recording()
    assert part == "rhythm"
    assert abs(seconds - 1024 / RATE) < 0.01
    with wave.open(io.BytesIO(data), "rb") as wf:
        assert wf.getframerate() == RATE
        assert wf.getnframes() == 1024


def main():
    tests = [
        test_off_is_bit_exact_passthrough,
        test_low_e_drops_one_octave,
        test_state_carries_across_blocks,
        test_tuner_reads_an_octave_down_in_bass_mode,
        test_take_capture_writes_a_wav,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
