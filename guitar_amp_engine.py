#!/usr/bin/env python3
"""Guitar amp DSP and audio I/O. Used by the CLI and the browser UI server."""

import fcntl
import os
import queue
import subprocess
import sys
import threading
import time

import numpy as np
import sounddevice as sd


def list_devices():
    devices = sd.query_devices()
    apis = sd.query_hostapis()
    for index, device in enumerate(devices):
        api = apis[device["hostapi"]]["name"]
        print(
            f"[{index}] {device['name']} | API: {api} | in: {device['max_input_channels']} | out: {device['max_output_channels']}"
        )


def list_devices_json():
    devices = sd.query_devices()
    apis = sd.query_hostapis()
    rows = []
    for index, device in enumerate(devices):
        api = apis[device["hostapi"]]["name"]
        rows.append(
            {
                "index": index,
                "name": device["name"],
                "api": api,
                "max_input_channels": device["max_input_channels"],
                "max_output_channels": device["max_output_channels"],
            }
        )
    return rows


def _is_alsa_device(device, api_names):
    return api_names[device["hostapi"]]["name"].lower() == "alsa"


def _channel_count(device, direction):
    return device["max_input_channels"] if direction == "input" else device["max_output_channels"]


def choose_device(query, channels, direction):
    api_names = sd.query_hostapis()
    candidates = []
    for index, device in enumerate(sd.query_devices()):
        count = _channel_count(device, direction)
        if query.lower() in device["name"].lower() and count >= channels and _is_alsa_device(device, api_names):
            candidates.append(index)
    if not candidates:
        raise RuntimeError(f"No ALSA {direction} device matching '{query}'. Use --list-devices.")
    return candidates[0]


def auto_select_scarlett(direction, min_channels=1, prefer_substrings=None):
    """Pick a Focusrite Scarlett ALSA device (Solo preferred, then any Scarlett with 2+ channels)."""
    api_names = sd.query_hostapis()
    prefer = [s.lower() for s in (prefer_substrings or []) if s]
    solo = []
    stereo = []
    for index, device in enumerate(sd.query_devices()):
        if not _is_alsa_device(device, api_names):
            continue
        name = device["name"]
        lower = name.lower()
        if "scarlett" not in lower:
            continue
        count = _channel_count(device, direction)
        if count < min_channels:
            continue
        prefer_boost = sum(1 for token in prefer if token in lower)
        if "solo" in lower:
            solo.append((prefer_boost, count, index))
        elif count >= 2:
            stereo.append((prefer_boost, count, index))
    pool = solo if solo else stereo
    if not pool:
        raise RuntimeError(
            "No Focusrite Scarlett ALSA device found. Plug in your interface (e.g. Scarlett Solo 3rd Gen) "
            "or use --list-devices / Advanced device fields."
        )
    pool.sort(key=lambda row: (-row[0], -row[1], row[2]))
    return pool[0][2]


# Playback default. Scarlett Solo stays the preferred input. PipeWire output
# follows the system default sink (the Logitech headset when that is the
# default). A missing headset does not block playback: fall through to
# Scarlett/Focusrite, then any other real sink.
AUTO_PW_SINK = "@auto"
DEFAULT_PW_SINK = AUTO_PW_SINK

# Substrings that mark non-playback / virtual sinks we should not prefer.
_UNUSABLE_SINK_MARKERS = (
    "dummy",
    "null",
    "auto_null",
    "processed_guitar",
    ".monitor",
)


def _blank(value):
    if value is None:
        return True
    return not str(value).strip()


def _is_auto_pw_sink(query):
    if _blank(query):
        return True
    lowered = str(query).strip().lower()
    return lowered in (AUTO_PW_SINK, "@default", "auto", "default")


def _looks_like_logitech_sink(query):
    lowered = str(query or "").lower()
    return "logitech" in lowered or "logi_usb" in lowered or "logi usb" in lowered


def effective_pw_sink(config):
    """PipeWire playback sink query, or None when the user chose direct ALSA output.

    Default is AUTO_PW_SINK (system default sink, else Scarlett, else any real sink).
    A non-empty pw_sink overrides it. A non-empty output_device with no pw_sink
    uses ALSA and skips PipeWire playback.
    """
    raw = config.get("pw_sink")
    if not _blank(raw):
        return str(raw).strip()
    if not _blank(config.get("output_device")):
        return None
    return DEFAULT_PW_SINK


def _use_input_auto(config):
    """True when input should auto-detect a Scarlett Solo (output is independent)."""
    if not _blank(config.get("input_device")):
        return False
    device = config.get("device")
    if _blank(device):
        return True
    return str(device).strip().lower() == "auto"


def resolve_audio_devices(config):
    """Return (input_index, output_index, meta).

    Input is an explicit ALSA filter or Scarlett Solo auto-detect.
    Output index is None when playback goes to a PipeWire sink (the default).
    """
    pw_sink = effective_pw_sink(config)
    meta = {
        "auto_detected": False,
        "device": config.get("device"),
        "input_device": None,
        "output_device": None,
        "pw_sink": pw_sink,
    }

    if _use_input_auto(config):
        meta["auto_detected"] = True
        meta["device"] = "auto"
        input_device = auto_select_scarlett("input", 1)
        meta["input_device"] = sd.query_devices(input_device)["name"]
    else:
        device_query = config.get("device")
        device_query = str(device_query).strip() if not _blank(device_query) else "Scarlett"
        meta["device"] = device_query
        input_query = config.get("input_device")
        input_query = str(input_query).strip() if not _blank(input_query) else device_query
        meta["input_device"] = input_query
        input_device = choose_device(input_query, 1, "input")

    if pw_sink:
        return input_device, None, meta

    output_query = str(config.get("output_device")).strip()
    meta["output_device"] = output_query
    return input_device, choose_device(output_query, 1, "output"), meta


_NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
# Standard guitar, low E to high E. MIDI note numbers.
_GUITAR_STRINGS = (
    {"name": "E2", "midi": 40},
    {"name": "A2", "midi": 45},
    {"name": "D3", "midi": 50},
    {"name": "G3", "midi": 55},
    {"name": "B3", "midi": 59},
    {"name": "E4", "midi": 64},
)


def _idle_tuner():
    return {
        "active": False,
        "hz": 0.0,
        "cents": 0.0,
        "note": "",
        "octave": 0,
        "midi": 0,
        "clarity": 0.0,
        "string": -1,
    }


def estimate_pitch(samples, rate):
    """Fundamental frequency of one guitar note, or None when the frame is not a clear pitch.

    Uses the McLeod pitch method: normalized autocorrelation, then the earliest
    strong peak so a guitar's harmonics do not read as a higher note.
    """
    frame = np.asarray(samples, dtype=np.float64)
    if frame.size < 512:
        return None
    frame = frame - float(np.mean(frame))
    rms = float(np.sqrt(np.mean(frame * frame)))
    if rms < 0.008:
        return None
    frame = frame * np.hanning(frame.size)
    size = int(frame.size)
    fft_n = 1
    while fft_n < size * 2:
        fft_n *= 2
    spectrum = np.fft.rfft(frame, fft_n)
    acf = np.fft.irfft(spectrum * np.conjugate(spectrum), fft_n)[:size]
    squares = frame * frame
    cumulative = np.cumsum(squares)
    lags = np.arange(size)
    left = np.empty(size, dtype=np.float64)
    left[0] = cumulative[-1]
    if size > 1:
        left[1:] = cumulative[-2::-1]
    right = cumulative[-1] - np.concatenate((np.zeros(1), cumulative[:-1]))
    nsdf = (2.0 * acf) / (left + right + 1e-12)
    min_lag = max(2, int(rate / 520.0))
    max_lag = min(size - 2, int(rate / 70.0))
    if max_lag <= min_lag + 2:
        return None
    peaks = []
    for lag in range(min_lag + 1, max_lag):
        height = nsdf[lag]
        if height >= 0.45 and height >= nsdf[lag - 1] and height > nsdf[lag + 1]:
            peaks.append(lag)
    if not peaks:
        return None
    best = max(float(nsdf[lag]) for lag in peaks)
    if best < 0.55:
        return None
    chosen = peaks[0]
    for lag in peaks:
        if float(nsdf[lag]) >= best * 0.9:
            chosen = lag
            break
    center = float(nsdf[chosen])
    left_y = float(nsdf[chosen - 1])
    right_y = float(nsdf[chosen + 1])
    denom = left_y - 2.0 * center + right_y
    shift = 0.0 if abs(denom) < 1e-9 else 0.5 * (left_y - right_y) / denom
    if shift < -0.5 or shift > 0.5:
        shift = 0.0
    period = chosen + shift
    if period < 1.0:
        return None
    hz = float(rate) / period
    midi_float = 69.0 + 12.0 * np.log2(hz / 440.0)
    midi = int(np.clip(int(round(midi_float)), 0, 127))
    cents = float((midi_float - midi) * 100.0)
    octave = midi // 12 - 1
    string_index = -1
    nearest = min(_GUITAR_STRINGS, key=lambda item: abs(item["midi"] - midi_float))
    if abs(nearest["midi"] - midi_float) <= 0.55:
        string_index = _GUITAR_STRINGS.index(nearest)
    return {
        "active": True,
        "hz": round(hz, 2),
        "cents": round(cents, 1),
        "note": _NOTE_NAMES[midi % 12],
        "octave": octave,
        "midi": midi,
        "clarity": round(best, 3),
        "string": string_index,
    }


# 4x oversampling lowpass. Cutoff sits just under the original Nyquist so the
# drive nonlinearity's images do not fold back into the guitar range.
_OS_FACTOR = 4
_OS_TAPS = 31
# About -6 dBFS. The browser backing track mixes in the same PipeWire sink,
# so the guitar leaves this much room before the sum reaches full scale.
OUTPUT_CEILING = np.float32(10.0 ** (-6.0 / 20.0))
INPUT_CLIP_LEVEL = np.float32(0.98)
# Scarlett input and the headset output are different USB clocks. 21 ms matches
# a safe PipeWire quantum and is enough to ride out a late block without
# splicing zeros into the guitar.
PW_PLAYBACK_LATENCY = "21ms"
JITTER_TARGET_MS = 21.0
JITTER_MAX_MS = 85.0


def _lowpass_kernel(factor, taps):
    fc = 0.45 / float(factor)
    mid = (taps - 1) / 2.0
    n = np.arange(taps, dtype=np.float64) - mid
    kernel = (2.0 * fc) * np.sinc(2.0 * fc * n)
    kernel *= np.hamming(taps)
    total = float(np.sum(kernel))
    if total != 0.0:
        kernel /= total
    return kernel.astype(np.float32)


_OS_KERNEL = _lowpass_kernel(_OS_FACTOR, _OS_TAPS)


def _ftz(value):
    """Flush denormals so filter tails cannot stall the audio callback."""
    number = float(value)
    if -1e-15 < number < 1e-15:
        return np.float32(0.0)
    return np.float32(number)


def _stream_fir(samples, kernel, state):
    if samples.size == 0:
        return samples, state
    padded = np.concatenate((state, np.asarray(samples, dtype=np.float32)))
    filtered = np.convolve(padded, kernel, mode="valid").astype(np.float32, copy=False)
    new_state = padded[-(len(kernel) - 1) :].astype(np.float32, copy=True)
    new_state[np.abs(new_state) < np.float32(1e-15)] = np.float32(0.0)
    return filtered, new_state


# Linear trim after the cabinet, before the delay taps see the signal.
# The impulse is already energy-normalized; this leaves room for the tone
# stack, the Haas pair, and delay feedback to sum without crossing full scale.
POST_CAB_GAIN = np.float32(0.5)


def _output_limit(samples, ceiling=None):
    """Linear below the knee, then a soft approach to the ceiling.

    ceiling * tanh(x / ceiling) bends every peak and, once the cabinet has
    overshot, flattens the wave into a buzz. This curve leaves quieter samples
    alone and only rounds the tips that are already near the ceiling.
    """
    if ceiling is None:
        ceiling = OUTPUT_CEILING
    ceiling = np.float32(ceiling)
    knee = ceiling * np.float32(0.85)
    span = ceiling - knee
    out = np.asarray(samples, dtype=np.float32)
    if out.size == 0 or span <= 0:
        return out
    hot = np.abs(out) > knee
    if not np.any(hot):
        return out
    shaped = np.array(out, copy=True)
    excess = np.abs(out[hot]) - knee
    limited = ceiling - span * np.exp(-excess / span)
    shaped[hot] = np.sign(out[hot]) * limited.astype(np.float32)
    return shaped


def _resample_rows(block, count):
    """Linear resample so a one-sample clock correction does not click."""
    rows = int(block.shape[0])
    count = int(count)
    if rows == count:
        return block
    if rows <= 1:
        if rows == 1:
            return np.repeat(block, count, axis=0)
        return np.zeros((count, block.shape[1]), dtype=np.float32)
    positions = np.linspace(0.0, rows - 1.0, count)
    left = np.floor(positions).astype(np.int64)
    right = np.minimum(left + 1, rows - 1)
    frac = (positions - left).astype(np.float32).reshape(-1, 1)
    return (block[left] * (1.0 - frac) + block[right] * frac).astype(np.float32)


def _conceal_underrun(got, count, last):
    """Continue from the last played sample and fade out.

    A block of zeros in the middle of a note is a click. Decaying from the
    last sample keeps the wave continuous until the next real block arrives.
    """
    last = np.asarray(last, dtype=np.float32).reshape(-1)
    channels = int(last.shape[0])
    count = int(count)
    out = np.empty((count, channels), dtype=np.float32)
    have = int(got.shape[0]) if getattr(got, "size", 0) else 0
    anchor = np.asarray(got[-1], dtype=np.float32) if have else last
    fade = np.exp(-np.linspace(0.0, 6.0, count, dtype=np.float32)).reshape(-1, 1)
    out[:] = anchor.reshape(1, -1) * fade
    if have <= 0:
        return out
    blend = min(32, have, count)
    head = have - blend
    if head > 0:
        out[:head] = got[:head, :channels]
    if blend:
        ramp = np.linspace(0.0, 1.0, blend, dtype=np.float32).reshape(-1, 1)
        start = have - blend
        real = got[start:have, :channels]
        out[start:have] = real * (1.0 - ramp) + out[start:have] * ramp
    return out


def _fade_in(block, anchor):
    ramp_n = min(32, int(block.shape[0]))
    if ramp_n <= 0:
        return block
    out = np.array(block, dtype=np.float32, copy=True)
    ramp = np.linspace(0.0, 1.0, ramp_n, dtype=np.float32).reshape(-1, 1)
    origin = np.asarray(anchor, dtype=np.float32).reshape(1, -1)
    out[:ramp_n] = origin * (1.0 - ramp) + out[:ramp_n] * ramp
    return out


def _widen_playback_pipe(fd, frame_bytes):
    """Keep several blocks in the kernel pipe.

    Shrinking the pipe to a single block makes pw-cat underrun on any hiccup,
    and the old pumps then filled that hole with silence.
    """
    size = max(int(frame_bytes) * 8, 16384)
    try:
        fcntl.fcntl(fd, 1031, size)  # F_SETPIPE_SZ
    except OSError as error:
        print(f"Pipe buffer left at default size: {error}", flush=True)


class JitterBuffer:
    """Sample FIFO between the Scarlett clock and the headset clock.

    Playback starts once the buffer reaches the target fill. After that, each
    pull walks the fill back toward the target by one sample when the clocks
    drift. An empty pull fades out instead of returning zeros.
    """

    def __init__(self, rate, channels=2, target_ms=JITTER_TARGET_MS, max_ms=JITTER_MAX_MS):
        self.rate = max(1, int(rate))
        self.channels = int(channels)
        self.target = max(1, int(round(self.rate * float(target_ms) / 1000.0)))
        raw_cap = max(self.target * 3, int(round(self.rate * float(max_ms) / 1000.0)))
        capacity = 1
        while capacity < raw_cap:
            capacity *= 2
        self.capacity = capacity
        self.mask = capacity - 1
        self.buf = np.zeros((capacity, self.channels), dtype=np.float32)
        self.read = 0
        self.fill = 0
        self.lock = threading.Lock()
        self.underruns = 0
        self.overruns = 0
        self.drift_adds = 0
        self.drift_drops = 0
        self.last = np.zeros(self.channels, dtype=np.float32)
        self.primed = False
        self._need_resume = False

    def snapshot(self):
        with self.lock:
            fill = self.fill
            target = self.target
            return {
                "underruns": self.underruns,
                "overruns": self.overruns,
                "drift_adds": self.drift_adds,
                "drift_drops": self.drift_drops,
                "fill": fill,
                "target": target,
                "fill_ms": 1000.0 * fill / float(self.rate),
                "fill_ratio": (fill / float(target)) if target else 0.0,
            }

    def push(self, block):
        block = np.asarray(block, dtype=np.float32)
        if block.ndim == 1:
            block = block.reshape(-1, 1)
        if block.shape[1] != self.channels:
            fitted = np.zeros((block.shape[0], self.channels), dtype=np.float32)
            count = min(self.channels, block.shape[1])
            fitted[:, :count] = block[:, :count]
            if block.shape[1] == 1 and self.channels == 2:
                fitted[:, 1] = block[:, 0]
            block = fitted
        count = int(block.shape[0])
        if count <= 0:
            return 0
        with self.lock:
            if count > self.capacity:
                discarded = self.fill + count - self.capacity
                block = np.ascontiguousarray(block[-self.capacity :], dtype=np.float32)
                self.buf[:] = block
                self.read = 0
                self.fill = self.capacity
                self.overruns += 1
                self.primed = True
                return discarded
            overrun_samples = 0
            if self.fill + count > self.capacity:
                overrun_samples = self.fill + count - self.capacity
                new_read = (self.read + overrun_samples) & self.mask
                join = min(16, self.fill - overrun_samples)
                if join > 0:
                    edge = self.buf[(new_read - 1) & self.mask].copy()
                    for i in range(join):
                        mix = (i + 1) / float(join + 1)
                        pos = (new_read + i) & self.mask
                        self.buf[pos] = edge * (1.0 - mix) + self.buf[pos] * mix
                self.read = new_read
                self.fill -= overrun_samples
                self.overruns += 1
            start = (self.read + self.fill) & self.mask
            first = min(count, self.capacity - start)
            self.buf[start : start + first] = block[:first]
            rest = count - first
            if rest:
                self.buf[:rest] = block[first:]
            self.fill += count
            if self.fill >= self.target:
                self.primed = True
            return overrun_samples

    def _read_unlocked(self, count):
        if count <= 0:
            return np.zeros((0, self.channels), dtype=np.float32)
        start = self.read
        first = min(count, self.capacity - start)
        if count - first > 0:
            got = np.concatenate((self.buf[start : start + first], self.buf[: count - first]), axis=0)
        else:
            got = self.buf[start : start + first].copy()
        self.read = (self.read + count) & self.mask
        self.fill -= count
        return got

    def pull(self, count):
        count = int(count)
        with self.lock:
            if not self.primed:
                return np.zeros((count, self.channels), dtype=np.float32), "wait"
            slack = max(count // 2, 32)
            take = count
            mode = "ok"
            if self.fill > self.target + slack and self.fill >= count + 1:
                take = count + 1
                self.drift_drops += 1
                mode = "drop"
            elif self.fill + slack < self.target and count > 1 and self.fill >= count:
                take = count - 1
                self.drift_adds += 1
                mode = "add"
            if self.fill < take:
                have = self.fill
                got = self._read_unlocked(have) if have else np.zeros((0, self.channels), dtype=np.float32)
                self.underruns += 1
                played = _conceal_underrun(got, count, self.last)
                if played.shape[0]:
                    self.last = played[-1].copy()
                self._need_resume = True
                return played, "underrun"
            got = self._read_unlocked(take)
            resume = self._need_resume
            anchor = self.last.copy()
        if mode in ("drop", "add"):
            got = _resample_rows(got, count)
        if resume:
            got = _fade_in(got, anchor)
        if got.shape[0]:
            with self.lock:
                self.last = got[-1].copy()
                self._need_resume = False
        return got, mode


class FastAmp:
    def __init__(
        self,
        rate,
        delay_ms,
        feedback,
        mix,
        drive,
        volume,
        wah_freq=900.0,
        wah_q=5.0,
        wah_mix=0.0,
        bass=0.5,
        mid=0.5,
        treble=0.5,
        presence=0.5,
        ir="",
        ir_mix=0.0,
        low_cut=80.0,
        high_cut=8000.0,
        preset="",
    ):
        self.rate = rate
        self.drive = drive
        self.feedback = feedback
        self.mix = mix
        self.volume = volume
        self.wah_freq = float(wah_freq)
        self.wah_q = float(wah_q)
        self.wah_mix = float(wah_mix)
        self.bass = float(bass)
        self.mid = float(mid)
        self.treble = float(treble)
        self.presence = float(presence)
        self.ir = ""
        self.ir_mix = float(ir_mix)
        self.low_cut = float(low_cut)
        self.high_cut = float(high_cut)
        self.preset = str(preset or "")
        self._wah_x1 = np.float32(0.0)
        self._wah_x2 = np.float32(0.0)
        self._wah_y1 = np.float32(0.0)
        self._wah_y2 = np.float32(0.0)
        self._wah_coeffs = None
        self._wah_coeff_key = None
        self._tone_coeffs = None
        self._tone_state = [(np.float32(0.0), np.float32(0.0), np.float32(0.0), np.float32(0.0)) for _ in range(4)]
        # Cabinet FFT bank is published as one tuple. The audio thread owns the
        # overlap tail so a preset change cannot replace it mid-block.
        self._cab_bank = ("", None, {})
        self._cab_tail = None
        self._cab_tail_name = ""
        self._render_error = None
        self._hp_x = np.float32(0.0)
        self._hp_y = np.float32(0.0)
        self._lp_y = np.float32(0.0)
        self._set_delay_ms(delay_ms)
        self._update_wah_coeffs(force=True)
        self._update_tone_coeffs()
        if ir:
            self._set_ir(ir)
        self.ring_size = self.delay_frames * 5 + 4096
        self.ring = np.zeros(self.ring_size, dtype=np.float32)
        self.write = 0
        self.offsets = np.arange(4096, dtype=np.int64)
        self.input_energy = np.zeros(2, dtype=np.float32)
        self.signaled = False
        self.signaled_out = False
        self.gate = np.float32(0.0)
        self.pending = JitterBuffer(rate)
        self.obs_pending = JitterBuffer(rate)
        self.running = True
        self.xruns = 0
        self._in_clip_hold = 0
        self._out_clip_hold = 0
        self._os_up_state = np.zeros(_OS_TAPS - 1, dtype=np.float32)
        self._os_down_state = np.zeros(_OS_TAPS - 1, dtype=np.float32)
        self.meters = {
            "mic": 0.0,
            "inst": 0.0,
            "gate": 0.0,
            "out": 0.0,
            "in": 0.0,
            "in_clip": 0.0,
            "out_clip": 0.0,
            "xruns": 0,
            "underruns": 0,
            "overruns": 0,
            "obs_underruns": 0,
            "obs_overruns": 0,
            "drift_adds": 0,
            "drift_drops": 0,
            "jitter_ms": 0.0,
            "jitter": 0.0,
            "pre": 0.0,
        }
        self.pre_peak = 0.0
        self.cab_peak = 0.0
        self._tune_len = 16384
        self._tune_buf = np.zeros(self._tune_len, dtype=np.float32)
        self._tune_pos = 0
        self._tune_fill = 0
        self._tune_since = 0
        self._tune_hold = 0
        self.tuner = _idle_tuner()

    def _set_delay_ms(self, delay_ms):
        self.delay_ms = float(delay_ms)
        self.delay_frames = max(1, round(self.rate * self.delay_ms / 1000.0))
        self.haas_frames = max(1, round(self.rate * 0.020))

    def apply_params(self, **kwargs):
        if "drive" in kwargs and kwargs["drive"] is not None:
            self.drive = float(kwargs["drive"])
        if "feedback" in kwargs and kwargs["feedback"] is not None:
            self.feedback = float(kwargs["feedback"])
        if "mix" in kwargs and kwargs["mix"] is not None:
            self.mix = float(kwargs["mix"])
        if "volume" in kwargs and kwargs["volume"] is not None:
            self.volume = float(kwargs["volume"])
        if "delay_ms" in kwargs and kwargs["delay_ms"] is not None:
            new_ms = float(kwargs["delay_ms"])
            if abs(new_ms - self.delay_ms) > 0.01:
                self._set_delay_ms(new_ms)
        wah_changed = False
        if "wah_freq" in kwargs and kwargs["wah_freq"] is not None:
            self.wah_freq = float(kwargs["wah_freq"])
            wah_changed = True
        if "wah_q" in kwargs and kwargs["wah_q"] is not None:
            self.wah_q = float(kwargs["wah_q"])
            wah_changed = True
        if "wah_mix" in kwargs and kwargs["wah_mix"] is not None:
            self.wah_mix = float(kwargs["wah_mix"])
        if wah_changed:
            self._update_wah_coeffs(force=True)
        tone_changed = False
        for name in ("bass", "mid", "treble", "presence"):
            if name in kwargs and kwargs[name] is not None:
                setattr(self, name, float(kwargs[name]))
                tone_changed = True
        if tone_changed:
            self._update_tone_coeffs()
        if "low_cut" in kwargs and kwargs["low_cut"] is not None:
            self.low_cut = float(kwargs["low_cut"])
        if "high_cut" in kwargs and kwargs["high_cut"] is not None:
            self.high_cut = float(kwargs["high_cut"])
        if "ir_mix" in kwargs and kwargs["ir_mix"] is not None:
            self.ir_mix = float(kwargs["ir_mix"])
        if "ir" in kwargs and kwargs["ir"] is not None:
            self._set_ir(kwargs["ir"])
        if "preset" in kwargs and kwargs["preset"] is not None:
            self.preset = str(kwargs["preset"])

    def params_snapshot(self):
        return {
            "drive": self.drive,
            "delay_ms": self.delay_ms,
            "feedback": self.feedback,
            "mix": self.mix,
            "volume": self.volume,
            "wah_freq": self.wah_freq,
            "wah_q": self.wah_q,
            "wah_mix": self.wah_mix,
            "bass": self.bass,
            "mid": self.mid,
            "treble": self.treble,
            "presence": self.presence,
            "ir": self.ir,
            "ir_mix": self.ir_mix,
            "low_cut": self.low_cut,
            "high_cut": self.high_cut,
            "preset": self.preset,
        }

    def _cab_nfft(self, frames, kernel_len):
        need = int(frames) + int(kernel_len) - 1
        nfft = 1
        while nfft < need:
            nfft *= 2
        return nfft

    def _set_ir(self, name):
        from amp_presets import ir_samples

        text = str(name or "").strip()
        if not text:
            self._cab_bank = ("", None, {})
            self.ir = ""
            return
        kernel = np.ascontiguousarray(ir_samples(text), dtype=np.float32)
        spectra = {}
        for frames in (128, 256, 512, 1024):
            nfft = self._cab_nfft(frames, kernel.size)
            if nfft in spectra:
                continue
            padded = np.zeros(nfft, dtype=np.float32)
            padded[: kernel.size] = kernel
            spectra[nfft] = np.fft.rfft(padded)
        # One assignment so the callback never sees a name without its spectra.
        self._cab_bank = (text, kernel, spectra)
        self.ir = text

    def _update_wah_coeffs(self, force=False):
        """RBJ constant-peak-gain bandpass for wah / sweeping EQ."""
        freq = float(np.clip(self.wah_freq, 120.0, min(12000.0, self.rate * 0.45)))
        q = float(np.clip(self.wah_q, 0.4, 16.0))
        key = (round(freq, 2), round(q, 3))
        if not force and key == self._wah_coeff_key and self._wah_coeffs is not None:
            return
        w0 = 2.0 * np.pi * freq / float(self.rate)
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2.0 * q)
        b0 = alpha
        b1 = 0.0
        b2 = -alpha
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha
        inv_a0 = 1.0 / a0
        self._wah_coeffs = (
            np.float32(b0 * inv_a0),
            np.float32(b1 * inv_a0),
            np.float32(b2 * inv_a0),
            np.float32(a1 * inv_a0),
            np.float32(a2 * inv_a0),
        )
        self._wah_coeff_key = key

    def _apply_wah(self, source):
        mix = float(np.clip(self.wah_mix, 0.0, 1.0))
        if mix <= 1e-4:
            return source
        self._update_wah_coeffs()
        b0, b1, b2, a1, a2 = self._wah_coeffs
        x1 = self._wah_x1
        x2 = self._wah_x2
        y1 = self._wah_y1
        y2 = self._wah_y2
        out = np.empty_like(source)
        # Per-sample biquad so XY sweeps stay stable mid-block.
        for i, x0 in enumerate(source):
            y0 = _ftz(b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2)
            out[i] = y0
            x2, x1 = x1, x0
            y2, y1 = y1, y0
        self._wah_x1 = _ftz(x1)
        self._wah_x2 = _ftz(x2)
        self._wah_y1 = _ftz(y1)
        self._wah_y2 = _ftz(y2)
        # Mild makeup so high-Q sweeps stay audible into the drive stage.
        wet = out * np.float32(1.35)
        dry = source
        return (np.float32(1.0 - mix) * dry + np.float32(mix) * wet).astype(np.float32, copy=False)

    def _biquad(self, kind, freq, db, q=0.707):
        if abs(db) < 0.25:
            return None
        amp = 10.0 ** (db / 40.0)
        w0 = 2.0 * np.pi * float(freq) / float(self.rate)
        cos_w0 = float(np.cos(w0))
        sin_w0 = float(np.sin(w0))
        if kind == "peak":
            alpha = sin_w0 / (2.0 * q)
            b0 = 1.0 + alpha * amp
            b1 = -2.0 * cos_w0
            b2 = 1.0 - alpha * amp
            a0 = 1.0 + alpha / amp
            a1 = -2.0 * cos_w0
            a2 = 1.0 - alpha / amp
        else:
            alpha = sin_w0 / 2.0 * np.sqrt(2.0)
            root = 2.0 * np.sqrt(amp) * alpha
            if kind == "lowshelf":
                b0 = amp * ((amp + 1) - (amp - 1) * cos_w0 + root)
                b1 = 2 * amp * ((amp - 1) - (amp + 1) * cos_w0)
                b2 = amp * ((amp + 1) - (amp - 1) * cos_w0 - root)
                a0 = (amp + 1) + (amp - 1) * cos_w0 + root
                a1 = -2 * ((amp - 1) + (amp + 1) * cos_w0)
                a2 = (amp + 1) + (amp - 1) * cos_w0 - root
            else:
                b0 = amp * ((amp + 1) + (amp - 1) * cos_w0 + root)
                b1 = -2 * amp * ((amp - 1) + (amp + 1) * cos_w0)
                b2 = amp * ((amp + 1) + (amp - 1) * cos_w0 - root)
                a0 = (amp + 1) - (amp - 1) * cos_w0 + root
                a1 = 2 * ((amp - 1) - (amp + 1) * cos_w0)
                a2 = (amp + 1) - (amp - 1) * cos_w0 - root
        inv = 1.0 / a0
        return (
            np.float32(b0 * inv),
            np.float32(b1 * inv),
            np.float32(b2 * inv),
            np.float32(a1 * inv),
            np.float32(a2 * inv),
        )

    def _update_tone_coeffs(self):
        specs = (
            self._biquad("lowshelf", 120.0, (self.bass - 0.5) * 18.0),
            self._biquad("peak", 800.0, (self.mid - 0.5) * 14.0, 0.8),
            self._biquad("highshelf", 3200.0, (self.treble - 0.5) * 14.0),
            self._biquad("highshelf", 4800.0, (self.presence - 0.5) * 10.0),
        )
        self._tone_coeffs = tuple(coeff for coeff in specs if coeff is not None)

    def _apply_tone(self, source):
        coeffs = self._tone_coeffs
        if not coeffs:
            return source
        states = list(self._tone_state)
        out = source
        for index, (b0, b1, b2, a1, a2) in enumerate(coeffs):
            x1, x2, y1, y2 = states[index]
            block = np.empty_like(out)
            for i, x0 in enumerate(out):
                y0 = _ftz(b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2)
                block[i] = y0
                x2 = x1
                x1 = x0
                y2 = y1
                y1 = y0
            states[index] = (_ftz(x1), _ftz(x2), _ftz(y1), _ftz(y2))
            out = block
        self._tone_state = states
        return out

    def _apply_cuts(self, source):
        low = float(self.low_cut)
        high = float(self.high_cut)
        do_hp = low > 30.0
        do_lp = high < 18000.0
        if not do_hp and not do_lp:
            return source
        hp_a = np.float32(np.exp(-2.0 * np.pi * min(low, self.rate * 0.45) / float(self.rate))) if do_hp else None
        lp_a = np.float32(np.exp(-2.0 * np.pi * min(high, self.rate * 0.45) / float(self.rate))) if do_lp else None
        hp_x = self._hp_x
        hp_y = self._hp_y
        lp_y = self._lp_y
        out = np.empty_like(source)
        for i, x0 in enumerate(source):
            sample = x0
            if do_hp:
                hp_y = hp_a * (hp_y + sample - hp_x)
                hp_x = sample
                sample = hp_y
            if do_lp:
                lp_y = (np.float32(1.0) - lp_a) * sample + lp_a * lp_y
                sample = lp_y
            out[i] = sample
        self._hp_x = _ftz(hp_x)
        self._hp_y = _ftz(hp_y)
        self._lp_y = _ftz(lp_y)
        return out

    def _apply_cab(self, source):
        bank = self._cab_bank
        if not bank or not bank[0] or self.ir_mix <= 1e-4:
            return source
        name, kernel, spectra = bank
        frames = int(source.shape[0])
        nfft = self._cab_nfft(frames, kernel.size)
        spectrum = spectra.get(nfft)
        if spectrum is None:
            padded = np.zeros(nfft, dtype=np.float32)
            padded[: kernel.size] = kernel
            spectrum = np.fft.rfft(padded)
        frame = np.zeros(nfft, dtype=np.float32)
        frame[:frames] = source
        wet = np.fft.irfft(np.fft.rfft(frame) * spectrum, nfft).astype(np.float32, copy=False)
        tail = self._cab_tail
        if (
            self._cab_tail_name == name
            and isinstance(tail, np.ndarray)
            and tail.shape == wet.shape
            and tail.dtype == np.float32
        ):
            wet = np.add(wet, tail, dtype=np.float32)
        heard = self._apply_cuts(np.ascontiguousarray(wet[:frames], dtype=np.float32))
        new_tail = np.zeros(nfft, dtype=np.float32)
        if nfft > frames:
            new_tail[: nfft - frames] = wet[frames:]
        self._cab_tail = new_tail
        self._cab_tail_name = name
        mix = np.float32(np.clip(self.ir_mix, 0.0, 1.0))
        mixed = (np.float32(1.0) - mix) * source + mix * heard
        # Fixed headroom, not a per-block peak duck. Ducking the block to fit
        # a hot impulse changes gain every 5 ms and clicks.
        return (mixed * POST_CAB_GAIN).astype(np.float32)

    def source(self, indata):
        if indata.shape[1] < 2:
            source = indata[:, 0]
            mic = float(np.max(np.abs(source)))
            inst = 0.0
        else:
            peaks = np.max(np.abs(indata), axis=0).astype(np.float32)
            self.input_energy += (peaks - self.input_energy) * np.float32(0.15)
            mic = float(self.input_energy[0])
            inst = float(self.input_energy[1])
            if mic > max(0.02, inst * 3.0):
                source = indata[:, 0]
            else:
                source = indata[:, 1]
        self.meters["mic"] = mic
        self.meters["inst"] = inst
        peak = float(np.max(np.abs(source)))
        if peak > 0.03 and not self.signaled:
            self.signaled = True
            print(f"Input signal peak={peak:.3f} mic={mic:.3f} inst={inst:.3f}", flush=True)
        return source

    def _push_tuner(self, source):
        """Track pitch on the clean guitar, a few times a second, off the hot path's worst case."""
        n = int(source.shape[0])
        if n <= 0:
            return
        buf = self._tune_buf
        pos = self._tune_pos
        end = pos + n
        if end <= buf.size:
            buf[pos:end] = source
        else:
            first = buf.size - pos
            buf[pos:] = source[:first]
            buf[: n - first] = source[first:]
        self._tune_pos = (pos + n) % buf.size
        self._tune_fill = min(buf.size, self._tune_fill + n)
        self._tune_since += n
        peak = float(np.max(np.abs(source)))
        if peak < 0.012:
            self._tune_hold -= n
            if self._tune_hold <= 0:
                self.tuner = _idle_tuner()
            return
        if self._tune_fill < buf.size or self._tune_since < 2048:
            return
        self._tune_since = 0
        if self._tune_pos == 0:
            frame = buf
        else:
            frame = np.concatenate((buf[self._tune_pos :], buf[: self._tune_pos]))
        found = estimate_pitch(frame, self.rate)
        if found is None:
            self._tune_hold -= n
            if self._tune_hold <= 0:
                self.tuner = _idle_tuner()
            return
        self._tune_hold = int(0.35 * self.rate)
        self.tuner = found

    def _latch_flag(self, hold_name, key, active, frames, seconds):
        hold = int(getattr(self, hold_name))
        if active:
            hold = int(float(seconds) * float(self.rate))
        else:
            hold = max(0, hold - int(frames))
        setattr(self, hold_name, hold)
        self.meters[key] = 1.0 if hold else 0.0

    def _distort(self, source):
        """Asymmetric soft clip at 4x, then lowpass before returning to 48 kHz.

        The old path ran tanh twice at the sample rate, and the second stage
        (tanh of 3.5x) was nearly a square wave. Those harmonics folded back
        and sounded like static on some frets.
        """
        factor = _OS_FACTOR
        kernel = _OS_KERNEL
        up = np.zeros(int(source.shape[0]) * factor, dtype=np.float32)
        up[::factor] = source
        up, self._os_up_state = _stream_fir(up, kernel, self._os_up_state)
        up *= np.float32(factor)
        driven = up * np.float32(self.drive)
        shaped = driven + np.float32(0.18) * driven * np.abs(driven)
        clipped = np.tanh(shaped).astype(np.float32)
        clipped, self._os_down_state = _stream_fir(clipped, kernel, self._os_down_state)
        return np.ascontiguousarray(clipped[::factor], dtype=np.float32)

    def _sync_handoff_meters(self):
        play = self.pending.snapshot()
        obs = self.obs_pending.snapshot()
        self.meters["underruns"] = play["underruns"]
        self.meters["overruns"] = play["overruns"]
        self.meters["obs_underruns"] = obs["underruns"]
        self.meters["obs_overruns"] = obs["overruns"]
        self.meters["drift_adds"] = play["drift_adds"] + obs["drift_adds"]
        self.meters["drift_drops"] = play["drift_drops"] + obs["drift_drops"]
        self.meters["jitter_ms"] = play["fill_ms"]
        self.meters["jitter"] = play["fill_ratio"]
        self.meters["xruns"] = self.xruns

    def _note_output_peak(self, block):
        peak = float(np.max(np.abs(block))) if block.size else 0.0
        self.meters["out"] = max(float(self.meters["out"]) * 0.85, peak)
        if peak >= 0.98:
            self._latch_flag("_out_clip_hold", "out_clip", True, 0, 0.4)
        if peak > 0.2 and not self.signaled_out:
            self.signaled_out = True
            print(f"Wrote output peak={peak:.3f}", flush=True)

    def _wait_primed(self, buffer, timeout):
        deadline = time.monotonic() + float(timeout)
        while self.running and time.monotonic() < deadline:
            if buffer.primed:
                return True
            time.sleep(0.002)
        return bool(buffer.primed)

    def render(self, indata, frames):
        source = self.source(indata).astype(np.float32, copy=False)
        self._push_tuner(source)
        raw_peak = float(np.max(np.abs(source))) if source.size else 0.0
        self.meters["in"] = max(float(self.meters["in"]) * 0.85, raw_peak)
        self._latch_flag("_in_clip_hold", "in_clip", raw_peak >= float(INPUT_CLIP_LEVEL), source.shape[0], 0.5)
        # Cheap rumble scrub: subtract a 64-sample boxcar (~1.3 ms @ 48 kHz). Vectorized, no per-sample Python.
        if source.shape[0] >= 8:
            kernel = np.float32(1.0 / 64.0)
            pad = np.pad(source, (63, 0), mode="edge")
            low = np.convolve(pad, np.full(64, kernel, dtype=np.float32), mode="valid")
            source = source - low
        peak = np.float32(np.max(np.abs(source)))
        coeff = np.float32(0.9 if peak > self.gate else 0.06)
        self.gate += (peak - self.gate) * coeff
        self.meters["gate"] = float(self.gate)
        if os.environ.get("AMP_GATE_OFF") != "1":
            # Slightly gentler open so quiet notes are less chopped (Warmath / clean DI).
            source = source * np.clip((self.gate - np.float32(0.015)) / np.float32(0.04), 0.0, 1.0)
        # Wah / resonant EQ before drive (Cry Baby-style into the amp).
        source = self._apply_wah(source)
        distorted = self._distort(source)
        distorted = self._apply_tone(distorted)
        distorted = self._apply_cab(distorted)
        self.cab_peak = float(np.max(np.abs(distorted))) if distorted.size else 0.0
        self.meters["cab"] = self.cab_peak
        frames = int(distorted.shape[0])
        positions = (self.write + self.offsets[:frames]) % self.ring_size
        echo1 = self.ring[(positions - self.delay_frames) % self.ring_size]
        echo2 = self.ring[(positions - 2 * self.delay_frames) % self.ring_size]
        echo3 = self.ring[(positions - 3 * self.delay_frames) % self.ring_size]
        doubled = self.ring[(positions - self.haas_frames) % self.ring_size]
        # 0.80 + 0.45 = 1.25; scale so the Haas pair cannot exceed the dry sample.
        wide_l = (np.float32(0.80) * distorted + np.float32(0.45) * doubled) * np.float32(0.8)
        wide_r = (np.float32(0.45) * distorted + np.float32(0.80) * doubled) * np.float32(0.8)
        # echo1 + fb²·echo3 would exceed the stored sample. Divide by 1+fb² so
        # the feedback sum stays at or below the post-cab level. fb itself is
        # at most 0.9, so the repeats decay.
        feedback = np.float32(min(0.9, max(0.0, float(self.feedback))))
        feedback_sq = feedback * feedback
        wet_scale = np.float32(1.0) / (np.float32(1.0) + feedback_sq)
        wet_l = wet_scale * (echo1 + feedback_sq * echo3)
        wet_r = feedback * echo2
        dry_mix = np.float32(1.0 - self.mix)
        left = (dry_mix * wide_l + np.float32(self.mix) * wet_l) * np.float32(self.volume)
        right = (dry_mix * wide_r + np.float32(self.mix) * wet_r) * np.float32(self.volume)
        pre_peak = 0.0
        if left.size:
            pre_peak = float(max(np.max(np.abs(left)), np.max(np.abs(right))))
        self.pre_peak = pre_peak
        self.meters["pre"] = pre_peak
        self._latch_flag(
            "_out_clip_hold",
            "out_clip",
            pre_peak > float(OUTPUT_CEILING),
            frames,
            0.4,
        )
        ears = np.column_stack((_output_limit(left), _output_limit(right))).astype(np.float32)
        self.ring[positions] = distorted
        self.write = (self.write + frames) % self.ring_size
        out_peak = float(np.max(np.abs(ears))) if ears.size else 0.0
        self.meters["out"] = max(float(self.meters["out"]) * 0.85, out_peak)
        return ears

    def input_callback(self, indata, frames, time_info, status):
        if status:
            self.xruns += 1
            self.meters["xruns"] = self.xruns
            print(status, file=sys.stderr)
        try:
            result = self.render(indata, frames)
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            if message != self._render_error:
                self._render_error = message
                print(f"Amp render error: {message}", file=sys.stderr, flush=True)
            self.xruns += 1
            self.meters["xruns"] = self.xruns
            result = np.zeros((frames, 2), dtype=np.float32)
        dropped = self.pending.push(result)
        if dropped and self.pending.overruns <= 3:
            print(
                f"Playback overrun #{self.pending.overruns}: dropped {dropped} unread samples",
                flush=True,
            )
        self._sync_handoff_meters()

    def as_ears(self, result, blocksize):
        if result.ndim == 1:
            result = np.column_stack((result, result))
        if result.shape[1] == 1:
            result = np.column_stack((result[:, 0], result[:, 0]))
        if result.shape[0] == blocksize:
            return np.ascontiguousarray(result[:, :2], dtype=np.float32)
        count = min(blocksize, result.shape[0])
        head = np.zeros((count, 2), dtype=np.float32)
        if count:
            head[:] = result[:count, :2]
        anchor = head[-1] if count else np.zeros(2, dtype=np.float32)
        return _conceal_underrun(head, blocksize, anchor)

    def headset_block(self, ears):
        left = ears[:, 0]
        right = ears[:, 1]
        block = np.empty((ears.shape[0], 2), dtype=np.float32)
        block[:, 1] = right * np.float32(0.5)
        block[:, 0] = (left + right) * np.float32(0.5)
        return block

    def _playback_block(self, ears, blocksize, channels, music, headset=False):
        if ears.shape[0] != blocksize or ears.ndim != 2 or ears.shape[1] < 2:
            ears = self.as_ears(ears, blocksize)
        if music is not None:
            bed = np.asarray(music.take(blocksize), dtype=np.float32).reshape(-1)
            if bed.shape[0] != blocksize:
                count = min(blocksize, int(bed.shape[0]))
                head = bed[:count] if count else np.zeros((0,), dtype=np.float32)
                anchor = head[-1:] if count else np.zeros((0,), dtype=np.float32)
                bed = _conceal_underrun(head.reshape(-1, 1), blocksize, anchor if count else np.zeros(1, np.float32))[:, 0]
            ears = np.column_stack(
                (
                    ears[:, 0] + np.float32(0.35) * bed,
                    ears[:, 1] + np.float32(0.35) * bed,
                )
            ).astype(np.float32)
            peak = float(np.max(np.abs(ears))) if ears.size else 0.0
            if peak > 0.98:
                ears *= np.float32(0.98 / peak)
                self._latch_flag("_out_clip_hold", "out_clip", True, 0, 0.4)
        self.publish_obs(ears)
        if headset and channels > 1:
            block = self.headset_block(ears)
        elif channels > 1:
            block = ears[:, :2]
        else:
            block = ears[:, 0].reshape(-1, 1)
        return np.ascontiguousarray(block, dtype=np.float32)

    def _next_playback(self, blocksize, channels, music, headset=False):
        ears, mode = self.pending.pull(blocksize)
        if mode == "wait":
            return None, mode
        if mode == "underrun" and (self.pending.underruns <= 3 or self.pending.underruns % 25 == 0):
            print(
                f"Playback underrun #{self.pending.underruns}: faded out instead of inserting silence",
                flush=True,
            )
        block = self._playback_block(ears, blocksize, channels, music, headset=headset)
        self._note_output_peak(block)
        self._sync_handoff_meters()
        return block, mode

    def pump_output(self, device, rate, blocksize, channels, music=None):
        self._wait_primed(self.pending, 0.6)
        with sd.OutputStream(
            device=device,
            samplerate=rate,
            blocksize=blocksize,
            channels=channels,
            dtype="float32",
            latency=0.021,
        ) as stream:
            while self.running:
                block, mode = self._next_playback(blocksize, channels, music, headset=True)
                if mode == "wait":
                    time.sleep(max(0.001, blocksize / float(rate) * 0.5))
                    continue
                stream.write(block)

    def publish_obs(self, ears):
        heard = np.ascontiguousarray(ears * np.float32(0.5), dtype=np.float32)
        self.obs_pending.push(heard)

    def pump_obs(self, rate, blocksize):
        sink = "processed_guitar"
        frame_bytes = blocksize * 2 * 4
        while self.running:
            self._wait_primed(self.obs_pending, 0.6)
            ensure_processed_guitar_sink()
            cmd = [
                "pw-cat",
                "--playback",
                "--raw",
                "--rate",
                str(rate),
                "--channels",
                "2",
                "--channel-map",
                "FL,FR",
                "--format",
                "f32",
                "--latency",
                PW_PLAYBACK_LATENCY,
                "--volume",
                "1",
                "--target",
                sink,
                "--properties",
                "application.name=GuitarAmp",
                "-",
            ]
            print(f"OBS capture: {sink}.monitor", flush=True)
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            threading.Thread(target=_drain_stderr, args=(proc,), daemon=True).start()
            _widen_playback_pipe(proc.stdin.fileno(), frame_bytes)
            try:
                while self.running and proc.poll() is None:
                    heard, mode = self.obs_pending.pull(blocksize)
                    if mode == "wait":
                        time.sleep(max(0.001, blocksize / float(rate) * 0.5))
                        continue
                    if mode == "underrun" and self.obs_pending.underruns <= 3:
                        print(
                            f"OBS underrun #{self.obs_pending.underruns}: faded out instead of inserting silence",
                            flush=True,
                        )
                    try:
                        proc.stdin.write(np.ascontiguousarray(heard, dtype=np.float32).tobytes())
                    except (BrokenPipeError, OSError):
                        break
                    self._sync_handoff_meters()
            finally:
                if proc.poll() is None:
                    try:
                        proc.stdin.close()
                    except OSError:
                        pass
                    proc.terminate()
                    try:
                        proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            if self.running:
                print("OBS capture stopped; retrying.", flush=True)
                time.sleep(0.4)

    def pump_pipewire(self, rate, blocksize, channels, sink_query, music=None):
        frame_bytes = blocksize * channels * 4
        while self.running:
            self._wait_primed(self.pending, 0.6)
            sink = wait_for_sink(sink_query, self)
            if sink is None:
                return
            cmd = [
                "pw-cat",
                "--playback",
                "--raw",
                "--rate",
                str(rate),
                "--channels",
                str(channels),
                "--channel-map",
                "FL,FR" if channels > 1 else "MONO",
                "--format",
                "f32",
                "--latency",
                PW_PLAYBACK_LATENCY,
                "--volume",
                "1",
                "--target",
                sink,
                "--properties",
                "application.name=GuitarAmp",
                "-",
            ]
            print(f"PipeWire output: {sink} ({PW_PLAYBACK_LATENCY})", flush=True)
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            threading.Thread(target=_drain_stderr, args=(proc,), daemon=True).start()
            _widen_playback_pipe(proc.stdin.fileno(), frame_bytes)
            try:
                while self.running and proc.poll() is None:
                    block, mode = self._next_playback(blocksize, channels, music, headset=False)
                    if mode == "wait":
                        time.sleep(max(0.001, blocksize / float(rate) * 0.5))
                        continue
                    try:
                        proc.stdin.write(block.tobytes())
                    except (BrokenPipeError, OSError):
                        break
            finally:
                if proc.poll() is None:
                    try:
                        proc.stdin.close()
                    except OSError:
                        pass
                    proc.terminate()
                    try:
                        proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            if self.running:
                self.signaled_out = False
                print("PipeWire output stopped; retrying.", flush=True)
                time.sleep(0.4)


def list_pipewire_sink_names():
    result = subprocess.run(["pactl", "list", "short", "sinks"], capture_output=True, text=True, check=False)
    names = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            names.append(parts[1])
    return names


def _is_usable_playback_sink(name):
    lowered = name.lower()
    return not any(marker in lowered for marker in _UNUSABLE_SINK_MARKERS)


def _rank_sink_name(name):
    lowered = name.lower()
    if "pro-output" in lowered:
        return 0
    if "analog" in lowered:
        return 1
    if "iec958" in lowered:
        return 2
    return 3


def _match_sink_among(names, query):
    if _blank(query):
        return None
    for name in names:
        if name == query:
            return name
    query_l = str(query).lower()
    matches = [name for name in names if query_l in name.lower()]
    if not matches:
        return None
    matches.sort(key=_rank_sink_name)
    return matches[0]


def _system_default_sink():
    result = subprocess.run(["pactl", "get-default-sink"], capture_output=True, text=True, check=False)
    name = (result.stdout or "").strip()
    return name or None


def pick_playback_sink(query=None):
    """Choose a live PipeWire playback sink.

    Explicit query: match if that sink is present. A missing device, including
    an unplugged Logitech headset, falls back instead of failing.
    Auto order: system default sink, then a connected Logitech headset, then
    Scarlett/Focusrite out, then the first non-dummy sink.
    """
    names = list_pipewire_sink_names()
    usable = [name for name in names if _is_usable_playback_sink(name)]

    if not _is_auto_pw_sink(query):
        hit = _match_sink_among(names, query)
        if hit and _is_usable_playback_sink(hit):
            return hit

    default = _system_default_sink()
    if default and default in names and _is_usable_playback_sink(default):
        return default

    headsets = [name for name in usable if _looks_like_logitech_sink(name)]
    if headsets:
        headsets.sort(key=_rank_sink_name)
        return headsets[0]

    for token in ("scarlett solo", "scarlett", "focusrite"):
        preferred = [name for name in usable if token in name.lower()]
        if preferred:
            preferred.sort(key=_rank_sink_name)
            return preferred[0]

    if usable:
        return sorted(usable, key=_rank_sink_name)[0]
    return None


def wait_for_sink(query, amp):
    announced = False
    while amp.running:
        sink = resolve_pipewire_sink(query)
        if sink:
            return sink
        if not announced:
            if _is_auto_pw_sink(query):
                print("Waiting for a usable PipeWire playback sink.", flush=True)
            else:
                print(
                    f"Waiting for PipeWire sink matching '{query}' "
                    "(will use system default / Scarlett if that device is gone).",
                    flush=True,
                )
            announced = True
        time.sleep(0.4)
    return None


def resolve_pipewire_sink(query):
    """Resolve a sink query, with auto-pick and soft fallback for missing devices."""
    return pick_playback_sink(query)


class MusicBus:
    """Backing-track audio for headset channel 2. Guitar stays on channel 1."""

    def __init__(self, source_query, rate, blocksize, amp):
        self.source_query = source_query
        self.rate = rate
        self.blocksize = blocksize
        self.amp = amp
        self.pending = queue.Queue(maxsize=8)
        self.signaled = False

    def take(self, frames):
        try:
            block = self.pending.get_nowait()
        except queue.Empty:
            return np.zeros(frames, dtype=np.float32)
        if block.shape[0] == frames:
            return block
        fitted = np.zeros(frames, dtype=np.float32)
        count = min(frames, block.shape[0])
        fitted[:count] = block[:count]
        return fitted

    def run(self):
        frame_bytes = self.blocksize * 2 * 4
        announced = False
        while self.amp.running:
            source = resolve_pipewire_source(self.source_query)
            if not source:
                if not announced:
                    print(f"Waiting for music source matching '{self.source_query}'.", flush=True)
                    announced = True
                time.sleep(0.4)
                continue
            announced = False
            cmd = [
                "parec",
                "-d",
                source,
                "--format=float32le",
                "--rate",
                str(self.rate),
                "--channels",
                "2",
                "--latency-msec=20",
                "--client-name=GuitarAmpMusic",
            ]
            print(f"Music channel 2: {source}", flush=True)
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            threading.Thread(target=_drain_stderr, args=(proc,), daemon=True).start()
            try:
                while self.amp.running and proc.poll() is None:
                    chunks = []
                    got = 0
                    while got < frame_bytes and proc.poll() is None:
                        piece = proc.stdout.read(frame_bytes - got)
                        if not piece:
                            break
                        chunks.append(piece)
                        got += len(piece)
                    raw = b"".join(chunks)
                    if len(raw) < frame_bytes:
                        break
                    stereo = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
                    mono = np.mean(stereo, axis=1).astype(np.float32)
                    peak = float(np.max(np.abs(mono)))
                    if peak > 0.02 and not self.signaled:
                        self.signaled = True
                        print(f"Music signal peak={peak:.3f}", flush=True)
                    try:
                        self.pending.put_nowait(mono.copy())
                    except queue.Full:
                        try:
                            self.pending.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            self.pending.put_nowait(mono.copy())
                        except queue.Full:
                            pass
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            if self.amp.running:
                print("Music channel stopped; retrying.", flush=True)
                time.sleep(0.4)


def resolve_pipewire_source(query):
    result = subprocess.run(["pactl", "list", "short", "sources"], capture_output=True, text=True, check=False)
    names = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            names.append(parts[1])
    for name in names:
        if name == query:
            return name
    query_l = query.lower()
    matches = [name for name in names if query_l in name.lower()]
    return matches[0] if matches else None


def ensure_processed_guitar_sink():
    listed = subprocess.run(["pactl", "list", "short", "sinks"], capture_output=True, text=True, check=False)
    if any(line.split()[1:2] == ["processed_guitar"] for line in listed.stdout.splitlines()):
        return
    subprocess.run(
        [
            "pactl",
            "load-module",
            "module-null-sink",
            "sink_name=processed_guitar",
            "sink_properties=device.description=ProcessedGuitar",
            "rate=48000",
            "channels=2",
        ],
        capture_output=True,
        check=False,
    )


def _drain_stderr(proc):
    if proc.stderr is None:
        return
    for raw in iter(proc.stderr.readline, b""):
        line = raw.decode(errors="replace").rstrip()
        if line:
            print(line, file=sys.stderr, flush=True)


def validate_params(
    feedback,
    mix,
    volume,
    wah_mix=None,
    wah_q=None,
    wah_freq=None,
    bass=None,
    mid=None,
    treble=None,
    presence=None,
    ir_mix=None,
    low_cut=None,
    high_cut=None,
):
    if not 0.0 <= feedback <= 0.9 or not 0.0 <= mix <= 1.0 or not 0.0 <= volume <= 4.0:
        raise ValueError("feedback must be 0-0.9; mix must be 0-1; volume must be 0-4")
    if wah_mix is not None and not 0.0 <= float(wah_mix) <= 1.0:
        raise ValueError("wah_mix must be 0-1")
    if wah_q is not None and not 0.4 <= float(wah_q) <= 16.0:
        raise ValueError("wah_q must be 0.4-16")
    if wah_freq is not None and not 120.0 <= float(wah_freq) <= 12000.0:
        raise ValueError("wah_freq must be 120-12000 Hz")
    for name, value in (("bass", bass), ("mid", mid), ("treble", treble), ("presence", presence), ("ir_mix", ir_mix)):
        if value is not None and not 0.0 <= float(value) <= 1.0:
            raise ValueError(f"{name} must be 0-1")
    if low_cut is not None and not 20.0 <= float(low_cut) <= 800.0:
        raise ValueError("low_cut must be 20-800 Hz")
    if high_cut is not None and not 1000.0 <= float(high_cut) <= 20000.0:
        raise ValueError("high_cut must be 1000-20000 Hz")


class AmpSession:
    """Runs the amp in background threads until stop() is called."""

    def __init__(self):
        self._lock = threading.Lock()
        self.amp = None
        self._input_stream = None
        self._threads = []
        self._error = None
        self.config = {}

    @property
    def running(self):
        with self._lock:
            return self.amp is not None and self.amp.running

    def status(self):
        with self._lock:
            if not self.amp:
                return {"running": False, "error": self._error, "config": self.config}
            meters = dict(self.amp.meters)
            tuner = dict(self.amp.tuner)
            return {
                "running": self.amp.running,
                "error": self._error,
                "config": self.config,
                "params": self.amp.params_snapshot(),
                "meters": meters,
                "tuner": tuner,
            }

    def apply_params(self, **kwargs):
        with self._lock:
            if not self.amp:
                raise RuntimeError("Amp is not running.")
            # Treat explicit None as "leave unchanged" (WS/REST often pass all keys).
            feedback = kwargs["feedback"] if kwargs.get("feedback") is not None else self.amp.feedback
            mix = kwargs["mix"] if kwargs.get("mix") is not None else self.amp.mix
            volume = kwargs["volume"] if kwargs.get("volume") is not None else self.amp.volume
            wah_mix = kwargs["wah_mix"] if kwargs.get("wah_mix") is not None else self.amp.wah_mix
            wah_q = kwargs["wah_q"] if kwargs.get("wah_q") is not None else self.amp.wah_q
            wah_freq = kwargs["wah_freq"] if kwargs.get("wah_freq") is not None else self.amp.wah_freq
            bass = kwargs["bass"] if kwargs.get("bass") is not None else self.amp.bass
            mid = kwargs["mid"] if kwargs.get("mid") is not None else self.amp.mid
            treble = kwargs["treble"] if kwargs.get("treble") is not None else self.amp.treble
            presence = kwargs["presence"] if kwargs.get("presence") is not None else self.amp.presence
            ir_mix = kwargs["ir_mix"] if kwargs.get("ir_mix") is not None else self.amp.ir_mix
            low_cut = kwargs["low_cut"] if kwargs.get("low_cut") is not None else self.amp.low_cut
            high_cut = kwargs["high_cut"] if kwargs.get("high_cut") is not None else self.amp.high_cut
            validate_params(
                feedback,
                mix,
                volume,
                wah_mix=wah_mix,
                wah_q=wah_q,
                wah_freq=wah_freq,
                bass=bass,
                mid=mid,
                treble=treble,
                presence=presence,
                ir_mix=ir_mix,
                low_cut=low_cut,
                high_cut=high_cut,
            )
            self.amp.apply_params(**kwargs)

    def start(self, config):
        with self._lock:
            if self.amp and self.amp.running:
                raise RuntimeError("Amp is already running.")
            self._error = None
        validate_params(
            config["feedback"],
            config["mix"],
            config["volume"],
            wah_mix=config.get("wah_mix", 0.0),
            wah_q=config.get("wah_q", 5.0),
            wah_freq=config.get("wah_freq", 900.0),
            bass=config.get("bass", 0.5),
            mid=config.get("mid", 0.5),
            treble=config.get("treble", 0.5),
            presence=config.get("presence", 0.5),
            ir_mix=config.get("ir_mix", 0.0),
            low_cut=config.get("low_cut", 80.0),
            high_cut=config.get("high_cut", 8000.0),
        )
        rate = int(config.get("rate", 48000))
        blocksize = int(config.get("blocksize") or os.environ.get("AMP_BLOCKSIZE") or 256)
        input_device, output_device, dev_meta = resolve_audio_devices(config)
        pw_sink = dev_meta["pw_sink"]
        input_info = sd.query_devices(input_device)
        if "scarlett" in input_info["name"].lower():
            input_channels = 2
        elif input_info["max_input_channels"] >= 2:
            input_channels = 2
        else:
            input_channels = 1
        if pw_sink:
            resolved = resolve_pipewire_sink(pw_sink)
            if resolved:
                output_label = f"PipeWire: {resolved}"
            elif _is_auto_pw_sink(pw_sink):
                output_label = "PipeWire: auto (system default / headset)"
            else:
                output_label = f"PipeWire sink matching '{pw_sink}' (fallback if missing)"
            output_channels = 2
            output_device = None
        else:
            output_info = sd.query_devices(output_device)
            output_channels = 2 if output_info["max_output_channels"] >= 2 else 1
            output_label = f"{output_info['name']} ({output_channels} ch)"
        amp = FastAmp(
            rate,
            config["delay_ms"],
            config["feedback"],
            config["mix"],
            config["drive"],
            config["volume"],
            wah_freq=float(config.get("wah_freq", 900.0)),
            wah_q=float(config.get("wah_q", 5.0)),
            wah_mix=float(config.get("wah_mix", 0.0)),
            bass=float(config.get("bass", 0.5)),
            mid=float(config.get("mid", 0.5)),
            treble=float(config.get("treble", 0.5)),
            presence=float(config.get("presence", 0.5)),
            ir=str(config.get("ir") or ""),
            ir_mix=float(config.get("ir_mix", 0.0)),
            low_cut=float(config.get("low_cut", 80.0)),
            high_cut=float(config.get("high_cut", 8000.0)),
            preset=str(config.get("preset") or ""),
        )
        stored = {
            "device": dev_meta["device"],
            "auto_detected": dev_meta["auto_detected"],
            "input_device": dev_meta["input_device"],
            "output_device": dev_meta["output_device"],
            "pw_sink": pw_sink,
            "music_source": config.get("music_source"),
            "rate": rate,
            "blocksize": blocksize,
            "input_name": input_info["name"],
            "output_label": output_label,
        }
        stored.update(amp.params_snapshot())

        def run_input():
            nonlocal amp
            try:
                with sd.InputStream(
                    device=input_device,
                    samplerate=rate,
                    blocksize=blocksize,
                    channels=input_channels,
                    dtype="float32",
                    latency=0.021,
                    callback=amp.input_callback,
                ):
                    while amp.running:
                        time.sleep(0.2)
            except Exception as error:
                with self._lock:
                    self._error = str(error)
                amp.running = False

        music = None
        threads = []
        if config.get("music_source"):
            if output_channels < 2:
                raise RuntimeError("Background music needs a stereo headset.")
            music = MusicBus(config["music_source"], rate, blocksize, amp)
            threads.append(threading.Thread(target=music.run, daemon=True))
        if pw_sink:
            threads.append(
                threading.Thread(
                    target=amp.pump_pipewire,
                    args=(rate, blocksize, output_channels, pw_sink, music),
                    daemon=True,
                )
            )
        else:
            threads.append(
                threading.Thread(
                    target=amp.pump_output,
                    args=(output_device, rate, blocksize, output_channels, music),
                    daemon=True,
                )
            )
        threads.append(threading.Thread(target=amp.pump_obs, args=(rate, blocksize), daemon=True))
        threads.append(threading.Thread(target=run_input, daemon=True))
        with self._lock:
            self.amp = amp
            self.config = stored
            self._threads = threads
        for thread in threads:
            thread.start()
        print("Fast Direct ALSA Guitar Amp (UI session)", flush=True)
        print(f"Input:  {input_info['name']} ({input_channels} ch)", flush=True)
        print(f"Output: {output_label}", flush=True)

    def stop(self):
        with self._lock:
            amp = self.amp
            if not amp:
                return
            amp.running = False
            self.amp = None
        for thread in self._threads:
            thread.join(timeout=2.0)
        self._threads = []