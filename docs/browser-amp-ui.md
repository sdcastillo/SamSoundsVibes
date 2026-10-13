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
- **Tuner** — McLeod pitch detection names the note from E2 up to C6 (the whole neck to the 20th fret).
- **Staff Lab** — the tuner reading drawn on a staff, plus note-reading games, scales, and songs. See [Staff Lab](#staff-lab) below. It stays visible on the Practice tab.
- **Sliders** — drive, delay (ms), feedback, wet mix, volume, plus wah freq / Q / mix update live over WebSocket (REST fallback).
- **X–Y touchpad** — finger/mouse pad (ZONA / Kaoss-style) maps two axes to amp params. Default: **X = Drive**, **Y = Wet mix**. Alternate mappings: Delay/Feedback, Drive/Delay, or **Wah freq / Wah mix** (resonant bandpass EQ into the drive). **Hold** freezes the last position. Readout shows Kaoss-style CC12/CC13 for reference; values ride the same WebSocket param path (no separate MIDI stack). Touch-friendly for phone Safari over Tailscale (`0.0.0.0:8790`).
- **Advanced** (collapsed) — device list, manual filters, PipeWire sink, and background music source.
- **Practice** — backing tracks, scales, a fretboard, and short lessons. The amp keeps running when you switch tabs. See [Practice mode](#practice-mode) below.

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

## Staff Lab

Under the tuner, across the full page width. Each note you play is placed on the staff and in guitar tab underneath it, with where to find it on a 12-fret neck. Wide screens show four bars per line, narrow ones two; notes are spaced by beat, so rhythms read the way they sound.

| Mode | What you do |
|------|-------------|
| Free play | Play anything. The last eight notes stay on the staff with their names, the written pitch, and every fret that plays them. |
| Note Quest | One note appears; play it. Six levels: open strings, low strings, high strings, all of first position, sharps and flats, and frets 5–12. **Practice** has no clock; the **60-second challenge** keeps a high score per level. 10 points a note, +5 within 10 cents, ×2 at a streak of 5, ×3 at 10. Two misses on a note shows it on the fretboard; **Hint** does the same (in the challenge it resets your streak). Notes you miss come up more often. |
| Scale Climb | Up and back down: C, G, and D major, E minor pentatonic (open), A minor pentatonic box 1, and a chromatic spider walk. Fretboard dots show where the next note is. Stars: three for no misses. |
| Songs | Public-domain melodies in written guitar pitch (Mary Had a Little Lamb, Twinkle Twinkle, Ode to Joy, Frère Jacques, Au clair de la lune, Jingle Bells, Happy Birthday) with real rhythms, bar lines, and time signatures. **Waits for me** goes note by note; **In time with the click** counts in one bar on the metronome and scores each note within 0.2 s early to 0.3 s late, with a playhead. **Hear the melody** plays it first. |
| Riffs & leads | A riff and a lead for each Practice backing track, written for its key, mode, chords, and tempo. **With the backing track** starts the track after a one-bar count-in, highlights the current note on the staff, tab, and fretboard, and scores every pass of the loop. **Waits for me** steps through it without the track. **Recommended guitar preset + IR** loads a factory preset with a tempo-synced delay and the cab IR that suits the style. |

The **Metronome** row sets BPM (type it, ±5, the slider, or **Tap tempo**) and time signature (2/4, 3/4, 4/4, 6/8 clicking eighths), with accented beat lights. Picking a song sets its tempo; a slower click is the easiest way to learn a hard passage. Clicks are pitched above the note detector, so they never register as notes.

**Hear it** plays the target note so you can match it by ear. Trophies, best scores, stars, and per-note accuracy are saved in the browser (`localStorage`). **Drill my weak notes** starts a round from the notes you miss most.

Under **Notation and input**:

- **Guitar staff** (default) — treble clef with the small 8: guitar music is written an octave above how it sounds, as in every method book. Low E sits under three ledger lines. **Grand staff** shows sounding pitch on treble and bass, like piano music.
- Note names under the staff, guitar tab under the staff, fretboard hints for scales and songs, and **Any octave counts** for beginners.
- **Timing offset** shifts scoring if your notes keep registering late (plus) or early (minus). The amp tuner path already allows 150 ms and the mic 60 ms.
- **Hear my guitar through** — the amp tuner (Scarlett, the default; the page polls faster while a lesson runs), **this device's microphone** (an acoustic guitar near a laptop; the browser only allows it on `http://127.0.0.1` or https, so not over plain Tailscale http), or **tap the fretboard** (no guitar, tapping plays the note).

One pluck is one note: a held note counts once, and the same note counts again after a gap or a fresh pick attack, so repeated notes in a melody work.

```bash
node amp_ui/practice/test_staff_core.js
node amp_ui/practice/test_riffs.js
python3 scripts/verify_amp_staff.py
python3 scripts/verify_practice_tones.py
```

## Practice mode

Open the UI, then the **Practice** tab. The tuner and Staff Lab stay visible. Play, pause, and loop a backing track while the guitar still goes through the amp. The track is played by the browser, not by the drive/cabinet chain, so open this page on the same computer as the amp if you want both in one headset or set of speakers. On a phone over Tailscale the track plays on the phone.

**Guitar (amp volume)** is the same Volume knob as the amp. **Backing track** is only the loop. The lit chord follows the playhead; tap a chord to jump to that bar.

The style menu filters the library. Each track shows its key, tempo, progression, and scales. Orange fretboard dots are the root, gold dots are the other scale notes, and blue dots are notes a scale adds beyond its pentatonic box (the flat 5 in a blues scale, the 2nd and flat 6 in natural minor, and so on). The note under each scale says when to use it on that progression and which note clashes.

**My file** loads a local audio file. Set the tonic and mode yourself. The page suggests scales and builds lessons from that key. Optional BPM and a space-separated progression (one chord per bar) enable the chord strip and live chord-tone highlighting. Key guessing is intentionally absent: the same pitches often fit the relative major, or the IV of a Dorian vamp, so an estimate would lie with confidence.

### Recommended tone, riffs, and leads

Each library track has a tone card with **Recommended guitar preset + IR**. It loads a factory preset that suits the style (Cold Shot for the blues, Brit 2204 for E minor rock, Taylor LIVE on a dreadnought IR for bluegrass, and so on), sets the delay to a note value at the track's tempo, and keeps your Volume where it is. The line under the button says why that tone fits. If the amp is stopped the sliders change and the tone is used when you press Start amp.

**Riffs and leads**, above the fretboard, shows the track's riff and lead as tab with the chord over each bar. While the track plays, the current note lights up in the tab and a dashed blue ring marks it on the fretboard. **Play along (scored)** hands the phrase to Staff Lab's Riffs & leads mode: one bar of count-in, then every note from your guitar is scored against the backing track, pass by pass. **Learn it note by note** waits for each note instead.

Every note you play shows up on the Practice fretboard too, with a line saying what it is over the current chord: green for a chord tone (with its degree, like ♭3 of Am7), gold for another scale note, red for outside the scale.

Riffs live in `amp_ui/static/practice/riffs.json`, keyed by track id. `tab` is one token per note: string letter (`e B G D A E`), fret, duration (`w h. h q. q e. e s`, default `q`), `r` plus a duration for a rest, and `|` between bars. `tone` is a factory `slot` and `name`, optional `ir` and `overrides` (drive, EQ, delay, feedback, mix, wah, ir_mix, cuts), and `why`. `node amp_ui/practice/test_riffs.js` checks that bars add up and match the progression, every note is in the track's scales, every bar touches its chord, and the preset, IR, and synced delay are real; `python3 scripts/verify_practice_tones.py` loads every tone through the same code as `/api/preset`.

### Lessons

Under Scales, each track has short lessons. Check off a step when you have it; the marks stay in this browser only. **Clear checkmarks for this track** resets that track.

| Lesson | What you practice |
| --- | --- |
| Learn the shape | The five pentatonic boxes, one at a time. **Full neck** clears the highlight. |
| Target the chord tones | Bright dots are chord tones of the current bar that also live in the selected scale. The line under the chords names anything the scale leaves out. |
| A phrase | Tab in that scale. Shipped phrases are even eighth notes. |
| Phrasing | A whole-step bend whose target is in the scale, plus a tip for space, vibrato, or call-and-response on this progression. |

### Add a track or a lesson

Catalog: `amp_ui/static/practice/tracks.json`. Audio: `amp_ui/static/practice/audio/`. The shipped wavs are original loops (drums, bass, and the written chords), dedicated to the public domain under CC0. Do not commit copyrighted backing tracks.

A new track needs `id`, `title`, `file`, `key`, `tonic`, `mode` (`minor`, `major`, `dorian`, or `mixolydian`), `bpm`, `timeSignature`, and `progression` (one chord symbol per bar). `genre` sets which style the filter shows. Omit `scales` and the UI suggests them. Omit `lessons` and the UI builds the four lessons above. `feel` (`shuffle`, `rock`, `pop`, `funk`, `house`, `hard-rock`, `strings`, `bluegrass`, `ambient`) is used only by the synthesizer. House, hard rock, strings, bluegrass, and ambient are rendered at 22.05 kHz mono so the files stay small. The page loads `tracks.json` and the loops from the same directory as `practice.js`, so a script tag of `/static/practice.js` and a relative `static/practice.js` both resolve.

To change a shipped progression and regenerate the audio:

```bash
python3 amp_ui/practice/generate_backing_tracks.py
```

If you supply `lessons`, that array replaces the automatic lessons. `kind` is `boxes`, `chord-tones`, `tab`, or `tip`. `scaleId` must match a scale on the track. A step’s `"box": 1` through `5` highlights that pentatonic box; the fret numbers are computed. Tab steps use `notes` (`{"string": "E", "fret": 5}` with strings `e B G D A E`, high e lowercase) or raw `tab` lines. A bend is `"bend": {"string": "B", "fret": 8, "semitones": 2}` and both the start note and the target have to belong to the scale.

```bash
node amp_ui/practice/test_theory.js
```

The same notes are in `amp_ui/README.md`, next to the signal-path writeup.

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
- **Latency / xruns** — default block size is **256** (~5.3 ms @ 48 kHz). The amp page’s **Block size** menu can switch the next Start to **512**. The same override is `--blocksize 512` or `AMP_BLOCKSIZE=512`.
- **Crackle or static on some cabinet / effect combinations** — the files in `irs/` peak near full scale, but they are not level-matched. Energy gain is about 2–2.7×, and the worst-case sum of the impulse runs from about 18 (Mesa / LX electric cabs) to about 70 (Dtar acoustics such as `106_Dtar_btq_finger-_ir.wav`). The drive stage is already near ±1, so those cabinets were convolved well past full scale; delay feedback and the Haas pair stacked on top, and the old final `tanh` flattened the wave into a buzz. Each IR is now normalized on load to a shared energy, then capped so that worst-case gain stays bounded, and a fixed trim sits between the cabinet and the delay. The final stage only softens peaks that are already near −6 dBFS. **Input clip** still means the Solo knob is at full scale. **Output limit** means the guitar is on that ceiling.
- **Crackle that tracks the buffer, not the cabinet** — the Scarlett and the headset are separate USB clocks. The amp keeps about **21 ms** of guitar audio between them, nudges the rate by a sample when that buffer drifts, and fades out if it ever runs dry instead of inserting a block of zeros. PipeWire playback is requested at **21 ms**. The status line shows **Buf**, **Underruns**, **Overruns**, **Xruns**, and **Drift**. A climbing underrun or xrun count is the reason to try block size 512.