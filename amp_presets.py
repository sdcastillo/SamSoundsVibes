"""Factory presets translated from the POD Go backup onto this amp.

The block list on each preset is the original POD Go chain. The ``play``
object is what FastAmp can sound: drive, tone, delay, wah, and one of the
cabinet impulse responses stored in the same backup. Line 6's amp models
are not in the file, so those knobs are mapped onto this amp's drive and
tone stack, and the cab block picks the closest impulse response we have.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent
FACTORY_PATH = REPO / "presets" / "factory.json"
IR_DIR = REPO / "irs"
PGB_PATH = REPO / "POD Go Backup 2023-Nov-08.pgb"

PLAY_KEYS = (
    "drive",
    "bass",
    "mid",
    "treble",
    "presence",
    "volume",
    "delay_ms",
    "feedback",
    "mix",
    "wah_freq",
    "wah_q",
    "wah_mix",
    "ir",
    "ir_mix",
    "low_cut",
    "high_cut",
    "preset",
)

_IR_AUDIO = {}


def _zlib_streams(buf: bytes):
    import zlib

    hits = []
    index = 0
    while index < len(buf) - 2:
        if buf[index] == 0x78 and buf[index + 1] in (0x01, 0x5E, 0x9C, 0xDA):
            try:
                decoder = zlib.decompressobj()
                out = decoder.decompress(buf[index:]) + decoder.flush()
            except zlib.error:
                index += 1
                continue
            if len(out) > 32:
                consumed = len(buf) - index - len(decoder.unused_data)
                hits.append(out)
                index += max(consumed, 2)
                continue
        index += 1
    return hits


def _wav_name(blob: bytes) -> str:
    pos = 12
    while pos + 8 <= len(blob):
        chunk_id = blob[pos : pos + 4]
        size = struct.unpack_from("<I", blob, pos + 4)[0]
        body = blob[pos + 8 : pos + 8 + size]
        if chunk_id == b"LIST" and body[:4] == b"INFO":
            cursor = 4
            while cursor + 8 <= len(body):
                tag = body[cursor : cursor + 4]
                tag_size = struct.unpack_from("<I", body, cursor + 4)[0]
                text = body[cursor + 8 : cursor + 8 + tag_size]
                if tag == b"INAM":
                    return text.split(b"\x00", 1)[0].decode("latin1").strip()
                cursor += 8 + tag_size + (tag_size & 1)
        pos += 8 + size + (size & 1)
    return ""


def read_wav_mono(path: Path) -> np.ndarray:
    """Return one mono float32 channel from a PCM16 or float32 wav."""
    with path.open("rb") as handle:
        blob = handle.read()
    if blob[:4] != b"RIFF" or blob[8:12] != b"WAVE":
        raise ValueError(f"Not a wav file: {path.name}")
    audio_format = channels = bits = None
    rate = None
    data = None
    pos = 12
    while pos + 8 <= len(blob):
        chunk_id = blob[pos : pos + 4]
        size = struct.unpack_from("<I", blob, pos + 4)[0]
        body = blob[pos + 8 : pos + 8 + size]
        if chunk_id == b"fmt " and len(body) >= 16:
            audio_format, channels, rate, _byte_rate, _align, bits = struct.unpack_from("<HHIIHH", body, 0)
        elif chunk_id == b"data":
            data = body
        pos += 8 + size + (size & 1)
    if data is None or audio_format is None:
        raise ValueError(f"Wav is missing fmt or data: {path.name}")
    if audio_format == 3 and bits == 32:
        samples = np.frombuffer(data, dtype="<f4").astype(np.float32, copy=True)
    elif audio_format == 1 and bits == 16:
        samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / np.float32(32768.0)
    elif audio_format == 1 and bits == 24:
        raise ValueError(f"24-bit wav is not used by these IRs: {path.name}")
    else:
        raise ValueError(f"Unsupported wav {path.name}: format={audio_format} bits={bits}")
    if channels > 1:
        samples = samples.reshape(-1, channels)[:, 0].copy()
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak > 1e-8:
        samples *= np.float32(0.35 / peak)
    if rate and rate != 48000 and samples.size:
        # POD Go IRs are 48 kHz. Resample with linear interpolation if one is not.
        length = int(round(samples.size * 48000 / float(rate)))
        grid = np.linspace(0.0, samples.size - 1, length, dtype=np.float64)
        samples = np.interp(grid, np.arange(samples.size), samples).astype(np.float32)
    return np.ascontiguousarray(samples, dtype=np.float32)


def ir_names():
    if not IR_DIR.is_dir():
        return []
    return sorted(path.name for path in IR_DIR.glob("*.wav"))


def ir_samples(name: str) -> np.ndarray:
    if not name:
        raise ValueError("No cabinet selected.")
    base = Path(name).name
    if base != name or base not in ir_names():
        raise ValueError(f"Unknown cabinet impulse response: {name}")
    cached = _IR_AUDIO.get(base)
    if cached is None:
        cached = read_wav_mono(IR_DIR / base)
        _IR_AUDIO[base] = cached
    return cached


def load_factory():
    if not FACTORY_PATH.is_file():
        raise FileNotFoundError(f"Missing factory presets: {FACTORY_PATH}")
    return json.loads(FACTORY_PATH.read_text(encoding="utf-8"))


def list_presets():
    catalog = load_factory()
    rows = []
    for preset in catalog["presets"]:
        rows.append(
            {
                "slot": preset["slot"],
                "name": preset["name"],
                "amp": preset.get("amp") or "",
                "cab": preset.get("cab") or "",
                "ir": preset["play"].get("ir") or "",
                "chain": preset.get("chain") or "",
            }
        )
    return {"setlist": catalog.get("setlist") or "Factory", "source": catalog.get("source") or "", "presets": rows, "irs": ir_names()}


def get_preset(slot=None, name=None):
    catalog = load_factory()
    if slot is not None and str(slot).strip() != "":
        wanted = int(slot)
        for preset in catalog["presets"]:
            if int(preset["slot"]) == wanted:
                return preset
        raise KeyError(f"No factory preset in slot {wanted}.")
    if name:
        needle = str(name).strip().lower()
        for preset in catalog["presets"]:
            if preset["name"].lower() == needle:
                return preset
        raise KeyError(f"No factory preset named {name!r}.")
    raise KeyError("Pass a preset slot or name.")


def engine_params(preset: dict) -> dict:
    play = dict(preset["play"])
    params = {key: play[key] for key in PLAY_KEYS if key in play}
    params["preset"] = preset["name"]
    return params


def _clip(value, lo, hi):
    return max(lo, min(hi, float(value)))


def _round(value, digits=4):
    if isinstance(value, float):
        return round(value, digits)
    return value


def _pretty_model(model: str) -> str:
    raw = str(model or "")
    if "ImpulseResponse" in raw:
        return "Cab IR"
    text = raw
    for prefix in ("HD2_", "VIC_", "P34_"):
        if text.startswith(prefix):
            text = text[len(prefix) :]
    for word in (
        "Amp",
        "Cab",
        "Dist",
        "Delay",
        "Reverb",
        "Compressor",
        "EQ_STATIC_",
        "EQ",
        "Pitch",
        "Phaser",
        "Flanger",
        "Chorus",
        "Tremolo",
        "Wah",
        "VolPan",
        "Filter",
        "Rotary",
        "FXLoop",
    ):
        if text.startswith(word) and len(text) > len(word):
            text = text[len(word) :]
            break
    for suffix in ("StereoV2", "Stereo", "Mono"):
        if text.endswith(suffix) and len(text) > len(suffix):
            text = text[: -len(suffix)]
    spaced = []
    for index, char in enumerate(text):
        prev = text[index - 1] if index else ""
        nxt = text[index + 1] if index + 1 < len(text) else ""
        speaker_x = char.lower() == "x" and prev.isdigit() and nxt.isdigit()
        after_speaker_x = char.isdigit() and prev.lower() == "x" and index >= 2 and text[index - 2].isdigit()
        if index and not speaker_x and not after_speaker_x and (
            (char.isupper() and prev.islower())
            or (char.isupper() and prev.isupper() and nxt.islower())
            or (char.isdigit() and prev.isalpha())
            or (char.isalpha() and prev.isdigit())
        ):
            spaced.append(" ")
        spaced.append(char)
    return "".join(spaced).replace("_", " ").strip() or raw


def _enabled_blocks(tone: dict):
    dsp = tone.get("dsp0") or {}
    blocks = []
    for value in dsp.values():
        if not isinstance(value, dict) or "@model" not in value:
            continue
        if not value.get("@enabled"):
            continue
        model = value["@model"]
        if model in ("P34_AppDSPFlowInput", "P34_AppDSPFlowOutput"):
            continue
        params = {}
        for key, item in value.items():
            if str(key).startswith("@"):
                continue
            if isinstance(item, (int, float, bool, str)):
                params[key] = _round(item) if isinstance(item, float) else item
        position = value.get("@position")
        blocks.append({"position": position if isinstance(position, int) else 99, "model": model, "params": params})
    blocks.sort(key=lambda block: block["position"])
    return blocks


def _first(blocks, predicate):
    for block in blocks:
        if predicate(block["model"]):
            return block
    return None


def _pick_ir(amp_model: str, cab_model: str, available: list[str]) -> str:
    if not available:
        return ""
    text = f"{amp_model} {cab_model}".lower()

    def has(*needles):
        return any(needle in text for needle in needles)

    def choose(*needles):
        for needle in needles:
            for name in available:
                if needle.lower() in name.lower():
                    return name
        return available[0]

    if has("greenback", "blackback", "1960", "bluebell", "silverbell", "plexi", "brit", "j45", "2204", "fawn", "essex", "match"):
        return choose("Marshall 2", "Marshall 4", "Marshall")
    if has("tweed", "deluxe", "princess", "fullerton", "grammatico", "fieldcoil", "mail", "twin"):
        return choose("Marshall 1", "Marshall")
    if has("revv", "angl", "fatality", "epic", "elektrik", "litigator", "voltage", "ubersonic", "mahadeva"):
        return choose("HG6", "HG")
    if has("bass", "svt", "svbeast", "cougar", "agua", "woody", "tuck", "8x10", "1x15", "1x18", "2x15", "6x10"):
        return choose("Mesa MKIIC+ TM 2", "Mesa")
    if has("cali", "rectif", "uber", "mandarin", "whowatt", "who watt", "v30", "mesa", "soldano", "solo", "derailed", "placater"):
        return choose("Mesa MKIIC+ TM1", "Mesa")
    return choose("Marshall 4", "Marshall")


_HIGH_GAIN = (
    "revvgenred",
    "caliivlead",
    "calirectifire",
    "line6fatality",
    "line6epic",
    "line6elektrik",
    "line6litigator",
    "anglmeteor",
    "sololeadod",
    "germanubersonic",
    "germanmahadeva",
    "voltagequeen",
    "placaterdirty",
    "cartographer",
    "archetypelead",
    "caliivr1",
    "calitexasch2",
)
_CRUNCH = (
    "brit2204",
    "britplexijump",
    "britplexibrt",
    "britplexinrm",
    "britj45",
    "sololeadcrunch",
    "pvpanama",
    "essexa30",
    "whowatt",
    "matchstick",
    "mandarin",
    "usdouble",
    "jazzrivet",
    "interstatezed",
    "derailedingrid",
    "a30fawn",
    "brittrem",
    "fullertonjump",
    "stoneage",
    "usprincess",
)


def _drive_for(amp: dict | None, blocks) -> float:
    boost = 0.0
    for block in blocks:
        model = block["model"].lower()
        if "dist" in model or model.startswith("hd2_dm4") or "fuzz" in model:
            params = block["params"]
            amount = params.get("Drive", params.get("Level", 0.5))
            try:
                boost += float(amount) * 6.0
            except (TypeError, ValueError):
                boost += 3.0
    if amp is None:
        return _clip(1.2 + boost, 0.0, 40.0)
    model = amp["model"].lower()
    try:
        knob = float(amp["params"].get("Drive", 0.45))
    except (TypeError, ValueError):
        knob = 0.45
    if any(token in model for token in _HIGH_GAIN):
        drive = 12.0 + knob * 24.0
    elif any(token in model for token in _CRUNCH):
        drive = 6.0 + knob * 16.0
    else:
        drive = 1.5 + knob * 8.0
    return _clip(drive + boost, 0.0, 40.0)


def _volume_for(amp: dict | None) -> float:
    if amp is None:
        return 0.4
    params = amp["params"]
    try:
        channel = float(params.get("ChVol", 0.75))
    except (TypeError, ValueError):
        channel = 0.75
    try:
        master = float(params.get("Master", 0.7))
    except (TypeError, ValueError):
        master = 0.7
    return _clip(0.5 * (0.35 + 0.65 * channel) * (0.55 + 0.45 * master), 0.12, 0.95)


def _tone_knob(params, key):
    if key not in params:
        return 0.5
    try:
        return _clip(float(params[key]), 0.0, 1.0)
    except (TypeError, ValueError):
        return 0.5


def _delay_from(block):
    params = block["params"] if block else {}
    try:
        seconds = float(params.get("Time", params.get("Left Time", 0.38)) or 0.38)
    except (TypeError, ValueError):
        seconds = 0.38
    if seconds <= 0.0 or seconds > 4.0:
        delay_ms = 380.0
    else:
        delay_ms = seconds * 1000.0
    try:
        feedback = float(params.get("Feedback", params.get("LeftFeedback", 0.35)) or 0.0)
    except (TypeError, ValueError):
        feedback = 0.35
    try:
        mix = float(params.get("Mix", params.get("MixL", 0.25)) or 0.0)
    except (TypeError, ValueError):
        mix = 0.25
    return _clip(delay_ms, 50.0, 800.0), _clip(feedback, 0.0, 0.9), _clip(mix, 0.0, 1.0)


def _reverb_from(block):
    params = block["params"] if block else {}
    try:
        decay = float(params.get("Decay", 0.4) or 0.4)
    except (TypeError, ValueError):
        decay = 0.4
    try:
        mix = float(params.get("Mix", 0.2) or 0.0)
    except (TypeError, ValueError):
        mix = 0.2
    delay_ms = _clip(140.0 + decay * 460.0, 50.0, 800.0)
    feedback = _clip(0.22 + decay * 0.45, 0.0, 0.85)
    return delay_ms, feedback, _clip(mix, 0.0, 1.0)


def _translate(name: str, blocks, available: list[str]) -> dict:
    amp = _first(blocks, lambda model: "Amp" in model and "Cab" not in model)
    cab = _first(blocks, lambda model: "Cab" in model or "Impulse" in model)
    delay = _first(blocks, lambda model: "Delay" in model or model.startswith("HD2_DL4"))
    reverb = _first(blocks, lambda model: "Reverb" in model)
    wah = _first(blocks, lambda model: "Wah" in model)
    amp_model = amp["model"] if amp else ""
    cab_model = cab["model"] if cab else ""
    ir = _pick_ir(amp_model, cab_model, available) if cab else ""
    cab_params = cab["params"] if cab else {}
    try:
        low_cut = float(cab_params.get("LowCut", 80.0))
    except (TypeError, ValueError):
        low_cut = 80.0
    try:
        high_cut = float(cab_params.get("HighCut", 8000.0))
    except (TypeError, ValueError):
        high_cut = 8000.0
    if delay:
        delay_ms, feedback, mix = _delay_from(delay)
        if reverb:
            _rev_ms, _rev_fb, rev_mix = _reverb_from(reverb)
            mix = _clip(mix + 0.45 * rev_mix, 0.0, 1.0)
    elif reverb:
        delay_ms, feedback, mix = _reverb_from(reverb)
    else:
        delay_ms, feedback, mix = 380.0, 0.2, 0.0
    wah_mix = 0.0
    wah_freq = 900.0
    wah_q = 5.0
    if wah:
        params = wah["params"]
        try:
            wah_mix = _clip(float(params.get("Mix", 1.0)), 0.0, 1.0)
        except (TypeError, ValueError):
            wah_mix = 1.0
        try:
            low = float(params.get("FcLow", 450.0))
            high = float(params.get("FcHigh", 1800.0))
            wah_freq = _clip((low + high) / 2.0, 250.0, 2200.0)
        except (TypeError, ValueError):
            wah_freq = 900.0
    amp_params = amp["params"] if amp else {}
    cab_label = _pretty_model(cab_model) if cab_model else "No cab"
    if cab and "Impulse" in cab_model:
        cab_label = f"IR {cab_params.get('Index', '?')}"
    return {
        "amp": _pretty_model(amp_model) if amp_model else "No amp",
        "cab": cab_label,
        "chain": " → ".join(_pretty_model(block["model"]) for block in blocks),
        "blocks": blocks,
        "play": {
            "preset": name,
            "drive": _round(_drive_for(amp, blocks), 2),
            "bass": _round(_tone_knob(amp_params, "Bass")),
            "mid": _round(_tone_knob(amp_params, "Mid")),
            "treble": _round(_tone_knob(amp_params, "Treble")),
            "presence": _round(_tone_knob(amp_params, "Presence")),
            "volume": _round(_volume_for(amp), 2),
            "delay_ms": _round(delay_ms, 1),
            "feedback": _round(feedback),
            "mix": _round(mix),
            "wah_freq": _round(wah_freq, 1),
            "wah_q": wah_q,
            "wah_mix": _round(wah_mix),
            "ir": ir,
            "ir_mix": 1.0 if ir else 0.0,
            "low_cut": _round(_clip(low_cut, 20.0, 800.0), 1),
            "high_cut": _round(_clip(high_cut, 1000.0, 20000.0), 1),
        },
    }


def build_factory(pgb_path: Path = PGB_PATH, ir_dir: Path = IR_DIR, out_path: Path = FACTORY_PATH):
    streams = _zlib_streams(pgb_path.read_bytes())
    wavs = [blob for blob in streams if blob[:4] == b"RIFF"]
    setlists = []
    for blob in streams:
        if blob[:1] != b"{":
            continue
        try:
            obj = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if obj.get("schema") == "L6Setlist":
            setlists.append(obj)
    factory = next(obj for obj in setlists if (obj.get("meta") or {}).get("name") == "Factory")
    ir_dir.mkdir(parents=True, exist_ok=True)
    used = set()
    available = []
    for blob in wavs:
        label = _wav_name(blob) or f"IR {len(available) + 1}"
        safe = "".join(char if char not in '\\/:*?"<>|' else " " for char in label).strip()
        filename = safe + ".wav"
        if filename in used:
            filename = f"{safe} {len(used) + 1}.wav"
        used.add(filename)
        (ir_dir / filename).write_bytes(blob)
        available.append(filename)
    presets = []
    for slot, preset in enumerate(factory["data"]["presets"]):
        meta = preset.get("meta") or {}
        name = meta.get("name") or f"Preset {slot}"
        tone = preset.get("tone") or {}
        blocks = _enabled_blocks(tone)
        translated = _translate(name, blocks, available)
        presets.append({"slot": slot, "name": name, **translated})
    payload = {
        "source": pgb_path.name,
        "setlist": "Factory",
        "edited": "2023-11-08",
        "application": (factory.get("meta") or {}).get("application"),
        "build": (factory.get("meta") or {}).get("build_sha"),
        "irs": available,
        "presets": presets,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    built = build_factory()
    print(f"presets {len(built['presets'])} irs {len(built['irs'])}")
    for preset in built["presets"][:4]:
        print(preset["slot"], preset["name"], preset["amp"], preset["cab"], preset["play"]["ir"], "drive", preset["play"]["drive"])
