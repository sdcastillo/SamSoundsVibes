(function () {
  const PARAMS = ["drive", "delay_ms", "feedback", "mix", "volume", "wah_freq", "wah_q", "wah_mix"];
  const runState = document.querySelector("#run-state");
  const runDetail = document.querySelector("#run-detail");
  const wsState = document.querySelector("#ws-state");
  const errorEl = document.querySelector("#error");
  const startBtn = document.querySelector("#start");
  const stopBtn = document.querySelector("#stop");
  const deviceList = document.querySelector("#device-list");
  const advanced = document.querySelector(".advanced");

  let ws = null;
  let paramTimer = null;

  function showError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = "";
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function formatParam(name, value) {
    const n = Number(value);
    if (name === "delay_ms" || name === "wah_freq") return String(Math.round(n));
    return n.toFixed(2);
  }

  function readParams() {
    const out = {};
    PARAMS.forEach(function (name) {
      const el = document.querySelector("#" + name);
      out[name] = parseFloat(el.value);
      const label = document.querySelector("#out-" + name);
      if (label) {
        label.textContent = formatParam(name, out[name]);
      }
    });
    return out;
  }

  function applyParamsToUi(params) {
    if (!params) return;
    PARAMS.forEach(function (name) {
      if (params[name] === undefined) return;
      const el = document.querySelector("#" + name);
      el.value = params[name];
      const label = document.querySelector("#out-" + name);
      if (label) {
        label.textContent = formatParam(name, params[name]);
      }
    });
  }

  function applyMeters(meters) {
    if (!meters) return;
    ["mic", "inst", "gate", "out"].forEach(function (key) {
      const el = document.querySelector("#meter-" + key);
      if (el && meters[key] !== undefined) {
        el.value = Math.min(1, meters[key]);
      }
    });
  }

  function applyStatus(status) {
    const running = status && status.running;
    runState.textContent = running ? "Running" : "Stopped";
    runState.className = "pill " + (running ? "running" : "stopped");
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    if (status && status.config && status.config.input_name) {
      const auto = status.config.auto_detected ? " (auto)" : "";
      runDetail.textContent = running
        ? status.config.input_name + " → " + status.config.output_label + auto
        : status.error || "";
    } else if (status && status.error) {
      runDetail.textContent = status.error;
    } else {
      runDetail.textContent = running ? "" : "Scarlett Solo in → system default sink when you start";
    }
    applyParamsToUi(status && status.params);
    applyMeters(status && status.meters);
    if (typeof syncXyFromParams === "function") syncXyFromParams();
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(data.error || response.statusText);
    }
    return data;
  }

  async function refreshDevices() {
    const data = await api("/api/devices");
    deviceList.innerHTML = "";
    (data.devices || []).forEach(function (row) {
      const option = document.createElement("option");
      option.value = row.name;
      option.textContent =
        "[" + row.index + "] " + row.name + " (" + row.api + ") in:" + row.max_input_channels + " out:" + row.max_output_channels;
      deviceList.appendChild(option);
    });
  }

  function readAdvancedStartBody(body) {
    if (!advanced || !advanced.open) {
      return body;
    }
    const device = document.querySelector("#device").value.trim();
    const inputDevice = document.querySelector("#input-device").value.trim();
    const outputDevice = document.querySelector("#output-device").value.trim();
    const pwSink = document.querySelector("#pw-sink").value.trim();
    const musicSource = document.querySelector("#music-source").value.trim();
    if (device) body.device = device;
    if (inputDevice) body.input_device = inputDevice;
    if (outputDevice) body.output_device = outputDevice;
    if (pwSink) body.pw_sink = pwSink;
    if (musicSource) body.music_source = musicSource;
    return body;
  }

  if (deviceList) {
    deviceList.addEventListener("dblclick", function () {
      const name = deviceList.value;
      if (!name) return;
      advanced.open = true;
      const filter = name.split(" ")[0];
      document.querySelector("#device").value = filter;
    });
  }

  const refreshBtn = document.querySelector("#refresh-devices");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshDevices().catch(function (err) {
        showError(err.message);
      });
    });
  }

  startBtn.addEventListener("click", function () {
    showError("");
    const body = readAdvancedStartBody(readParams());
    api("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(applyStatus)
      .catch(function (err) {
        showError(err.message);
      });
  });

  stopBtn.addEventListener("click", function () {
    api("/api/stop", { method: "POST" })
      .then(applyStatus)
      .catch(function (err) {
        showError(err.message);
      });
  });

  PARAMS.forEach(function (name) {
    const el = document.querySelector("#" + name);
    el.addEventListener("input", function () {
      readParams();
      clearTimeout(paramTimer);
      paramTimer = setTimeout(pushParams, 80);
    });
  });


  /* —— X–Y touchpad —— */
  const XY_MAPS = {
    drive_mix: {
      doc: "X→drive · Y→wet mix",
      xLabel: "Drive →",
      yLabel: "↑ Wet",
      x: { param: "drive", min: 0, max: 40 },
      y: { param: "mix", min: 0, max: 1 },
    },
    delay_feedback: {
      doc: "X→delay · Y→feedback",
      xLabel: "Delay →",
      yLabel: "↑ Fbk",
      x: { param: "delay_ms", min: 50, max: 800 },
      y: { param: "feedback", min: 0, max: 0.9 },
    },
    drive_delay: {
      doc: "X→drive · Y→delay",
      xLabel: "Drive →",
      yLabel: "↑ Delay",
      x: { param: "drive", min: 0, max: 40 },
      y: { param: "delay_ms", min: 50, max: 800 },
    },
    wah_eq: {
      doc: "X→wah freq · Y→wah mix (Q from slider)",
      xLabel: "Wah Hz →",
      yLabel: "↑ Wah",
      x: { param: "wah_freq", min: 250, max: 2200, scale: "log" },
      y: { param: "wah_mix", min: 0, max: 1 },
    },
  };

  let xyNorm = { x: 0.5, y: 0.5 };
  let xyActive = false;
  let xyHold = false;
  let xyPointerId = null;

  function currentXyMap() {
    const key = (document.querySelector("#xy-map") || {}).value || "drive_mix";
    return XY_MAPS[key] || XY_MAPS.drive_mix;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function unlerp(a, b, v) {
    if (b === a) return 0.5;
    return clamp01((v - a) / (b - a));
  }

  function axisValue(axis, t) {
    if (axis.scale === "log") {
      const lo = Math.log(axis.min);
      const hi = Math.log(axis.max);
      return Math.exp(lo + (hi - lo) * t);
    }
    return lerp(axis.min, axis.max, t);
  }

  function axisNorm(axis, value) {
    if (axis.scale === "log") {
      const lo = Math.log(axis.min);
      const hi = Math.log(axis.max);
      if (hi === lo) return 0.5;
      return clamp01((Math.log(Math.max(axis.min, value)) - lo) / (hi - lo));
    }
    return unlerp(axis.min, axis.max, value);
  }

  function setParamValue(name, value) {
    const el = document.querySelector("#" + name);
    if (!el) return;
    el.value = value;
    const label = document.querySelector("#out-" + name);
    if (label) {
      label.textContent = formatParam(name, value);
    }
  }

  function updateXyReadout() {
    const map = currentXyMap();
    const xVal = axisValue(map.x, xyNorm.x);
    const yVal = axisValue(map.y, xyNorm.y);
    const ccX = Math.round(xyNorm.x * 127);
    const ccY = Math.round(xyNorm.y * 127);
    const outX = document.querySelector("#xy-out-x");
    const outY = document.querySelector("#xy-out-y");
    const ccXe = document.querySelector("#xy-cc-x");
    const ccYe = document.querySelector("#xy-cc-y");
    const doc = document.querySelector("#xy-map-doc");
    const lx = document.querySelector("#xy-label-x");
    const ly = document.querySelector("#xy-label-y");
    if (outX) outX.textContent = formatParam(map.x.param, xVal);
    if (outY) outY.textContent = formatParam(map.y.param, yVal);
    if (ccXe) ccXe.textContent = "CC12 · " + ccX;
    if (ccYe) ccYe.textContent = "CC13 · " + ccY;
    if (doc) doc.textContent = map.doc;
    if (lx) lx.textContent = map.xLabel;
    if (ly) ly.textContent = map.yLabel;
  }

  function placeXyCursor() {
    const cursor = document.querySelector("#xy-cursor");
    if (!cursor) return;
    // CSS: left/top as %; y grows upward for musical feel (bottom = 0)
    cursor.style.left = (xyNorm.x * 100) + "%";
    cursor.style.top = ((1 - xyNorm.y) * 100) + "%";
  }

  function applyXyToParams(push) {
    const map = currentXyMap();
    let xVal = axisValue(map.x, xyNorm.x);
    let yVal = axisValue(map.y, xyNorm.y);
    if (map.x.param === "delay_ms" || map.x.param === "wah_freq") xVal = Math.round(xVal);
    if (map.y.param === "delay_ms" || map.y.param === "wah_freq") yVal = Math.round(yVal);
    setParamValue(map.x.param, xVal);
    setParamValue(map.y.param, yVal);
    updateXyReadout();
    placeXyCursor();
    if (push) {
      clearTimeout(paramTimer);
      paramTimer = setTimeout(pushParams, 30);
    }
  }

  function syncXyFromParams() {
    if (xyActive || xyHold) return;
    const map = currentXyMap();
    const params = readParams();
    xyNorm.x = axisNorm(map.x, params[map.x.param]);
    xyNorm.y = axisNorm(map.y, params[map.y.param]);
    updateXyReadout();
    placeXyCursor();
  }

  function xyFromClient(clientX, clientY) {
    const pad = document.querySelector("#xy-pad");
    const rect = pad.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    xyNorm.x = clamp01((clientX - rect.left) / rect.width);
    xyNorm.y = clamp01(1 - (clientY - rect.top) / rect.height);
  }

  function initXyPad() {
    const pad = document.querySelector("#xy-pad");
    const mapSelect = document.querySelector("#xy-map");
    const holdBtn = document.querySelector("#xy-hold");
    if (!pad) return;

    function onPointerDown(event) {
      if (xyHold) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      xyActive = true;
      xyPointerId = event.pointerId;
      pad.classList.add("is-active");
      try { pad.setPointerCapture(event.pointerId); } catch (e) {}
      xyFromClient(event.clientX, event.clientY);
      applyXyToParams(true);
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!xyActive || event.pointerId !== xyPointerId) return;
      xyFromClient(event.clientX, event.clientY);
      applyXyToParams(true);
      event.preventDefault();
    }

    function onPointerUp(event) {
      if (event.pointerId !== xyPointerId) return;
      xyActive = false;
      xyPointerId = null;
      pad.classList.remove("is-active");
      try { pad.releasePointerCapture(event.pointerId); } catch (e) {}
      event.preventDefault();
    }

    pad.addEventListener("pointerdown", onPointerDown);
    pad.addEventListener("pointermove", onPointerMove);
    pad.addEventListener("pointerup", onPointerUp);
    pad.addEventListener("pointercancel", onPointerUp);
    // Block iOS Safari scroll/zoom while dragging the pad
    pad.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    pad.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

    if (mapSelect) {
      mapSelect.addEventListener("change", function () {
        syncXyFromParams();
        updateXyReadout();
      });
    }

    if (holdBtn) {
      holdBtn.addEventListener("click", function () {
        xyHold = !xyHold;
        holdBtn.setAttribute("aria-pressed", xyHold ? "true" : "false");
        holdBtn.textContent = xyHold ? "Held" : "Hold";
        if (xyHold) {
          xyActive = false;
          pad.classList.remove("is-active");
        }
      });
    }

    // Keyboard nudge for accessibility / desktop
    pad.addEventListener("keydown", function (event) {
      if (xyHold) return;
      const step = event.shiftKey ? 0.05 : 0.02;
      let handled = true;
      if (event.key === "ArrowLeft") xyNorm.x = clamp01(xyNorm.x - step);
      else if (event.key === "ArrowRight") xyNorm.x = clamp01(xyNorm.x + step);
      else if (event.key === "ArrowDown") xyNorm.y = clamp01(xyNorm.y - step);
      else if (event.key === "ArrowUp") xyNorm.y = clamp01(xyNorm.y + step);
      else handled = false;
      if (handled) {
        applyXyToParams(true);
        event.preventDefault();
      }
    });

    syncXyFromParams();
  }

  function pushParams() {
    const payload = { type: "params", ...readParams() };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    api("/api/params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readParams()),
    }).catch(function () {});
  }

  function connectWs() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/ws");
    ws.onopen = function () {
      wsState.textContent = "Live link on";
    };
    ws.onclose = function () {
      wsState.textContent = "Live link off — retrying…";
      setTimeout(connectWs, 1500);
    };
    ws.onmessage = function (event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (data.type === "status") {
        applyStatus(data);
      }
      if (data.type === "error") {
        showError(data.error);
      }
    };
    setInterval(function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 400);
  }

  readParams();
  initXyPad();
  api("/api/status")
    .then(applyStatus)
    .catch(function () {});
  connectWs();
})();