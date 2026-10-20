#!/usr/bin/env python3
"""Envelope Wah Wah: off is a bypass, a loud note opens the sweep.

Run from the repo root: python3 amp_ui/test_autowah.py
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["AMP_GATE_OFF"] = "1"

from guitar_amp_engine import FastAmp, validate_params  # noqa: E402

RATE = 48000


def _amp(**kwargs):
    defaults = dict(autowah=1.0, aw_mix=1.0, aw_sens=0.7, aw_range=1.0, aw_q=5.0)
    defaults.update(kwargs)
    return FastAmp(RATE, 380.0, 0.0, 0.0, 6.0, 0.35, **defaults)


def _sine(freq, seconds, amp=0.3):
    t = np.arange(int(RATE * seconds), dtype=np.float64) / RATE
    return (amp * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def _ratio(freq, amp):
    engine = _amp()
    x = _sine(freq, 0.25, amp)
    y = engine._apply_autowah(x)
    return float(np.dot(y, y) / np.dot(x, x))


def test_off_is_passthrough():
    engine = _amp(autowah=0.0)
    x = _sine(220.0, 0.05)
    assert np.array_equal(engine._apply_autowah(x), x)


def test_loud_note_opens_the_sweep():
    # A loud note parks the peak near 2.5 kHz. A high note gets through;
    # a low note is cut harder than the same notes played quietly.
    assert _ratio(1800.0, 0.45) > _ratio(1800.0, 0.008) * 2.0
    assert _ratio(140.0, 0.45) < _ratio(140.0, 0.008) * 0.5


def test_state_carries_across_blocks():
    whole = _amp()
    x = _sine(440.0, 0.1, 0.3)
    one = whole._apply_autowah(x)
    chunked_amp = _amp()
    parts = [chunked_amp._apply_autowah(x[i:i + 256]) for i in range(0, x.size, 256)]
    chunked = np.concatenate(parts)
    assert np.allclose(one, chunked, atol=1e-5)


def test_params_round_trip():
    engine = _amp(autowah=0.0)
    engine.apply_params(autowah=1, aw_sens=0.2, aw_range=0.4, aw_q=8, aw_mix=0.5)
    snap = engine.params_snapshot()
    assert snap["autowah"] == 1.0
    assert snap["aw_sens"] == 0.2
    assert snap["aw_range"] == 0.4
    assert snap["aw_q"] == 8.0
    assert snap["aw_mix"] == 0.5
    try:
        validate_params(0.2, 0.2, 0.2, aw_mix=1.5)
    except ValueError as error:
        assert "aw_mix" in str(error)
    else:
        raise AssertionError("aw_mix above 1 was accepted")


def test_render_with_wah_wah_on():
    engine = _amp()
    block = np.zeros((256, 2), dtype=np.float32)
    block[:, 1] = _sine(196.0, 256 / RATE, 0.4)
    out = engine.render(block, 256)
    assert out.shape[0] == 256
    assert np.isfinite(out).all()


def main():
    tests = [
        test_off_is_passthrough,
        test_loud_note_opens_the_sweep,
        test_state_carries_across_blocks,
        test_params_round_trip,
        test_render_with_wah_wah_on,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
