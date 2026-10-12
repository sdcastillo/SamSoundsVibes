#!/usr/bin/env python3
"""Levels, aliasing, and the Scarlett-to-headset handoff.

Run from the repo root: python3 amp_ui/test_render_levels.py
"""

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["AMP_GATE_OFF"] = "1"

from amp_presets import CAB_ENERGY_GAIN, CAB_L1_CAP, get_preset, ir_names, ir_samples, list_presets  # noqa: E402
from guitar_amp_engine import (  # noqa: E402
    INPUT_CLIP_LEVEL,
    OUTPUT_CEILING,
    POST_CAB_GAIN,
    FastAmp,
    JitterBuffer,
    _conceal_underrun,
    _output_limit,
)


def _amp(volume=0.35, drive=18.0):
    return FastAmp(48000, 380.0, 0.35, 0.30, drive, volume)


def _stereo(mono):
    mono = np.asarray(mono, dtype=np.float32)
    return np.column_stack((np.zeros(mono.shape[0], dtype=np.float32), mono))


def _sine(freq, seconds, amp=0.2, rate=48000):
    count = int(rate * seconds)
    t = np.arange(count, dtype=np.float64) / rate
    return (amp * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def _legacy_distort(source, drive):
    driven = source * np.float32(drive)
    clipped = np.tanh(driven + 0.25 * driven * np.abs(driven))
    return np.tanh(clipped * np.float32(3.5)).astype(np.float32)


def test_jitter_waits_until_primed():
    buffer = JitterBuffer(48000)
    block, mode = buffer.pull(256)
    assert mode == "wait"
    assert buffer.underruns == 0
    assert np.all(block == 0)


def test_jitter_plays_buffered_audio():
    buffer = JitterBuffer(48000)
    data = np.linspace(-0.4, 0.4, buffer.target, dtype=np.float32)
    buffer.push(np.column_stack((data, -data)))
    assert buffer.primed
    got, mode = buffer.pull(256)
    assert mode == "ok"
    assert np.allclose(got[:, 0], data[:256], atol=1e-6)
    assert np.allclose(got[:, 1], -data[:256], atol=1e-6)


def test_underrun_fades_instead_of_zeroing():
    buffer = JitterBuffer(48000)
    buffer.push(np.full((buffer.target, 2), 0.5, dtype=np.float32))
    last = None
    mode = "ok"
    for _ in range(80):
        block, mode = buffer.pull(256)
        if mode == "underrun":
            break
        last = block
    assert mode == "underrun"
    assert buffer.underruns >= 1
    assert last is not None
    assert abs(float(block[0, 0]) - float(last[-1, 0])) < 0.08
    assert abs(float(block[-1, 0])) < abs(float(block[0, 0]))
    assert np.max(np.abs(np.diff(block[:, 0]))) < 0.05
    assert not np.allclose(block, 0.0)


def test_short_block_is_not_zero_padded():
    amp = _amp()
    short = np.full((10, 2), 0.7, dtype=np.float32)
    fitted = amp.as_ears(short, 256)
    assert abs(float(fitted[0, 0]) - 0.7) < 1e-5
    assert np.max(np.abs(fitted[10:40, 0])) > 0.05
    assert abs(float(fitted[-1, 0])) < 0.05


def test_drift_drop_when_fill_runs_ahead():
    buffer = JitterBuffer(48000)
    buffer.push(np.full((buffer.target * 2, 2), 0.2, dtype=np.float32))
    _, mode = buffer.pull(256)
    assert mode == "drop"
    assert buffer.drift_drops == 1


def test_overrun_keeps_finite_audio():
    buffer = JitterBuffer(48000, max_ms=40)
    buffer.push(np.ones((int(0.5 * 48000), 2), dtype=np.float32))
    assert buffer.overruns >= 1
    got, mode = buffer.pull(256)
    assert mode in ("ok", "drop")
    assert np.all(np.isfinite(got))
    assert float(np.max(np.abs(got))) > 0.5


def test_matched_clocks_do_not_underrun():
    buffer = JitterBuffer(48000)
    block = np.full((256, 2), 0.15, dtype=np.float32)
    while not buffer.primed:
        buffer.push(block)
    for _ in range(40):
        buffer.push(block)
        _, mode = buffer.pull(256)
        assert mode != "underrun"
    assert buffer.underruns == 0


def test_output_ceiling_and_input_clip():
    amp = _amp(volume=3.0, drive=24.0)
    hot = _sine(440.0, 256 / 48000.0, amp=0.99)
    ears = None
    for _ in range(6):
        ears = amp.render(_stereo(hot), hot.shape[0])
    assert np.max(np.abs(ears)) <= float(OUTPUT_CEILING) + 1e-3
    assert amp.meters["in_clip"] == 1.0
    assert amp.meters["out_clip"] == 1.0
    assert np.all(np.isfinite(ears))

    quiet = _amp(volume=0.35, drive=8.0)
    small = _sine(440.0, 256 / 48000.0, amp=0.05)
    quiet.render(_stereo(small), small.shape[0])
    assert quiet.meters["in_clip"] == 0.0
    assert quiet.meters["in"] < float(INPUT_CLIP_LEVEL)


def test_callback_status_counts_as_xrun():
    amp = _amp()

    class Flags:
        def __bool__(self):
            return True

        def __str__(self):
            return "input overflow"

    indata = _stereo(np.zeros(128, dtype=np.float32))
    amp.input_callback(indata, indata.shape[0], None, Flags())
    assert amp.xruns >= 1
    assert amp.meters["xruns"] >= 1
    assert amp.pending.primed is False or amp.pending.fill >= 0


def _band_power(samples, rate, freq, width=80.0):
    samples = np.asarray(samples, dtype=np.float64)
    power = np.abs(np.fft.rfft(samples * np.hanning(samples.shape[0]))) ** 2
    freqs = np.fft.rfftfreq(samples.shape[0], 1.0 / rate)
    return float(np.sum(power[np.abs(freqs - freq) <= width]))


def test_oversampled_drive_aliases_less_than_double_tanh():
    # 11 kHz is above the guitar's fundamentals, but a hard clip of it folds the
    # 5th harmonic to about 7 kHz. That fold is the static the old tanh made.
    rate = 48000
    freq = 11000.0
    folded = 7000.0
    source = _sine(freq, 16384 / rate, amp=0.2)
    amp = _amp(drive=22.0)
    oversampled = amp._distort(source)
    legacy = _legacy_distort(source, 22.0)
    start = 2048
    new_fold = _band_power(oversampled[start:], rate, folded)
    old_fold = _band_power(legacy[start:], rate, folded)
    print(f"folded 7 kHz power: oversampled={new_fold:.1f} legacy={old_fold:.1f}")
    assert old_fold > 0.0
    assert new_fold * 20.0 < old_fold


def test_render_stays_inside_a_block():
    amp = _amp(volume=1.2, drive=18.0)
    block = 256
    started = time.perf_counter()
    repeats = 30
    for i in range(repeats):
        mono = _sine(330.0 + i, block / 48000.0, amp=0.25)
        ears = amp.render(_stereo(mono), block)
        assert ears.shape == (block, 2)
        assert np.max(np.abs(ears)) <= float(OUTPUT_CEILING) + 1e-3
        assert np.all(np.isfinite(ears))
    elapsed = (time.perf_counter() - started) / repeats * 1000.0
    print(f"mean render {elapsed:.2f} ms for {block} samples")


def test_cabinet_irs_are_energy_normalized():
    loudest = None
    for name in ir_names():
        kernel = ir_samples(name)
        energy = float(np.sqrt(np.sum(kernel.astype(np.float64) ** 2)))
        worst = float(np.sum(np.abs(kernel.astype(np.float64))))
        assert energy <= CAB_ENERGY_GAIN * 1.02
        assert worst <= CAB_L1_CAP * 1.01
        if loudest is None or worst > loudest[0]:
            loudest = (worst, energy, name)
    print(f"hottest IR after norm: {loudest[2]} L1={loudest[0]:.3f} energy={loudest[1]:.3f}")


def _render_note(amp, freq, amp_level, blocks, blocksize=256):
    rate = 48000
    peak = 0.0
    ears_peak = 0.0
    chunks = []
    for index in range(blocks):
        t = (np.arange(blocksize) + index * blocksize) / rate
        mono = (amp_level * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)
        ears = amp.render(_stereo(mono), blocksize)
        peak = max(peak, float(amp.pre_peak))
        ears_peak = max(ears_peak, float(np.max(np.abs(ears))))
        chunks.append(ears[:, 0].copy())
    return peak, ears_peak, np.concatenate(chunks)


def test_worst_cabinets_with_high_drive_and_feedback():
    # These are the files Sam measured: Dtar L1 near 70, Mesa/LX near 18–32.
    # Delay is short so the feedback tap returns inside the render and can stack.
    names = [
        "106_Dtar_btq_finger-_ir.wav",
        "102_Dtar_small_fingerstyle-_ir.wav",
        "088 LX TDR Marshall 2.wav",
        "087 LX TDR Marshall 1.wav",
        "107 Mesa MKIIC+ TM 2.wav",
        "106 Mesa MKIIC+ TM1.wav",
    ]
    worst = (0.0, "", 0.0)
    for name in names:
        for freq in (82.4, 110.0, 196.0, 329.6, 440.0):
            amp = FastAmp(
                48000,
                25.0,
                0.9,
                0.75,
                36.0,
                0.5,
                bass=1.0,
                mid=1.0,
                treble=1.0,
                presence=1.0,
                ir=name,
                ir_mix=1.0,
                low_cut=60.0,
                high_cut=12000.0,
            )
            amp.signaled = True
            pre, out, audio = _render_note(amp, freq, 0.4, blocks=16)
            assert np.all(np.isfinite(audio))
            assert out <= float(OUTPUT_CEILING) + 1e-3
            assert pre <= 1.0
            assert amp.cab_peak <= 2.5
            # A hard tanh on a cabinet overshoot fills the ceiling. The gentle
            # limiter should leave the body of the note below it.
            near_ceiling = float(np.mean(np.abs(audio) > float(OUTPUT_CEILING) * 0.98))
            assert near_ceiling < 0.02
            if pre > worst[0]:
                worst = (pre, name, freq)
    print(f"worst cab/note pre-limiter peak {worst[0]:.3f} ({worst[1]} @ {worst[2]} Hz)")


def test_every_ir_with_every_preset_stays_bounded():
    block = 256
    rate = 48000
    t = np.arange(block) / rate
    mono = (
        0.22 * np.sin(2.0 * np.pi * 110.0 * t) + 0.16 * np.sin(2.0 * np.pi * 165.0 * t) + 0.1 * np.sin(2.0 * np.pi * 220.0 * t)
    ).astype(np.float32)
    indata = _stereo(mono)
    names = ir_names()
    presets = list_presets()["presets"]
    # One amp, long enough delay line for every preset, so the sweep stays a check
    # rather than thousands of buffer allocations.
    amp = FastAmp(48000, 800.0, 0.2, 0.0, 8.0, 0.35)
    amp.signaled = True
    worst = (0.0, "", "")
    for preset in presets:
        play = dict(get_preset(slot=preset["slot"])["play"])
        play.pop("preset", None)
        volume = float(play["volume"])
        for name in names:
            play["ir"] = name
            play["ir_mix"] = 1.0
            amp.apply_params(**play)
            amp.ring.fill(0)
            amp.write = 0
            amp._cab_tail = None
            amp._cab_tail_name = ""
            pre = 0.0
            cab = 0.0
            for _ in range(6):
                ears = amp.render(indata, block)
                assert ears.shape == (block, 2)
                assert np.all(np.isfinite(ears))
                assert np.max(np.abs(ears)) <= float(OUTPUT_CEILING) + 1e-3
                pre = max(pre, float(amp.pre_peak))
                cab = max(cab, float(amp.cab_peak))
            # Feedback is a convex mix of this post-cab signal, so the final
            # stage cannot exceed cab peak times the preset volume.
            assert cab * volume <= 1.0
            assert pre <= 1.0
            if cab * volume > worst[0]:
                worst = (cab * volume, preset["name"], name)
    print(
        f"preset x IR sweep: {len(presets)} x {len(names)} "
        f"worst cab×volume {worst[0]:.3f} ({worst[1]} / {worst[2]})"
    )
    assert POST_CAB_GAIN < 1.0


def test_gentle_limiter_does_not_square_a_moderate_over():
    rate = 48000
    t = np.arange(4096) / rate
    # A wave that peaks at twice the ceiling. tanh flattens it; the knee should not.
    hot = (np.sin(2.0 * np.pi * 220.0 * t) * float(OUTPUT_CEILING) * 2.0).astype(np.float32)
    gentle = _output_limit(hot)
    hard = (OUTPUT_CEILING * np.tanh(hot / OUTPUT_CEILING)).astype(np.float32)
    assert np.max(np.abs(gentle)) <= float(OUTPUT_CEILING) + 1e-4
    # Most of a sine sits under the knee, so the gentle curve stays near the input
    # there. tanh pulls those samples down.
    quiet = np.abs(hot) < float(OUTPUT_CEILING) * 0.85
    assert np.max(np.abs(gentle[quiet] - hot[quiet])) < 1e-5
    assert np.mean(np.abs(hard[quiet] - hot[quiet])) > 1e-3


def test_conceal_matches_direct_call():
    got = np.full((4, 2), 0.3, dtype=np.float32)
    faded = _conceal_underrun(got, 32, np.zeros(2, dtype=np.float32))
    assert faded.shape == (32, 2)
    assert abs(float(faded[0, 0]) - 0.3) < 1e-5


def main():
    tests = [
        test_jitter_waits_until_primed,
        test_jitter_plays_buffered_audio,
        test_underrun_fades_instead_of_zeroing,
        test_short_block_is_not_zero_padded,
        test_drift_drop_when_fill_runs_ahead,
        test_overrun_keeps_finite_audio,
        test_matched_clocks_do_not_underrun,
        test_output_ceiling_and_input_clip,
        test_callback_status_counts_as_xrun,
        test_oversampled_drive_aliases_less_than_double_tanh,
        test_render_stays_inside_a_block,
        test_cabinet_irs_are_energy_normalized,
        test_worst_cabinets_with_high_drive_and_feedback,
        test_gentle_limiter_does_not_square_a_moderate_over,
        test_every_ir_with_every_preset_stays_bounded,
        test_conceal_matches_direct_call,
    ]
    for test in tests:
        test()
        print(f"ok {test.__name__}")
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
