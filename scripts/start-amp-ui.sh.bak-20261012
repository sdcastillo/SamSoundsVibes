#!/usr/bin/env bash
# Start the guitar amp browser UI from the repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/guitar_amp_engine.py" ]]; then
  echo "Missing guitar_amp_engine.py in $ROOT" >&2
  echo "Checkout branch cursor/browser-amp-ui-97ad or merge PR #2." >&2
  exit 1
fi

if ! python3 -c "import fastapi, uvicorn, sounddevice, numpy" 2>/dev/null; then
  echo "Installing Python deps…"
  python3 -m pip install -r requirements-amp-ui.txt
fi

HOST="${AMP_UI_HOST:-0.0.0.0}"
PORT="${AMP_UI_PORT:-8790}"
# Optional: AMP_BLOCKSIZE=512 for more stability; AMP_GATE_OFF=1 to disable the gate.
echo "Starting server on http://${HOST}:${PORT}/ (Tailscale peers: use this machine's Tailscale IP)"
exec python3 -m amp_ui --host "$HOST" --port "$PORT"