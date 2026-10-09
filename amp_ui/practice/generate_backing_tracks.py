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


def write_wav(path: Path, mix: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(np.round(mix * 32767.0), -32768, 32767).astype(np.int16)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


def load_catalog(path: Path = CATALOG) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    catalog = load_catalog()
    for track in catalog["tracks"]:
        mix = render_track(track)
        dest = AUDIO_DIR / Path(track["file"]).name
        write_wav(dest, mix)
        seconds = len(mix) / SR
        peak = float(np.max(np.abs(mix)))
        print(f"{track['id']}: {dest.name}  {seconds:.2f}s  peak {peak:.2f}")


if __name__ == "__main__":
    main()
