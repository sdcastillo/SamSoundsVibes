#!/usr/bin/env python3
"""Local browser UI for the guitar amp. Default bind 0.0.0.0 (override with AMP_UI_HOST)."""

import base64
import json
import os
import re
import sys
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
STATIC = ROOT / "static"
RECORDINGS = ROOT / "recordings"
RECORDINGS.mkdir(parents=True, exist_ok=True)
VALID_TAKE_PARTS = ("rhythm", "lead", "solo", "bass", "vocals")


def _env_host():
    return os.environ.get("AMP_UI_HOST", "0.0.0.0").strip() or "0.0.0.0"


def _env_port():
    return int(os.environ.get("AMP_UI_PORT", "8790"))


try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
except ImportError as error:
    print("Install amp UI deps: pip install -r requirements-amp-ui.txt", file=sys.stderr)
    raise SystemExit(1) from error

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
try:
    from guitar_amp_engine import AmpSession, list_devices_json, validate_params
    from amp_presets import apply_overrides, engine_params, get_preset, list_presets
except ImportError as error:
    print(
        "Missing guitar_amp_engine.py — run from the SamSoundsVibes repo root "
        f"(expected {REPO_ROOT / 'guitar_amp_engine.py'}).",
        file=sys.stderr,
    )
    raise SystemExit(1) from error

app = FastAPI(title="SamSounds Guitar Amp")
session = AmpSession()

PARAM_DEFAULTS = {
    "drive": 18.0,
    "delay_ms": 380.0,
    "feedback": 0.35,
    "mix": 0.30,
    "volume": 0.35,
    "wah_freq": 900.0,
    "wah_q": 5.0,
    "wah_mix": 0.0,
    "bass": 0.5,
    "mid": 0.5,
    "treble": 0.5,
    "presence": 0.5,
    "ir_mix": 0.0,
    "low_cut": 80.0,
    "high_cut": 8000.0,
    "octave_down": 0.0,
    "solo": 0.0,
    "autowah": 0.0,
    "aw_sens": 0.6,
    "aw_range": 0.7,
    "aw_q": 5.0,
    "aw_mix": 0.8,
}


def _engine_kwargs(payload, fill_defaults=False):
    """Slider updates send the keys they mean to change. Start fills the rest."""
    params = {}
    for key, default in PARAM_DEFAULTS.items():
        raw = payload.get(key)
        if raw is None or raw == "":
            if fill_defaults:
                params[key] = default
            continue
        params[key] = float(raw)
    if fill_defaults or payload.get("ir") is not None:
        params["ir"] = str(payload.get("ir") or "")
    if fill_defaults or payload.get("preset") is not None:
        params["preset"] = str(payload.get("preset") or "")
    return params


@app.get("/api/devices")
def api_devices():
    try:
        return {"devices": list_devices_json()}
    except Exception as error:
        return JSONResponse(status_code=500, content={"error": str(error)})


@app.get("/api/status")
def api_status():
    return session.status()


@app.post("/api/start")
async def api_start(payload: dict):
    if session.running:
        return JSONResponse(status_code=409, content={"error": "Amp is already running."})
    def _optional_str(key):
        value = payload.get(key)
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    requested_block = int(payload.get("blocksize") or 256)
    config = {
        "device": _optional_str("device"),
        "input_device": _optional_str("input_device"),
        "output_device": _optional_str("output_device"),
        "pw_sink": _optional_str("pw_sink"),
        "music_source": _optional_str("music_source"),
        "rate": int(payload.get("rate") or 48000),
        "blocksize": requested_block if requested_block in (256, 512) else 256,
        "drive": float(payload.get("drive") if payload.get("drive") is not None else 18.0),
        "delay_ms": float(payload.get("delay_ms") if payload.get("delay_ms") is not None else 380.0),
        "feedback": float(payload.get("feedback") if payload.get("feedback") is not None else 0.35),
        "mix": float(payload.get("mix") if payload.get("mix") is not None else 0.30),
        "volume": float(payload.get("volume") if payload.get("volume") is not None else 0.35),
    }
    config.update(_engine_kwargs(payload, fill_defaults=True))
    try:
        validate_params(
            config["feedback"],
            config["mix"],
            config["volume"],
            wah_mix=config["wah_mix"],
            wah_q=config["wah_q"],
            wah_freq=config["wah_freq"],
            bass=config["bass"],
            mid=config["mid"],
            treble=config["treble"],
            presence=config["presence"],
            ir_mix=config["ir_mix"],
            low_cut=config["low_cut"],
            high_cut=config["high_cut"],
            octave_down=config["octave_down"],
        )
        session.start(config)
    except (ValueError, RuntimeError) as error:
        return JSONResponse(status_code=400, content={"error": str(error)})
    return session.status()


@app.post("/api/stop")
def api_stop():
    session.stop()
    return session.status()


@app.post("/api/params")
async def api_params(payload: dict):
    if not session.running:
        return JSONResponse(status_code=409, content={"error": "Amp is not running."})
    try:
        session.apply_params(**_engine_kwargs(payload))
    except (ValueError, RuntimeError) as error:
        return JSONResponse(status_code=400, content={"error": str(error)})
    return session.status()


@app.websocket("/ws")
async def ws_control(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Expected JSON."})
                continue
            kind = message.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "status", **session.status()})
                continue
            if kind == "params":
                if session.running:
                    try:
                        session.apply_params(**_engine_kwargs(message))
                    except (ValueError, RuntimeError) as error:
                        await websocket.send_json({"type": "error", "error": str(error)})
                        continue
                await websocket.send_json({"type": "status", **session.status()})
                continue
            await websocket.send_json({"error": f"Unknown type: {kind}"})
    except WebSocketDisconnect:
        return


@app.get("/api/presets")
def api_presets():
    try:
        return list_presets()
    except Exception as error:
        return JSONResponse(status_code=500, content={"error": str(error)})


@app.post("/api/preset")
async def api_preset(payload: dict):
    try:
        preset = get_preset(slot=payload.get("slot"), name=payload.get("name"))
    except KeyError as error:
        return JSONResponse(status_code=404, content={"error": str(error)})
    except (TypeError, ValueError) as error:
        return JSONResponse(status_code=400, content={"error": str(error)})
    try:
        params = apply_overrides(engine_params(preset), payload.get("overrides"), payload.get("ir"))
    except (TypeError, ValueError) as error:
        return JSONResponse(status_code=400, content={"error": str(error)})
    if session.running:
        try:
            session.apply_params(**params)
        except (ValueError, RuntimeError) as error:
            return JSONResponse(status_code=400, content={"error": str(error)})
    view = {
        "slot": preset["slot"],
        "name": preset["name"],
        "amp": preset.get("amp") or "",
        "cab": preset.get("cab") or "",
        "chain": preset.get("chain") or "",
        "ir": params.get("ir") or "",
    }
    return {"preset": view, "params": params, **session.status()}


def _clean_part_id(part_id):
    cleaned = re.sub(r"[^a-z0-9_-]", "", str(part_id or "").strip().lower())
    return cleaned if cleaned in VALID_TAKE_PARTS else "rhythm"


def _wav_duration(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return round(float(frames) / float(rate), 2) if rate else 0.0
    except Exception:
        return 0.0


def _list_takes():
    takes = {}
    for part in VALID_TAKE_PARTS:
        for ext in (".wav", ".webm", ".ogg"):
            candidate = RECORDINGS / f"{part}{ext}"
            if candidate.is_file() and candidate.stat().st_size > 44:
                mtime = int(candidate.stat().st_mtime * 1000)
                takes[part] = {
                    "part": part,
                    "url": f"api/takes/{part}{ext}?t={mtime}",
                    "duration": _wav_duration(candidate) if ext == ".wav" else 0.0,
                    "size": candidate.stat().st_size,
                    "updated_ms": mtime,
                }
                break
    return takes


@app.get("/api/takes")
def api_takes():
    return {"takes": _list_takes(), "recording": session.status().get("recording")}


@app.post("/api/takes/start")
async def api_takes_start(payload: dict):
    part = _clean_part_id(payload.get("part"))
    amp_started = session.start_take(part)
    return {
        "ok": True,
        "part": part,
        "amp_capturing": amp_started,
        "takes": _list_takes(),
    }


@app.post("/api/takes/stop")
async def api_takes_stop(payload: dict = None):
    payload = payload or {}
    wav_bytes, duration, amp_part = session.stop_take()
    part = _clean_part_id(payload.get("part") or amp_part)
    saved_from_amp = False
    if wav_bytes and duration >= 0.15:
        for ext in (".webm", ".ogg"):
            old = RECORDINGS / f"{part}{ext}"
            if old.exists():
                old.unlink()
        target = RECORDINGS / f"{part}.wav"
        target.write_bytes(wav_bytes)
        saved_from_amp = True
    return {
        "ok": True,
        "part": part,
        "saved_from_amp": saved_from_amp,
        "duration": duration,
        "takes": _list_takes(),
    }


@app.post("/api/takes/upload")
async def api_takes_upload(payload: dict):
    part = _clean_part_id(payload.get("part"))
    raw_b64 = str(payload.get("audio_base64") or "").strip()
    if "," in raw_b64 and raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]
    if not raw_b64:
        return JSONResponse(status_code=400, content={"error": "Missing audio_base64"})
    ext = str(payload.get("ext") or ".wav").lower()
    if ext not in (".wav", ".webm", ".ogg"):
        ext = ".wav"
    try:
        audio_bytes = base64.b64decode(raw_b64)
    except Exception as error:
        return JSONResponse(status_code=400, content={"error": f"Invalid base64: {error}"})
    for other_ext in (".wav", ".webm", ".ogg"):
        old = RECORDINGS / f"{part}{other_ext}"
        if old.exists():
            old.unlink()
    target = RECORDINGS / f"{part}{ext}"
    target.write_bytes(audio_bytes)
    return {"ok": True, "part": part, "takes": _list_takes()}


@app.delete("/api/takes/{part_id}")
def api_takes_delete(part_id: str):
    part = _clean_part_id(part_id)
    for ext in (".wav", ".webm", ".ogg"):
        target = RECORDINGS / f"{part}{ext}"
        if target.exists():
            target.unlink()
    return {"ok": True, "part": part, "takes": _list_takes()}


@app.get("/api/takes/{filename}")
def api_takes_file(filename: str):
    match = re.match(r"^([a-z0-9_-]+)\.(wav|webm|ogg)$", filename.strip().lower())
    if not match:
        return JSONResponse(status_code=404, content={"error": "Invalid take filename"})
    part = _clean_part_id(match.group(1))
    ext = "." + match.group(2)
    target = RECORDINGS / f"{part}{ext}"
    if not target.is_file():
        return JSONResponse(status_code=404, content={"error": "Take not found"})
    media = "audio/wav" if ext == ".wav" else ("audio/webm" if ext == ".webm" else "audio/ogg")
    return FileResponse(target, media_type=media, headers={"Cache-Control": "no-store"})


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="SamSounds guitar amp browser UI")
    parser.add_argument("--host", default=_env_host(), help="Bind address (default 0.0.0.0 or AMP_UI_HOST)")
    parser.add_argument("--port", type=int, default=_env_port(), help="Port (default 8790 or AMP_UI_PORT)")
    args = parser.parse_args()
    url_host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    print(f"Guitar Amp UI → http://{url_host}:{args.port}/")
    print(f"Repo root: {REPO_ROOT}")
    print("Leave this terminal open. Use Ctrl+C to stop.")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()