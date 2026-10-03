#!/usr/bin/env python3
"""Local browser UI for the guitar amp. Bind to localhost only."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
HOST = "127.0.0.1"
PORT = 8790

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
except ImportError as error:
    print("Install amp UI deps: pip install -r requirements-amp-ui.txt", file=sys.stderr)
    raise SystemExit(1) from error

sys.path.insert(0, str(ROOT.parent))
from guitar_amp_engine import AmpSession, list_devices_json, validate_params

app = FastAPI(title="SamSounds Guitar Amp")
session = AmpSession()


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
    config = {
        "device": str(payload.get("device") or "Scarlett"),
        "input_device": payload.get("input_device"),
        "output_device": payload.get("output_device"),
        "pw_sink": payload.get("pw_sink") or None,
        "music_source": payload.get("music_source") or None,
        "rate": int(payload.get("rate") or 48000),
        "blocksize": int(payload.get("blocksize") or 512),
        "drive": float(payload.get("drive") if payload.get("drive") is not None else 18.0),
        "delay_ms": float(payload.get("delay_ms") if payload.get("delay_ms") is not None else 380.0),
        "feedback": float(payload.get("feedback") if payload.get("feedback") is not None else 0.35),
        "mix": float(payload.get("mix") if payload.get("mix") is not None else 0.30),
        "volume": float(payload.get("volume") if payload.get("volume") is not None else 0.35),
    }
    try:
        validate_params(config["feedback"], config["mix"], config["volume"])
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
        session.apply_params(
            drive=payload.get("drive"),
            delay_ms=payload.get("delay_ms"),
            feedback=payload.get("feedback"),
            mix=payload.get("mix"),
            volume=payload.get("volume"),
        )
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
                        session.apply_params(
                            drive=message.get("drive"),
                            delay_ms=message.get("delay_ms"),
                            feedback=message.get("feedback"),
                            mix=message.get("mix"),
                            volume=message.get("volume"),
                        )
                    except (ValueError, RuntimeError) as error:
                        await websocket.send_json({"type": "error", "error": str(error)})
                        continue
                await websocket.send_json({"type": "status", **session.status()})
                continue
            await websocket.send_json({"error": f"Unknown type: {kind}"})
    except WebSocketDisconnect:
        return


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


def main():
    print(f"Guitar Amp UI at http://{HOST}:{PORT}/")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
