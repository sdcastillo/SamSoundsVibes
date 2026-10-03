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


def _use_auto_device(config):
    device = config.get("device")
    if config.get("input_device") or config.get("output_device"):
        return False
    if device is None:
        return True
    text = str(device).strip()
    return not text or text.lower() == "auto"


def resolve_audio_devices(config):
    """Return (input_index, output_index, meta) from explicit filters or Scarlett auto-detect."""
    pw_sink = config.get("pw_sink") or None
    meta = {"auto_detected": False, "device": config.get("device"), "input_device": None, "output_device": None}

    if _use_auto_device(config):
        meta["auto_detected"] = True
        meta["device"] = "auto"
        input_device = auto_select_scarlett("input", 1)
        input_info = sd.query_devices(input_device)
        meta["input_device"] = input_info["name"]
        if pw_sink:
            meta["output_device"] = None
            return input_device, None, meta
        prefer = []
        lower = input_info["name"].lower()
        if "solo" in lower:
            prefer.append("solo")
        if "scarlett" in lower:
            prefer.append("scarlett")
        output_device = auto_select_scarlett("output", 1, prefer_substrings=prefer)
        output_info = sd.query_devices(output_device)
        meta["output_device"] = output_info["name"]
        return input_device, output_device, meta

    device_query = config.get("device") or "Scarlett"
    meta["device"] = device_query
    input_query = config.get("input_device") or device_query
    output_query = config.get("output_device") or device_query
    meta["input_device"] = input_query
    meta["output_device"] = output_query if not pw_sink else output_query
    input_device = choose_device(input_query, 1, "input")
    output_device = None if pw_sink else choose_device(output_query, 1, "output")
    return input_device, output_device, meta


class FastAmp:
    def __init__(self, rate, delay_ms, feedback, mix, drive, volume):
        self.rate = rate
        self.drive = drive
        self.feedback = feedback
        self.mix = mix
        self.volume = volume
        self._set_delay_ms(delay_ms)
        self.ring_size = self.delay_frames * 5 + 4096
        self.ring = np.zeros(self.ring_size, dtype=np.float32)
        self.write = 0
        self.offsets = np.arange(4096, dtype=np.int64)
        self.input_energy = np.zeros(2, dtype=np.float32)
        self.signaled = False
        self.signaled_out = False
        self.gate = np.float32(0.0)
        self.pending = queue.Queue(maxsize=16)
        self.obs_pending = queue.Queue(maxsize=8)
        self.running = True
        self.meters = {"mic": 0.0, "inst": 0.0, "gate": 0.0, "out": 0.0}

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

    def params_snapshot(self):
        return {
            "drive": self.drive,
            "delay_ms": self.delay_ms,
            "feedback": self.feedback,
            "mix": self.mix,
            "volume": self.volume,
        }

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

    def render(self, indata, frames):
        source = self.source(indata)
        peak = np.float32(np.max(np.abs(source)))
        coeff = np.float32(0.9 if peak > self.gate else 0.06)
        self.gate += (peak - self.gate) * coeff
        self.meters["gate"] = float(self.gate)
        if os.environ.get("AMP_GATE_OFF") != "1":
            source = source * np.clip((self.gate - np.float32(0.02)) / np.float32(0.03), 0.0, 1.0)
        driven = source * self.drive
        clipped = np.tanh(driven + 0.25 * driven * np.abs(driven))
        distorted = np.tanh(clipped * np.float32(3.5)).astype(np.float32)
        positions = (self.write + self.offsets[:frames]) % self.ring_size
        echo1 = self.ring[(positions - self.delay_frames) % self.ring_size]
        echo2 = self.ring[(positions - 2 * self.delay_frames) % self.ring_size]
        echo3 = self.ring[(positions - 3 * self.delay_frames) % self.ring_size]
        doubled = self.ring[(positions - self.haas_frames) % self.ring_size]
        wide_l = np.float32(0.80) * distorted + np.float32(0.45) * doubled
        wide_r = np.float32(0.45) * distorted + np.float32(0.80) * doubled
        wet_l = echo1 + (self.feedback ** 2) * echo3
        wet_r = self.feedback * echo2
        dry_mix = np.float32(1.0 - self.mix)
        left = (dry_mix * wide_l + np.float32(self.mix) * wet_l) * self.volume
        right = (dry_mix * wide_r + np.float32(self.mix) * wet_r) * self.volume
        ears = np.column_stack((np.tanh(left), np.tanh(right))).astype(np.float32)
        self.ring[positions] = distorted
        self.write = (self.write + frames) % self.ring_size
        out_peak = float(np.max(np.abs(ears)))
        self.meters["out"] = max(self.meters["out"] * 0.85, out_peak)
        return ears

    def input_callback(self, indata, frames, time_info, status):
        if status:
            print(status, file=sys.stderr)
        result = self.render(indata, frames)
        try:
            self.pending.put_nowait(result)
        except queue.Full:
            try:
                self.pending.get_nowait()
            except queue.Empty:
                pass
            try:
                self.pending.put_nowait(result)
            except queue.Full:
                pass

    def as_ears(self, result, blocksize):
        if result.ndim == 1:
            result = np.column_stack((result, result))
        if result.shape[0] != blocksize:
            fitted = np.zeros((blocksize, 2), dtype=np.float32)
            count = min(blocksize, result.shape[0])
            fitted[:count] = result[:count]
            result = fitted
        return result

    def headset_block(self, ears):
        left = ears[:, 0]
        right = ears[:, 1]
        block = np.empty((ears.shape[0], 2), dtype=np.float32)
        block[:, 1] = right * np.float32(0.5)
        block[:, 0] = (left + right) * np.float32(0.5)
        return block

    def pump_output(self, device, rate, blocksize, channels, music=None):
        silence = np.zeros((blocksize, 2), dtype=np.float32)
        with sd.OutputStream(
            device=device,
            samplerate=rate,
            blocksize=blocksize,
            channels=channels,
            dtype="float32",
            latency="high",
        ) as stream:
            while self.running:
                try:
                    result = self.pending.get(timeout=0.1)
                except queue.Empty:
                    result = silence
                ears = self.as_ears(result, blocksize)
                if music is not None:
                    bed = music.take(blocksize)
                    ears = np.column_stack(
                        (
                            ears[:, 0] + np.float32(0.35) * bed,
                            ears[:, 1] + np.float32(0.35) * bed,
                        )
                    ).astype(np.float32)
                self.publish_obs(ears)
                if channels > 1:
                    block = self.headset_block(ears)
                else:
                    block = ears[:, 0].reshape(-1, 1)
                stream.write(np.ascontiguousarray(block, dtype=np.float32))
                peak = float(np.max(np.abs(block[:, 0])))
                self.meters["out"] = max(self.meters["out"] * 0.85, peak)
                if peak > 0.2 and not self.signaled_out:
                    self.signaled_out = True
                    print(f"Wrote output peak={peak:.3f}", flush=True)

    def publish_obs(self, ears):
        heard = np.ascontiguousarray(ears * np.float32(0.5), dtype=np.float32)
        try:
            self.obs_pending.put_nowait(heard)
        except queue.Full:
            try:
                self.obs_pending.get_nowait()
            except queue.Empty:
                pass
            try:
                self.obs_pending.put_nowait(heard)
            except queue.Full:
                pass

    def pump_obs(self, rate, blocksize):
        silence = np.zeros((blocksize, 2), dtype=np.float32)
        sink = "processed_guitar"
        while self.running:
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
                "20ms",
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
            try:
                while self.running and proc.poll() is None:
                    try:
                        heard = self.obs_pending.get(timeout=0.1)
                    except queue.Empty:
                        heard = silence
                    if heard.shape[0] != blocksize:
                        fitted = np.zeros((blocksize, 2), dtype=np.float32)
                        count = min(blocksize, heard.shape[0])
                        fitted[:count] = heard[:count]
                        heard = fitted
                    try:
                        proc.stdin.write(np.ascontiguousarray(heard, dtype=np.float32).tobytes())
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
                print("OBS capture stopped; retrying.", flush=True)
                time.sleep(0.4)

    def pump_pipewire(self, rate, blocksize, channels, sink_query):
        silence = np.zeros((blocksize, channels), dtype=np.float32)
        frame_bytes = blocksize * channels * 4
        while self.running:
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
                "20ms",
                "--volume",
                "1",
                "--target",
                sink,
                "--properties",
                "application.name=GuitarAmp",
                "-",
            ]
            print(f"PipeWire output: {sink}", flush=True)
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            threading.Thread(target=_drain_stderr, args=(proc,), daemon=True).start()
            try:
                fcntl.fcntl(proc.stdin.fileno(), 1031, frame_bytes)
            except OSError as error:
                print(f"Pipe buffer left at default size: {error}", flush=True)
            try:
                while self.running and proc.poll() is None:
                    try:
                        result = self.pending.get(timeout=0.1)
                    except queue.Empty:
                        block = silence
                    else:
                        ears = self.as_ears(result, blocksize)
                        if channels > 1:
                            block = ears[:, :2]
                        else:
                            block = ears[:, 0].reshape(-1, 1)
                    block = np.ascontiguousarray(block, dtype=np.float32)
                    try:
                        proc.stdin.write(block.tobytes())
                    except (BrokenPipeError, OSError):
                        break
                    peak = float(np.max(np.abs(block)))
                    self.meters["out"] = max(self.meters["out"] * 0.85, peak)
                    if peak > 0.2 and not self.signaled_out:
                        self.signaled_out = True
                        print(f"Wrote output peak={peak:.3f}", flush=True)
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


def wait_for_sink(query, amp):
    announced = False
    while amp.running:
        sink = resolve_pipewire_sink(query)
        if sink:
            return sink
        if not announced:
            print(f"Waiting for PipeWire sink matching '{query}'.", flush=True)
            announced = True
        time.sleep(0.4)
    return None


def resolve_pipewire_sink(query):
    result = subprocess.run(["pactl", "list", "short", "sinks"], capture_output=True, text=True, check=False)
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
    if not matches:
        return None

    def rank(name):
        lowered = name.lower()
        if "pro-output" in lowered:
            return 0
        if "analog" in lowered:
            return 1
        if "iec958" in lowered:
            return 2
        return 3

    matches.sort(key=rank)
    return matches[0]


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


def validate_params(feedback, mix, volume):
    if not 0.0 <= feedback <= 0.9 or not 0.0 <= mix <= 1.0 or not 0.0 <= volume <= 4.0:
        raise ValueError("feedback must be 0-0.9; mix must be 0-1; volume must be 0-4")


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
            return {
                "running": self.amp.running,
                "error": self._error,
                "config": self.config,
                "params": self.amp.params_snapshot(),
                "meters": meters,
            }

    def apply_params(self, **kwargs):
        with self._lock:
            if not self.amp:
                raise RuntimeError("Amp is not running.")
            validate_params(
                kwargs.get("feedback", self.amp.feedback),
                kwargs.get("mix", self.amp.mix),
                kwargs.get("volume", self.amp.volume),
            )
            self.amp.apply_params(**kwargs)

    def start(self, config):
        with self._lock:
            if self.amp and self.amp.running:
                raise RuntimeError("Amp is already running.")
            self._error = None
        validate_params(config["feedback"], config["mix"], config["volume"])
        rate = int(config.get("rate", 48000))
        blocksize = int(config.get("blocksize", 512))
        pw_sink = config.get("pw_sink") or None
        input_device, output_device, dev_meta = resolve_audio_devices(config)
        input_info = sd.query_devices(input_device)
        if "scarlett" in input_info["name"].lower():
            input_channels = 2
        elif input_info["max_input_channels"] >= 2:
            input_channels = 2
        else:
            input_channels = 1
        if pw_sink:
            output_label = f"PipeWire sink matching '{pw_sink}'"
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
                    latency="high",
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
                    args=(rate, blocksize, output_channels, pw_sink),
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
