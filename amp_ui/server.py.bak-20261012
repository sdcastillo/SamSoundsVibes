#!/usr/bin/env python3
"""Local browser UI for the guitar amp. Default bind 0.0.0.0 (override with AMP_UI_HOST)."""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
STATIC = ROOT / "static"


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
    from amp_presets import engine_params, get_preset, list_presets
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

    config = {
        "device": _optional_str("device"),
        "input_device": _optional_str("input_device"),
        "output_device": _optional_str("output_device"),
        "pw_sink": _optional_str("pw_sink"),
        "music_source": _optional_str("music_source"),
        "rate": int(payload.get("rate") or 48000),
        "blocksize": int(payload.get("blocksize") or 256),
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
    params = engine_params(preset)
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


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


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