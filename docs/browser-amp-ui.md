# Browser guitar amp UI

Local web control panel for `direct_alsa_guitar_amp_fast.py` — same DSP engine, no cloud required.

## Requirements

- Linux with ALSA (Kali, Ubuntu, etc.) and usually PipeWire/Pulse (`pactl`, `pw-cat` for OBS routing and optional sinks).
- Python 3.10+.
- PortAudio runtime (Debian/Kali: `sudo apt install libportaudio2`).
- Audio interface (e.g. Focusrite Scarlett) with **direct monitor off** when using software monitoring.

## Install

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-amp-ui.txt
```

## Run the UI

From the **repo root** (must contain `guitar_amp_engine.py` and `amp_ui/`):

```bash
sudo apt install -y libportaudio2   # required or the server exits immediately
pip install -r requirements-amp-ui.txt
python3 -m amp_ui
# or: bash scripts/start-amp-ui.sh
```

Open **http://127.0.0.1:8790/** in a browser **on the same machine** while the terminal stays open.

Optional bind/port: `python3 -m amp_ui --host 127.0.0.1 --port 8790` or env `AMP_UI_HOST` / `AMP_UI_PORT`.

- **Start amp** — auto-detects a Focusrite Scarlett on ALSA for **input** (prefers **Scarlett Solo**, e.g. USB `1235:8211`) and plays back through an auto-picked PipeWire sink: Scarlett/Focusrite out if present, otherwise the system default sink, otherwise the first non-dummy sink. A missing Logitech headset is ignored. No device fields needed. Also starts the OBS `processed_guitar` tap when PipeWire is available.
- **Sliders** — drive, delay (ms), feedback, wet mix, volume, plus wah freq / Q / mix update live over WebSocket (REST fallback).
- **X–Y touchpad** — finger/mouse pad (ZONA / Kaoss-style) maps two axes to amp params. Default: **X = Drive**, **Y = Wet mix**. Alternate mappings: Delay/Feedback, Drive/Delay, or **Wah freq / Wah mix** (resonant bandpass EQ into the drive). **Hold** freezes the last position. Readout shows Kaoss-style CC12/CC13 for reference; values ride the same WebSocket param path (no separate MIDI stack). Touch-friendly for phone Safari over Tailscale (`0.0.0.0:8790`).
- **Advanced** (collapsed) — device list, manual filters, PipeWire sink, and background music source.

Optional fields match the CLI:

| UI field | CLI flag |
|----------|----------|
| Device name filter | `--device` |
| Input / output | `--input-device`, `--output-device` |
| PipeWire sink | `--pw-sink` (default: `@auto` = Scarlett out / system default / first real sink; set this to override) |
| Background music | `--music-source` |

## CLI

```bash
python3 direct_alsa_guitar_amp_fast.py --list-devices
python3 direct_alsa_guitar_amp_fast.py --drive 18 --delay-ms 380   # Scarlett Solo in, auto PipeWire out
python3 direct_alsa_guitar_amp_fast.py --pw-sink SomeOtherSink      # override the auto sink
python3 direct_alsa_guitar_amp_fast.py --output-device Scarlett     # direct ALSA out; skips PipeWire playback
```

## Architecture

- `guitar_amp_engine.py` — `FastAmp`, PipeWire/OBS helpers, and `AmpSession` for the server.
- `amp_ui/server.py` — FastAPI on `127.0.0.1:8790`, static UI in `amp_ui/static/`.
- `direct_alsa_guitar_amp_fast.py` — thin CLI wrapper importing the engine.

## Cloud / CI note

Cloud Agent VMs typically have **no real ALSA hardware**. You can still verify imports and that the server binds:

```bash
pip install -r requirements-amp-ui.txt
python3 -c "from guitar_amp_engine import FastAmp; print('engine ok')"
python3 amp_ui/server.py   # then curl http://127.0.0.1:8790/api/status
```

Starting the amp in cloud will fail at device open unless a virtual audio device exists — use your local Kali/Linux machine for live guitar.

## Troubleshooting

- **Browser “unable to connect” / blank page**
  - The server must be **running** in a terminal (`python3 -m amp_ui`). Do **not** open `index.html` as a `file://` URL — the UI needs `http://127.0.0.1:8790/`.
  - Install **PortAudio**: `sudo apt install libportaudio2`. Without it, Python raises `OSError: PortAudio library not found` and the server never starts.
  - Amp UI lives on `main` (merged via PR #2). Run from the repo root so `guitar_amp_engine.py` and `amp_ui/` are importable.
  - Confirm the port: look for `Guitar Amp UI → http://127.0.0.1:8790/` in the terminal. Test with `curl -s http://127.0.0.1:8790/api/status`.
- **No Scarlett found** — confirm USB (`lsusb` should show `1235:8211`), install `libportaudio2`, run `--list-devices`, or open **Advanced** and set a device filter.
- **Silent output** — check `pactl get-default-sink` / `pactl list short sinks`, or override with `--pw-sink` / `--output-device`. Scarlett direct monitor should stay off. A missing Logitech headset no longer blocks playback.
- **XY pad “cuts out” after a second** — on **Drive · Wet mix**, the bottom-left corner sets **drive=0** and **wet=0**, which is intentional silence (meters show Inst high / Out ~0). Nudge the pad up/right, raise Drive/Wet sliders, or use **Hold** after a good position. Not a PipeWire disconnect.
- **Gate too aggressive** — set `AMP_UI_GATE_OFF=1` or `AMP_GATE_OFF=1` in the environment before starting the server (same as CLI).
- **Latency / xruns** — default block size is **256** (~5.3 ms @ 48 kHz). Override with `--blocksize 512` or `AMP_BLOCKSIZE=512` if you hear clicks.