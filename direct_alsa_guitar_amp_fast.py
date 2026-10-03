#!/usr/bin/env python3
import argparse
import sys
import threading
import time

import sounddevice as sd

from guitar_amp_engine import (
    FastAmp,
    MusicBus,
    list_devices,
    resolve_audio_devices,
    validate_params,
)


def main():
    parser = argparse.ArgumentParser(description='Fast direct-ALSA guitar amp: distortion + multi-tap delay')
    parser.add_argument('--list-devices', action='store_true')
    parser.add_argument(
        '--device',
        default=None,
        help='ALSA name substring for in/out (default: auto-detect Focusrite Scarlett Solo)',
    )
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
    try:
        validate_params(args.feedback, args.mix, args.volume)
    except ValueError as error:
        parser.error(str(error))

    try:
        dev_config = {
            'device': args.device,
            'input_device': args.input_device,
            'output_device': args.output_device,
            'pw_sink': args.pw_sink,
        }
        input_device, output_device, _dev_meta = resolve_audio_devices(dev_config)
        input_info = sd.query_devices(input_device)
        if 'scarlett' in input_info['name'].lower():
            input_channels = 2
        elif input_info['max_input_channels'] >= 2:
            input_channels = 2
        else:
            input_channels = 1
        if args.pw_sink:
            output_label = f"PipeWire sink matching '{args.pw_sink}'"
            output_channels = 2
            output_device = None
        else:
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
