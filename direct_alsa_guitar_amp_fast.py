#!/usr/bin/env python3
import argparse
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
        api = apis[device['hostapi']]['name']
        print(f"[{index}] {device['name']} | API: {api} | in: {device['max_input_channels']} | out: {device['max_output_channels']}")


def choose_device(query, channels, direction):
    api_names = sd.query_hostapis()
    candidates = []
    for index, device in enumerate(sd.query_devices()):
        count = device['max_input_channels'] if direction == 'input' else device['max_output_channels']
        api = api_names[device['hostapi']]['name'].lower()
        if query.lower() in device['name'].lower() and count >= channels and api == 'alsa':
            candidates.append(index)
    if not candidates:
        raise RuntimeError(f"No ALSA {direction} device matching '{query}'. Use --list-devices.")
    return candidates[0]


class FastAmp:
    def __init__(self, rate, delay_ms, feedback, mix, drive, volume):
        self.drive = drive
        self.feedback = feedback
        self.mix = mix
        self.volume = volume
        self.delay_frames = max(1, round(rate * delay_ms / 1000.0))
        # Short double-track offset. The two ears get different mixes of the
        # live note and this copy, so the guitar is not the same in both cups.
        self.haas_frames = max(1, round(rate * 0.020))
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

    def source(self, indata):
        # Scarlett Solo capture is stereo: channel 0 is the mic, channel 1 is the instrument jack.
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
        peak = float(np.max(np.abs(source)))
        if peak > 0.03 and not self.signaled:
            self.signaled = True
            print(f'Input signal peak={peak:.3f} mic={mic:.3f} inst={inst:.3f}', flush=True)
        return source

    def render(self, indata, frames):
        source = self.source(indata)
        peak = np.float32(np.max(np.abs(source)))
        # Open quickly on a note, close slowly so high-gain sustain stays, and mute the idle hum.
        coeff = np.float32(0.9 if peak > self.gate else 0.06)
        self.gate += (peak - self.gate) * coeff
        if os.environ.get('AMP_GATE_OFF') != '1':
            source = source * np.clip((self.gate - np.float32(0.02)) / np.float32(0.03), 0.0, 1.0)
        driven = source * self.drive
        clipped = np.tanh(driven + 0.25 * driven * np.abs(driven))
        distorted = np.tanh(clipped * np.float32(3.5)).astype(np.float32)
        positions = (self.write + self.offsets[:frames]) % self.ring_size
        echo1 = self.ring[(positions - self.delay_frames) % self.ring_size]
        echo2 = self.ring[(positions - 2 * self.delay_frames) % self.ring_size]
        echo3 = self.ring[(positions - 3 * self.delay_frames) % self.ring_size]
        doubled = self.ring[(positions - self.haas_frames) % self.ring_size]
        # Equal loudness in each ear, different waveform. The live note leads
        # on the left; the 20 ms double leads on the right.
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
        # This Logi headset plays the left cup as channel 0 minus channel 1,
        # and the right cup as channel 1. Identical channels come out of one cup.
        left = ears[:, 0]
        right = ears[:, 1]
        block = np.empty((ears.shape[0], 2), dtype=np.float32)
        block[:, 1] = right * np.float32(0.5)
        block[:, 0] = (left + right) * np.float32(0.5)
        return block

    def pump_output(self, device, rate, blocksize, channels, music=None):
        # Blocking writes straight to the headset. That is the path that was audible.
        silence = np.zeros((blocksize, 2), dtype=np.float32)
        with sd.OutputStream(device=device, samplerate=rate, blocksize=blocksize,
                             channels=channels, dtype='float32', latency='high') as stream:
            while self.running:
                try:
                    result = self.pending.get(timeout=0.1)
                except queue.Empty:
                    result = silence
                ears = self.as_ears(result, blocksize)
                if music is not None:
                    bed = music.take(blocksize)
                    ears = np.column_stack((
                        ears[:, 0] + np.float32(0.35) * bed,
                        ears[:, 1] + np.float32(0.35) * bed,
                    )).astype(np.float32)
                # Cups play ears at half level. OBS gets that same stereo pair.
                self.publish_obs(ears)
                if channels > 1:
                    block = self.headset_block(ears)
                else:
                    block = ears[:, 0].reshape(-1, 1)
                stream.write(np.ascontiguousarray(block, dtype=np.float32))
                peak = float(np.max(np.abs(block[:, 0])))
                if peak > 0.2 and not self.signaled_out:
                    self.signaled_out = True
                    print(f'Wrote output peak={peak:.3f}', flush=True)

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
        # A copy of the headphone stereo, on a PipeWire monitor OBS can record.
        # This never shares the headset device, so a PipeWire stall cannot mute the cups.
        silence = np.zeros((blocksize, 2), dtype=np.float32)
        sink = 'processed_guitar'
        while self.running:
            ensure_processed_guitar_sink()
            cmd = [
                'pw-cat', '--playback', '--raw',
                '--rate', str(rate),
                '--channels', '2',
                '--channel-map', 'FL,FR',
                '--format', 'f32',
                '--latency', '20ms',
                '--volume', '1',
                '--target', sink,
                '--properties', 'application.name=GuitarAmp',
                '-',
            ]
            print(f'OBS capture: {sink}.monitor', flush=True)
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
                print('OBS capture stopped; retrying.', flush=True)
                time.sleep(0.4)

    def pump_pipewire(self, rate, blocksize, channels, sink_query):
        # Native PipeWire client. sounddevice's pulse plugin underruns, and
        # opening the headset hw device removes the sink other apps are using.
        silence = np.zeros((blocksize, channels), dtype=np.float32)
        frame_bytes = blocksize * channels * 4
        while self.running:
            sink = wait_for_sink(sink_query, self)
            if sink is None:
                return
            cmd = [
                'pw-cat', '--playback', '--raw',
                '--rate', str(rate),
                '--channels', str(channels),
                '--channel-map', 'FL,FR' if channels > 1 else 'MONO',
                '--format', 'f32',
                '--latency', '20ms',
                '--volume', '1',
                '--target', sink,
                '--properties', 'application.name=GuitarAmp',
                '-',
            ]
            print(f'PipeWire output: {sink}', flush=True)
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            threading.Thread(target=_drain_stderr, args=(proc,), daemon=True).start()
            try:
                fcntl.fcntl(proc.stdin.fileno(), 1031, frame_bytes)
            except OSError as error:
                print(f'Pipe buffer left at default size: {error}', flush=True)
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
                    if peak > 0.2 and not self.signaled_out:
                        self.signaled_out = True
                        print(f'Wrote output peak={peak:.3f}', flush=True)
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
                print('PipeWire output stopped; retrying.', flush=True)
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
    result = subprocess.run(['pactl', 'list', 'short', 'sinks'], capture_output=True, text=True, check=False)
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
        # hw:0,0 pro-audio is the playback path that reaches the headphone jack.
        if 'pro-output' in lowered:
            return 0
        if 'analog' in lowered:
            return 1
        if 'iec958' in lowered:
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
            # parec, not pw-cat. pw-cat never attached to this monitor and recorded silence.
            cmd = [
                'parec', '-d', source,
                '--format=float32le',
                '--rate', str(self.rate),
                '--channels', '2',
                '--latency-msec=20',
                '--client-name=GuitarAmpMusic',
            ]
            print(f'Music channel 2: {source}', flush=True)
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
                    raw = b''.join(chunks)
                    if len(raw) < frame_bytes:
                        break
                    stereo = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
                    mono = np.mean(stereo, axis=1).astype(np.float32)
                    peak = float(np.max(np.abs(mono)))
                    if peak > 0.02 and not self.signaled:
                        self.signaled = True
                        print(f'Music signal peak={peak:.3f}', flush=True)
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
                print('Music channel stopped; retrying.', flush=True)
                time.sleep(0.4)


def resolve_pipewire_source(query):
    result = subprocess.run(['pactl', 'list', 'short', 'sources'], capture_output=True, text=True, check=False)
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
    listed = subprocess.run(['pactl', 'list', 'short', 'sinks'], capture_output=True, text=True, check=False)
    if any(line.split()[1:2] == ['processed_guitar'] for line in listed.stdout.splitlines()):
        return
    subprocess.run([
        'pactl', 'load-module', 'module-null-sink',
        'sink_name=processed_guitar',
        'sink_properties=device.description=ProcessedGuitar',
        'rate=48000',
        'channels=2',
    ], capture_output=True, check=False)


def _drain_stderr(proc):
    if proc.stderr is None:
        return
    for raw in iter(proc.stderr.readline, b''):
        line = raw.decode(errors='replace').rstrip()
        if line:
            print(line, file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(description='Fast direct-ALSA guitar amp: distortion + multi-tap delay')
    parser.add_argument('--list-devices', action='store_true')
    parser.add_argument('--device', default='Scarlett', help='ALSA name used for input and output unless overridden')
    parser.add_argument('--input-device', default=None, help='ALSA input name; defaults to --device')
    parser.add_argument('--output-device', default=None, help='ALSA output name; defaults to --device')
    parser.add_argument('--pw-sink', default=None, help='PipeWire sink name or substring; mixes with other apps')
    parser.add_argument('--music-source', default=None, help='PipeWire source for headset channel 2 (background music)')
    parser.add_argument('--rate', type=int, default=48000)
    parser.add_argument('--blocksize', type=int, default=512)
    parser.add_argument('--drive', type=float, default=18.0)
    parser.add_argument('--delay-ms', type=float, default=380.0)
    parser.add_argument('--feedback', type=float, default=0.35)
    parser.add_argument('--mix', type=float, default=0.30)
    parser.add_argument('--volume', type=float, default=0.35)
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return
    if not 0.0 <= args.feedback <= 0.9 or not 0.0 <= args.mix <= 1.0 or not 0.0 <= args.volume <= 4.0:
        parser.error('feedback must be 0-0.9; mix must be 0-1; volume must be 0-4')

    try:
        input_query = args.input_device or args.device
        input_device = choose_device(input_query, 1, 'input')
        input_info = sd.query_devices(input_device)
        # The Solo's guitar is the second capture channel. A busy device can report
        # no inputs, and opening only one channel records the silent mic input.
        if 'scarlett' in input_info['name'].lower():
            input_channels = 2
        elif input_info['max_input_channels'] >= 2:
            input_channels = 2
        else:
            input_channels = 1
        if args.pw_sink:
            output_label = f"PipeWire sink matching '{args.pw_sink}'"
            output_channels = 2
        else:
            output_query = args.output_device or args.device
            output_device = choose_device(output_query, 1, 'output')
            output_info = sd.query_devices(output_device)
            output_channels = 2 if output_info['max_output_channels'] >= 2 else 1
            output_label = f"{output_info['name']} ({output_channels} ch)"
        amp = FastAmp(args.rate, args.delay_ms, args.feedback, args.mix, args.drive, args.volume)
        print('Fast Direct ALSA Guitar Amp')
        print(f"Input:  {input_info['name']} ({input_channels} ch)")
        print(f"Output: {output_label}")
        print(f"Drive={args.drive}, delay={args.delay_ms}ms, feedback={args.feedback}, mix={args.mix}, volume={args.volume}")
        print('Listening on both inputs; the instrument jack is preferred.')
        print('Stereo: live note leads on the left, 20 ms double leads on the right, delay alternates.')
        print('Set Scarlett DIRECT MONITOR to OFF. Press Ctrl+C to stop.')
        music = None
        if args.music_source:
            if output_channels < 2:
                raise RuntimeError('Background music needs a stereo headset.')
            music = MusicBus(args.music_source, args.rate, args.blocksize, amp)
            threading.Thread(target=music.run, daemon=True).start()
            print('Channel 1 (left ear): guitar')
            print('Channel 2 (right ear): background music')
        if args.pw_sink:
            output_thread = threading.Thread(
                target=amp.pump_pipewire,
                args=(args.rate, args.blocksize, output_channels, args.pw_sink),
                daemon=True,
            )
        else:
            output_thread = threading.Thread(
                target=amp.pump_output,
                args=(output_device, args.rate, args.blocksize, output_channels, music),
                daemon=True,
            )
            threading.Thread(
                target=amp.pump_obs,
                args=(args.rate, args.blocksize),
                daemon=True,
            ).start()
        output_thread.start()
        try:
            with sd.InputStream(device=input_device, samplerate=args.rate, blocksize=args.blocksize,
                                channels=input_channels, dtype='float32', latency='high',
                                callback=amp.input_callback):
                while True:
                    time.sleep(0.5)
        finally:
            amp.running = False
    except KeyboardInterrupt:
        print('\nStopped.')
    except Exception as error:
        print(f'Audio error: {error}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
