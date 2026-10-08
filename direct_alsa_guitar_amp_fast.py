#!/usr/bin/env python3
import argparse
import sys
import threading
import time

import sounddevice as sd

from guitar_amp_engine import (
    DEFAULT_PW_SINK,
    FastAmp,
    MusicBus,
    _is_auto_pw_sink,
    list_devices,
    resolve_audio_devices,
    resolve_pipewire_sink,
    validate_params,
)


def main():
    parser = argparse.ArgumentParser(description='Fast direct-ALSA guitar amp: distortion + multi-tap delay')
    parser.add_argument('--list-devices', action='store_true')
    parser.add_argument(
        '--device',
        default=None,
        help='ALSA input name substring (default: auto-detect Focusrite Scarlett Solo)',
    )
    parser.add_argument('--input-device', default=None, help='ALSA input name; defaults to --device')
    parser.add_argument(
        '--output-device',
        default=None,
        help='Direct ALSA output name; skips the default auto PipeWire sink',
    )
    parser.add_argument(
        '--pw-sink',
        default=None,
        help=f'PipeWire playback sink (default: {DEFAULT_PW_SINK} = system default, else headset, else Scarlett)',
    )
    parser.add_argument('--music-source', default=None, help='PipeWire source for headset channel 2 (background music)')
    parser.add_argument('--rate', type=int, default=48000)
    parser.add_argument('--blocksize', type=int, default=256)
    parser.add_argument('--drive', type=float, default=18.0)
    parser.add_argument('--delay-ms', type=float, default=380.0)
    parser.add_argument('--feedback', type=float, default=0.35)
    parser.add_argument('--mix', type=float, default=0.30)
    parser.add_argument('--volume', type=float, default=0.35)
    parser.add_argument('--preset', default=None, help='Factory preset name or slot number from the POD Go backup')
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
        input_device, output_device, dev_meta = resolve_audio_devices(dev_config)
        pw_sink = dev_meta['pw_sink']
        input_info = sd.query_devices(input_device)
        if 'scarlett' in input_info['name'].lower():
            input_channels = 2
        elif input_info['max_input_channels'] >= 2:
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
            output_channels = 2 if output_info['max_output_channels'] >= 2 else 1
            output_label = f"{output_info['name']} ({output_channels} ch)"
        amp = FastAmp(args.rate, args.delay_ms, args.feedback, args.mix, args.drive, args.volume)
        if args.preset:
            from amp_presets import engine_params, get_preset

            preset = None
            try:
                slot = int(args.preset)
            except ValueError:
                slot = None
            if slot is not None and 0 <= slot <= 127:
                try:
                    preset = get_preset(slot=slot)
                except KeyError:
                    preset = None
            if preset is None:
                preset = get_preset(name=args.preset)
            params = engine_params(preset)
            validate_params(
                params["feedback"],
                params["mix"],
                params["volume"],
                wah_mix=params["wah_mix"],
                wah_q=params["wah_q"],
                wah_freq=params["wah_freq"],
                bass=params["bass"],
                mid=params["mid"],
                treble=params["treble"],
                presence=params["presence"],
                ir_mix=params["ir_mix"],
                low_cut=params["low_cut"],
                high_cut=params["high_cut"],
            )
            amp.apply_params(**params)
            print(f"Preset: {preset['name']} — {preset['amp']} / {preset['cab']}")
        print('Fast Direct ALSA Guitar Amp')
        print(f"Input:  {input_info['name']} ({input_channels} ch)")
        print(f"Output: {output_label}")
        snap = amp.params_snapshot()
        print(
            f"Drive={snap['drive']}, delay={snap['delay_ms']}ms, feedback={snap['feedback']}, mix={snap['mix']}, volume={snap['volume']}"
        )
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
        if pw_sink:
            output_thread = threading.Thread(
                target=amp.pump_pipewire,
                args=(args.rate, args.blocksize, output_channels, pw_sink, music),
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