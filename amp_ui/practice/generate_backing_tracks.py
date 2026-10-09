#!/usr/bin/env python3
"""Synthesize the Practice-mode starter loops (drums, bass, and chords).

The WAV files are original. They are not recordings or arrangements of
copyrighted songs. The generator dedicates them to the public domain under CC0.

Rebuild after editing bpm, feel, or progression in
amp_ui/static/practice/tracks.json:

    python3 amp_ui/practice/generate_backing_tracks.py
"""

from __future__ import annotations

import json
import math
import re
import wave
from pathlib import Path

import numpy as np

SR = 44100
SR_LO = 22050
ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "static" / "practice" / "tracks.json"
AUDIO_DIR = ROOT / "static" / "practice" / "audio"

_NOTE_PC = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}

# Longest quality names first so "m7" is not read as "m".
_QUALITIES = (
    ("maj7", (0, 4, 7, 11)),
    ("m7", (0, 3, 7, 10)),
    ("min7", (0, 3, 7, 10)),
    ("m9", (0, 3, 7, 10, 14)),
    ("maj", (0, 4, 7)),
    ("min", (0, 3, 7)),
    ("sus4", (0, 5, 7)),
    ("dim", (0, 3, 6)),
    ("aug", (0, 4, 8)),
    ("m", (0, 3, 7)),
    ("9", (0, 4, 7, 10, 14)),
    ("7", (0, 4, 7, 10)),
    ("5", (0, 7)),
    ("", (0, 4, 7)),
)


def parse_chord(symbol: str) -> tuple[int, tuple[int, ...]]:
    """Return (root pitch class, semitone intervals from the root)."""
    match = re.match(r"^([A-G](?:#|b)?)(.*)$", symbol.strip())
    if not match or match.group(1) not in _NOTE_PC:
        raise ValueError(f"Cannot read chord {symbol!r}")
    root = _NOTE_PC[match.group(1)]
    quality = match.group(2).strip()
    for name, intervals in _QUALITIES:
        if quality == name:
            return root, intervals
    raise ValueError(f"Unknown chord quality in {symbol!r}")


def note_pc(name: str) -> int:
    if name not in _NOTE_PC:
        raise ValueError(f"Unknown note {name!r}")
    return _NOTE_PC[name]


def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def chord_freqs(symbol: str, low_midi: int = 57) -> list[float]:
    root, intervals = parse_chord(symbol)
    midis = []
    for interval in intervals:
        pc = (root + interval) % 12
        midis.append(low_midi + (pc - (low_midi % 12)) % 12)
    return [midi_to_hz(midi) for midi in sorted(set(midis))]


def _seed(track_id: str) -> int:
    acc = 2166136261
    for char in track_id:
        acc ^= ord(char)
        acc = (acc * 16777619) & 0xFFFFFFFF
    return acc


def _adsr(n: int, attack: float, release: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    env = 1.0 - np.exp(-t / max(attack, 1e-4))
    env *= np.exp(-t * decay)
    rel = min(n, max(1, int(release * SR)))
    env[-rel:] *= np.linspace(1.0, 0.0, rel, endpoint=False)
    return env


def synth_kick(rng: np.random.Generator, dur: float = 0.2) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = 46.0 + 140.0 * np.exp(-t * 28.0)
    phase = 2.0 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t * 9.0)
    click = rng.uniform(-1.0, 1.0, n) * np.exp(-t * 95.0) * 0.18
    return body + click


def synth_snare(rng: np.random.Generator, dur: float = 0.18) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1.0, 1.0, n)
    high = np.diff(noise, prepend=noise[0])
    tone = np.sin(2.0 * np.pi * 196.0 * t) * np.exp(-t * 24.0)
    return (high * 0.85 + tone * 0.55) * np.exp(-t * 16.0)


def synth_hat(rng: np.random.Generator, open_hat: bool = False) -> np.ndarray:
    dur = 0.11 if open_hat else 0.04
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.uniform(-1.0, 1.0, n)
    high = np.diff(noise, prepend=noise[0])
    metal = np.sin(2.0 * np.pi * 5400.0 * t) * 0.12 + np.sin(2.0 * np.pi * 7900.0 * t) * 0.08
    decay = 22.0 if open_hat else 78.0
    return (high * 0.75 + metal) * np.exp(-t * decay)


def synth_bass(freq: float, dur: float) -> np.ndarray:
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    glide = freq * (1.0 + 0.05 * np.exp(-t * 35.0))
    phase = 2.0 * np.pi * np.cumsum(glide) / SR
    body = np.sin(phase) + 0.16 * np.sin(2.0 * phase) + 0.05 * np.sin(3.0 * phase)
    return body * _adsr(n, 0.006, 0.03, 1.4 / max(dur, 0.15))


def synth_chord(freqs: list[float], dur: float, stab: bool) -> np.ndarray:
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    voice = np.zeros(n)
    count = max(1, len(freqs))
    for index, freq in enumerate(freqs):
        detune = 1.0 + (index - (count - 1) / 2.0) * 0.0016
        voice += np.sin(2.0 * np.pi * freq * detune * t) / count
        voice += 0.14 * np.sin(2.0 * np.pi * freq * 2.0 * detune * t) / count
    attack = 0.006 if stab else 0.03
    decay = 3.2 if stab else 0.35
    return voice * _adsr(n, attack, 0.07, decay)


def _pan(pan: float) -> tuple[float, float]:
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * (math.pi / 4.0)
    return math.cos(angle), math.sin(angle)


def place(mix: np.ndarray, sig: np.ndarray, start: int, pan: float = 0.0, gain: float = 1.0) -> None:
    start = int(start)
    if start >= len(mix) or gain == 0.0:
        return
    if start < 0:
        sig = sig[-start:]
        start = 0
    n = min(len(sig), len(mix) - start)
    if n <= 0:
        return
    left, right = _pan(pan)
    mix[start : start + n, 0] += sig[:n] * left * gain
    mix[start : start + n, 1] += sig[:n] * right * gain


def _at(bar: int, beat: float, bar_samples: int, beat_samples: float) -> int:
    return int(round(bar * bar_samples + beat * beat_samples))


def _add_kit(mix, rng, bars, bar_samples, beat_samples, feel: str) -> None:
    kick = synth_kick(rng)
    snare = synth_snare(rng)
    hat = synth_hat(rng, False)
    open_hat = synth_hat(rng, True)
    for bar in range(bars):
        if feel == "shuffle":
            for beat in range(4):
                base = _at(bar, beat, bar_samples, beat_samples)
                trip = beat_samples / 3.0
                place(mix, hat, base, pan=0.35, gain=0.20)
                place(mix, hat, base + 2.0 * trip, pan=0.4, gain=0.14)
            place(mix, kick, _at(bar, 0, bar_samples, beat_samples), gain=0.9)
            place(mix, kick, _at(bar, 2, bar_samples, beat_samples), gain=0.72)
            place(mix, snare, _at(bar, 1, bar_samples, beat_samples), pan=0.04, gain=0.52)
            place(mix, snare, _at(bar, 3, bar_samples, beat_samples), pan=0.04, gain=0.52)
        elif feel == "funk":
            for step in range(16):
                accent = 1.0 if step % 4 == 0 else (0.5 if step % 2 == 0 else 0.26)
                place(mix, hat, _at(bar, step / 4.0, bar_samples, beat_samples), pan=0.4, gain=0.16 * accent)
            for step, gain in ((0, 0.88), (6, 0.7), (10, 0.62)):
                place(mix, kick, _at(bar, step / 4.0, bar_samples, beat_samples), gain=gain)
            place(mix, snare, _at(bar, 1.0, bar_samples, beat_samples), pan=0.05, gain=0.5)
            place(mix, snare, _at(bar, 3.0, bar_samples, beat_samples), pan=0.05, gain=0.5)
            place(mix, snare, _at(bar, 3.5, bar_samples, beat_samples), pan=0.08, gain=0.16)
        else:
            hat_gain = 0.12 if feel == "pop" else 0.18
            for eighth in range(8):
                accent = 1.0 if eighth % 2 == 0 else 0.62
                place(
                    mix,
                    hat,
                    _at(bar, eighth / 2.0, bar_samples, beat_samples),
                    pan=0.38,
                    gain=hat_gain * accent,
                )
            place(mix, kick, _at(bar, 0, bar_samples, beat_samples), gain=0.82)
            place(mix, kick, _at(bar, 2, bar_samples, beat_samples), gain=0.66)
            if feel == "rock" and bar % 2 == 1:
                place(mix, kick, _at(bar, 1.5, bar_samples, beat_samples), gain=0.48)
            place(mix, snare, _at(bar, 1, bar_samples, beat_samples), pan=0.04, gain=0.48)
            place(mix, snare, _at(bar, 3, bar_samples, beat_samples), pan=0.04, gain=0.48)
            place(mix, open_hat, _at(bar, 3.5, bar_samples, beat_samples), pan=0.32, gain=0.12)


def _bass_intervals(symbol: str, bar_index: int) -> list[int]:
    _root, intervals = parse_chord(symbol)
    minor = 3 in intervals and 4 not in intervals
    dominant = 10 in intervals and 4 in intervals
    if minor:
        patterns = ([0, 7, 0, 10], [0, 0, 3, 7], [0, 10, 7, 3], [0, 3, 7, 0])
    elif dominant:
        patterns = ([0, 4, 7, 10], [0, 0, 10, 7], [0, 7, 4, 10], [0, 4, 0, 7])
    else:
        patterns = ([0, 7, 0, 4], [0, 0, 7, 4], [0, 4, 7, 0], [0, 7, 4, 7])
    return list(patterns[bar_index % len(patterns)])


def _add_bass(mix, bars, progression, bar_samples, beat_samples, feel: str) -> None:
    for bar, symbol in enumerate(progression):
        root, intervals = parse_chord(symbol)
        if feel == "funk":
            minor = 3 in intervals and 4 not in intervals
            pattern = (
                {0: 0, 3: 0, 6: 3, 8: 7, 10: 7, 13: 10, 14: 10}
                if minor
                else {0: 0, 3: 0, 6: 4, 8: 7, 11: 10, 14: 10}
            )
            steps = sorted(pattern)
            for index, step in enumerate(steps):
                nxt = steps[index + 1] if index + 1 < len(steps) else 16
                dur_beats = max(0.12, (nxt - step) / 4.0 * 0.86)
                midi = 36 + ((root + pattern[step]) % 12)
                if midi < 38:
                    midi += 12
                sig = synth_bass(midi_to_hz(midi), dur_beats * beat_samples / SR)
                place(mix, sig, _at(bar, step / 4.0, bar_samples, beat_samples), gain=0.58)
            continue
        pattern = _bass_intervals(symbol, bar)
        for beat, interval in enumerate(pattern):
            midi = 36 + ((root + interval) % 12)
            if midi < 38:
                midi += 12
            sig = synth_bass(midi_to_hz(midi), beat_samples / SR * 0.9)
            place(mix, sig, _at(bar, beat, bar_samples, beat_samples), gain=0.6)


def _add_chords(mix, progression, bar_samples, beat_samples, feel: str) -> None:
    for bar, symbol in enumerate(progression):
        freqs = chord_freqs(symbol)
        if feel == "funk":
            pad = synth_chord(freqs, (bar_samples / SR) * 0.92, stab=False)
            place(mix, pad, _at(bar, 0, bar_samples, beat_samples), pan=-0.15, gain=0.16)
            for beat in (0.0, 2.0):
                stab = synth_chord(freqs, 0.14, stab=True)
                place(mix, stab, _at(bar, beat, bar_samples, beat_samples), pan=0.2, gain=0.34)
            continue
        pad = synth_chord(freqs, (bar_samples / SR) * 0.94, stab=False)
        origin = _at(bar, 0, bar_samples, beat_samples)
        place(mix, pad, origin, pan=-0.18, gain=0.30 if feel == "shuffle" else 0.26)
        place(mix, pad, origin + int(0.012 * SR), pan=0.22, gain=0.22)
        if feel in ("rock", "pop"):
            for beat in (0.0, 2.0):
                stab = synth_chord(freqs, beat_samples / SR * 0.42, stab=True)
                place(mix, stab, _at(bar, beat, bar_samples, beat_samples), pan=0.1, gain=0.22)


def place_mono(mix: np.ndarray, sig: np.ndarray, start: int, gain: float = 1.0) -> None:
    start = int(start)
    if start >= len(mix) or gain == 0.0 or len(sig) == 0:
        return
    if start < 0:
        sig = sig[-start:]
        start = 0
    n = min(len(sig), len(mix) - start)
    if n <= 0:
        return
    mix[start : start + n] += sig[:n] * gain


def _timeline(bpm: float, bars: int, sr: int) -> tuple[int, float, int]:
    bar_samples = int(round(4.0 * 60.0 / bpm * sr))
    return bar_samples, bar_samples / 4.0, bar_samples * bars


def _harmonics(freq: float, n: int, sr: int, partials: tuple[tuple[int, float], ...]) -> np.ndarray:
    t = np.arange(n) / sr
    sig = np.zeros(n)
    for harmonic, gain in partials:
        sig += gain * np.sin(2.0 * np.pi * freq * harmonic * t)
    return sig


def _exp_env(n: int, sr: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / sr
    return (1.0 - np.exp(-t / max(attack, 1e-4))) * np.exp(-t * decay)


def _kick_lo(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(0.2 * sr)
    t = np.arange(n) / sr
    freq = 48.0 + 125.0 * np.exp(-t * 26.0)
    phase = 2.0 * np.pi * np.cumsum(freq) / sr
    click = rng.uniform(-1.0, 1.0, n) * np.exp(-t * 85.0) * 0.16
    return np.sin(phase) * np.exp(-t * 8.0) + click


def _noise_hit(sr: int, rng: np.random.Generator, dur: float, decay: float) -> np.ndarray:
    n = max(1, int(dur * sr))
    t = np.arange(n) / sr
    noise = rng.uniform(-1.0, 1.0, n)
    high = np.diff(noise, prepend=noise[0])
    return high * np.exp(-t * decay)


def _clap_lo(sr: int, rng: np.random.Generator) -> np.ndarray:
    n = int(0.12 * sr)
    t = np.arange(n) / sr
    noise = rng.uniform(-1.0, 1.0, n)
    env = np.zeros(n)
    for offset, gain in ((0.0, 1.0), (0.011, 0.7), (0.022, 0.45)):
        env += gain * np.exp(-np.maximum(0.0, t - offset) * 36.0)
    return noise * env


def _chord_midis(symbol: str, low: int) -> list[int]:
    root, intervals = parse_chord(symbol)
    midis = []
    for interval in intervals:
        pc = (root + interval) % 12
        midis.append(low + (pc - (low % 12)) % 12)
    return sorted(set(midis))


def _root_midi(symbol: str, low: int) -> int:
    root, _intervals = parse_chord(symbol)
    return low + (root - (low % 12)) % 12


def _finish_mono(mix: np.ndarray, sr: int, fade_in: float, fade_out: float) -> np.ndarray:
    peak = float(np.max(np.abs(mix))) if mix.size else 1.0
    out = mix * (0.89 / peak) if peak > 1e-8 else mix.copy()
    n_in = min(len(out), max(1, int(fade_in * sr)))
    n_out = min(len(out), max(1, int(fade_out * sr)))
    out[:n_in] *= np.linspace(0.0, 1.0, n_in)
    out[-n_out:] *= np.linspace(1.0, 0.0, n_out)
    return out


def _render_house(track: dict, sr: int, rng: np.random.Generator) -> np.ndarray:
    progression = list(track["progression"])
    bar_samples, beat, total = _timeline(float(track["bpm"]), len(progression), sr)
    mix = np.zeros(total)
    kick = _kick_lo(sr, rng)
    hat = _noise_hit(sr, rng, 0.035, 90.0)
    open_hat = _noise_hit(sr, rng, 0.11, 18.0)
    clap = _clap_lo(sr, rng)
    for bar, symbol in enumerate(progression):
        for step in range(4):
            place_mono(mix, kick, _at(bar, step, bar_samples, beat), 0.95)
            place_mono(mix, open_hat, _at(bar, step + 0.5, bar_samples, beat), 0.2)
        for step in range(16):
            place_mono(mix, hat, _at(bar, step / 4.0, bar_samples, beat), 0.06)
        place_mono(mix, clap, _at(bar, 1, bar_samples, beat), 0.38)
        place_mono(mix, clap, _at(bar, 3, bar_samples, beat), 0.38)
        bass_midi = _root_midi(symbol, 36)
        bass_n = max(1, int(beat * 0.4))
        bass = _harmonics(midi_to_hz(bass_midi), bass_n, sr, ((1, 1.0), (2, 0.4), (3, 0.12)))
        bass *= _exp_env(bass_n, sr, 0.004, 7.0)
        for step in range(4):
            place_mono(mix, bass, _at(bar, step + 0.5, bar_samples, beat), 0.72)
        tones = _chord_midis(symbol, 57)
        pad_n = max(1, int(bar_samples * 0.96))
        pad = np.zeros(pad_n)
        for midi in tones:
            pad += _harmonics(midi_to_hz(midi), pad_n, sr, ((1, 0.55), (2, 0.28), (3, 0.12), (4, 0.05)))
        pad /= max(1, len(tones))
        pad *= _exp_env(pad_n, sr, 0.09, 0.45)
        place_mono(mix, pad, _at(bar, 0, bar_samples, beat), 0.34)
        arp_tones = _chord_midis(symbol, 72)
        arp_n = max(1, int(beat * 0.42))
        for step in range(8):
            arp = _harmonics(midi_to_hz(arp_tones[step % len(arp_tones)]), arp_n, sr, ((1, 1.0), (2, 0.18)))
            arp *= np.exp(-np.arange(arp_n) / sr * 12.0)
            place_mono(mix, arp, _at(bar, step / 2.0, bar_samples, beat), 0.14)
    return _finish_mono(mix, sr, 0.004, 0.018)


def _power_chug(symbol: str, n: int, sr: int) -> np.ndarray:
    root, _intervals = parse_chord(symbol)
    t = np.arange(n) / sr
    voice = np.zeros(n)
    for interval in (0, 7):
        midi = 40 + ((root + interval) - 4) % 12
        for octave, level in ((0, 1.0), (12, 0.62)):
            freq = midi_to_hz(midi + octave)
            for harmonic, gain in ((1, 1.0), (2, 0.5), (3, 0.28), (4, 0.12)):
                voice += level * gain * np.sin(2.0 * np.pi * freq * harmonic * t)
    env = np.exp(-t * 12.0) * (1.0 - np.exp(-t / 0.003))
    return np.tanh(voice * 0.22) * env


def _render_hard_rock(track: dict, sr: int, rng: np.random.Generator) -> np.ndarray:
    progression = list(track["progression"])
    bar_samples, beat, total = _timeline(float(track["bpm"]), len(progression), sr)
    mix = np.zeros(total)
    kick = _kick_lo(sr, rng)
    snare = _noise_hit(sr, rng, 0.16, 16.0) + 0.4 * np.sin(
        2.0 * np.pi * 196.0 * np.arange(int(0.16 * sr)) / sr
    ) * np.exp(-np.arange(int(0.16 * sr)) / sr * 20.0)
    hat = _noise_hit(sr, rng, 0.04, 75.0)
    for bar, symbol in enumerate(progression):
        for eighth in range(8):
            accent = 1.0 if eighth % 2 == 0 else 0.58
            chug_n = max(1, int(beat * 0.46))
            place_mono(mix, _power_chug(symbol, chug_n, sr), _at(bar, eighth / 2.0, bar_samples, beat), 0.62 * accent)
            place_mono(mix, hat, _at(bar, eighth / 2.0, bar_samples, beat), 0.1 * accent)
        root_midi = 28 + (parse_chord(symbol)[0] - 4) % 12
        bass_n = max(1, int(beat * 0.42))
        bass = _harmonics(midi_to_hz(root_midi), bass_n, sr, ((1, 1.0), (2, 0.22)))
        bass *= np.exp(-np.arange(bass_n) / sr * 7.0)
        for eighth in range(8):
            place_mono(mix, bass, _at(bar, eighth / 2.0, bar_samples, beat), 0.42 if eighth % 2 == 0 else 0.24)
        place_mono(mix, kick, _at(bar, 0, bar_samples, beat), 0.9)
        place_mono(mix, kick, _at(bar, 2, bar_samples, beat), 0.72)
        place_mono(mix, kick, _at(bar, 3.5, bar_samples, beat), 0.28)
        place_mono(mix, snare, _at(bar, 1, bar_samples, beat), 0.48)
        place_mono(mix, snare, _at(bar, 3, bar_samples, beat), 0.48)
    return _finish_mono(mix, sr, 0.003, 0.016)


def _bow(freq: float, n: int, sr: int) -> np.ndarray:
    t = np.arange(n) / sr
    vibrato = freq * (1.0 + 0.005 * np.sin(2.0 * np.pi * 5.1 * t))
    phase = 2.0 * np.pi * np.cumsum(vibrato) / sr
    sig = np.sin(phase) + 0.32 * np.sin(2.0 * phase) + 0.1 * np.sin(3.0 * phase)
    attack = min(n, int(0.32 * sr))
    release = min(n // 2, int(0.4 * sr))
    env = np.ones(n)
    if attack:
        env[:attack] *= np.linspace(0.0, 1.0, attack)
    if release:
        env[-release:] *= np.linspace(1.0, 0.0, release)
    return sig * env


def _render_strings(track: dict, sr: int, rng: np.random.Generator) -> np.ndarray:
    del rng
    progression = list(track["progression"])
    bar_samples, beat, total = _timeline(float(track["bpm"]), len(progression), sr)
    mix = np.zeros(total)
    for bar, symbol in enumerate(progression):
        note_n = max(1, int(bar_samples * 0.98))
        layer = np.zeros(note_n)
        for midi in _chord_midis(symbol, 50):
            for shift, level in ((-12, 0.7), (0, 1.0), (12, 0.45)):
                layer += level * _bow(midi_to_hz(midi + shift) * 1.001, note_n, sr)
                layer += level * 0.35 * _bow(midi_to_hz(midi + shift) * 0.997, note_n, sr)
        layer /= max(1.0, float(np.max(np.abs(layer))))
        place_mono(mix, layer, _at(bar, 0, bar_samples, beat), 0.8)
    return _finish_mono(mix, sr, 0.03, 0.05)


def _pluck(freq: float, n: int, sr: int, decay: float) -> np.ndarray:
    t = np.arange(n) / sr
    sig = (
        np.sin(2.0 * np.pi * freq * t)
        + 0.45 * np.sin(2.0 * np.pi * freq * 2.0 * t)
        + 0.18 * np.sin(2.0 * np.pi * freq * 3.0 * t)
    )
    return sig * np.exp(-t * decay)


def _render_bluegrass(track: dict, sr: int, rng: np.random.Generator) -> np.ndarray:
    progression = list(track["progression"])
    bar_samples, beat, total = _timeline(float(track["bpm"]), len(progression), sr)
    mix = np.zeros(total)
    brush = _noise_hit(sr, rng, 0.09, 22.0)
    for bar, symbol in enumerate(progression):
        root = _root_midi(symbol, 40)
        fifth = root + 7
        for beat_index, midi, gain in ((0, root, 0.7), (2, fifth, 0.55)):
            n = max(1, int(beat * 0.9))
            note = _pluck(midi_to_hz(midi), n, sr, 3.2)
            place_mono(mix, note, _at(bar, beat_index, bar_samples, beat), gain)
        chuck_tones = _chord_midis(symbol, 64)
        chuck_n = max(1, int(beat * 0.22))
        chuck = np.zeros(chuck_n)
        for midi in chuck_tones:
            chuck += _pluck(midi_to_hz(midi), chuck_n, sr, 16.0)
        for beat_index in (1, 3):
            place_mono(mix, chuck, _at(bar, beat_index, bar_samples, beat), 0.28)
            place_mono(mix, brush, _at(bar, beat_index, bar_samples, beat), 0.16)
        roll = _chord_midis(symbol, 76)
        order = [0, 1, 2, 1] if len(roll) >= 3 else [0, 1, 0, 1]
        pluck_n = max(1, int(beat * 0.42))
        for eighth in range(8):
            midi = roll[order[eighth % len(order)] % len(roll)]
            note = _pluck(midi_to_hz(midi), pluck_n, sr, 11.0)
            place_mono(mix, note, _at(bar, eighth / 2.0, bar_samples, beat), 0.22)
    return _finish_mono(mix, sr, 0.004, 0.02)


def _swell(n: int) -> np.ndarray:
    if n <= 1:
        return np.ones(n)
    return np.sin(np.linspace(0.0, np.pi, n))


def _render_ambient(track: dict, sr: int, rng: np.random.Generator) -> np.ndarray:
    del rng
    progression = list(track["progression"])
    bars = len(progression)
    bar_samples, beat, total = _timeline(float(track["bpm"]), bars, sr)
    mix = np.zeros(total)
    tonic = _root_midi(progression[0], 38)
    t = np.arange(total) / sr
    drone = np.sin(2.0 * np.pi * midi_to_hz(tonic) * t)
    drone += 0.45 * np.sin(2.0 * np.pi * midi_to_hz(tonic + 12) * t)
    drone += 0.28 * np.sin(2.0 * np.pi * midi_to_hz(tonic + 7) * t)
    drone *= 0.55 + 0.08 * np.sin(2.0 * np.pi * 0.07 * t)
    mix += drone * 0.22
    for bar, symbol in enumerate(progression):
        n = bar_samples
        pad = np.zeros(n)
        for midi in _chord_midis(symbol, 55):
            freq = midi_to_hz(midi)
            local = np.arange(n) / sr
            vib = freq * (1.0 + 0.003 * np.sin(2.0 * np.pi * 0.35 * local))
            phase = 2.0 * np.pi * np.cumsum(vib) / sr
            pad += np.sin(phase) + 0.25 * np.sin(2.0 * phase)
        pad *= _swell(n)
        place_mono(mix, pad, _at(bar, 0, bar_samples, beat), 0.2)
    echoed = mix.copy()
    for delay, gain in ((0.09, 0.28), (0.17, 0.16), (0.29, 0.08)):
        shift = int(delay * sr) % max(1, len(mix))
        echoed += np.roll(mix, shift) * gain
    return _finish_mono(echoed, sr, 0.04, 0.06)


_STYLED = {
    "house": _render_house,
    "hard-rock": _render_hard_rock,
    "strings": _render_strings,
    "bluegrass": _render_bluegrass,
    "ambient": _render_ambient,
}


def render_track(track: dict) -> np.ndarray:
    bpm = float(track["bpm"])
    progression = list(track["progression"])
    bars = len(progression)
    feel = str(track.get("feel") or "pop")
    if feel not in ("shuffle", "rock", "pop", "funk"):
        raise ValueError(f"{track.get('id')}: unknown feel {feel!r}")
    bar_samples = int(round(4.0 * 60.0 / bpm * SR))
    beat_samples = bar_samples / 4.0
    mix = np.zeros((bar_samples * bars, 2), dtype=np.float64)
    rng = np.random.default_rng(_seed(str(track["id"])))
    _add_kit(mix, rng, bars, bar_samples, beat_samples, feel)
    _add_bass(mix, bars, progression, bar_samples, beat_samples, feel)
    _add_chords(mix, progression, bar_samples, beat_samples, feel)
    mix = np.tanh(mix * 1.45)
    peak = float(np.max(np.abs(mix))) if mix.size else 1.0
    if peak > 1e-8:
        mix *= 0.89 / peak
    fade = int(0.012 * SR)
    if len(mix) > fade:
        mix[-fade:, :] *= np.linspace(1.0, 0.0, fade)[:, None]
    return mix


def encode_wav(mix: np.ndarray, sr: int) -> bytes:
    import io

    if mix.ndim == 1:
        channels = 1
        pcm = np.clip(np.round(mix * 32767.0), -32768, 32767).astype("<i2")
    else:
        channels = int(mix.shape[1])
        pcm = np.clip(np.round(mix * 32767.0), -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "w") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(pcm.tobytes())
    return buf.getvalue()


def write_wav(path: Path, mix: np.ndarray, sr: int = SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encode_wav(mix, sr))


def load_catalog(path: Path = CATALOG) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    catalog = load_catalog()
    for track in catalog["tracks"]:
        feel = str(track.get("feel") or "pop")
        dest = AUDIO_DIR / Path(track["file"]).name
        if feel in _STYLED:
            mix = _STYLED[feel](track, SR_LO, np.random.default_rng(_seed(str(track["id"]))))
            sr = SR_LO
        else:
            mix = render_track(track)
            sr = SR
            payload = encode_wav(mix, sr)
            if dest.exists() and dest.read_bytes() == payload:
                print(f"{track['id']}: unchanged")
                continue
            dest.write_bytes(payload)
            seconds = len(mix) / sr
            peak = float(np.max(np.abs(mix)))
            print(f"{track['id']}: {dest.name}  {seconds:.2f}s  peak {peak:.2f}")
            continue
        write_wav(dest, mix, sr)
        seconds = len(mix) / sr
        peak = float(np.max(np.abs(mix)))
        print(f"{track['id']}: {dest.name}  {seconds:.2f}s  peak {peak:.2f}  {sr} Hz mono")


if __name__ == "__main__":
    main()
