(function () {
  const PARAMS = ["drive", "delay_ms", "feedback", "mix", "volume", "wah_freq", "wah_q", "wah_mix", "bass", "mid", "treble", "presence", "ir_mix"];
  let toneExtra = { low_cut: 80, high_cut: 8000, preset: "" };
  let presetCatalog = [];
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
      if (!el) return;
      out[name] = parseFloat(el.value);
      const label = document.querySelector("#out-" + name);
      if (label) {
        label.textContent = formatParam(name, out[name]);
      }
    });
    const ir = document.querySelector("#ir");
    if (ir) out.ir = ir.value;
    out.low_cut = toneExtra.low_cut;
    out.high_cut = toneExtra.high_cut;
    out.preset = toneExtra.preset;
    return out;
  }

  function applyParamsToUi(params) {
    if (!params) return;
    PARAMS.forEach(function (name) {
      if (params[name] === undefined) return;
      const el = document.querySelector("#" + name);
      if (!el) return;
      el.value = params[name];
      const label = document.querySelector("#out-" + name);
      if (label) {
        label.textContent = formatParam(name, params[name]);
      }
    });
    if (params.ir !== undefined) {
      const ir = document.querySelector("#ir");
      if (ir) ir.value = params.ir;
    }
    if (params.low_cut !== undefined) toneExtra.low_cut = params.low_cut;
    if (params.high_cut !== undefined) toneExtra.high_cut = params.high_cut;
    if (params.preset !== undefined) toneExtra.preset = params.preset;
  }

  let tunerCents = 0;

  function applyTuner(tuner) {
    const noteEl = document.querySelector("#tuner-note");
    const hzEl = document.querySelector("#tuner-hz");
    const centsEl = document.querySelector("#tuner-cents");
    const needle = document.querySelector("#tuner-needle");
    if (!noteEl || !needle) return;
    const active = tuner && tuner.active && tuner.note;
    if (!active) {
      tunerCents = 0;
      noteEl.textContent = "–";
      noteEl.className = "tuner-note";
      if (hzEl) hzEl.textContent = "Play a string";
      if (centsEl) centsEl.textContent = "0 cents";
      needle.style.left = "50%";
      document.querySelectorAll("#tuner-strings span").forEach(function (el) {
        el.classList.remove("is-target");
      });
      return;
    }
    const raw = Math.max(-50, Math.min(50, Number(tuner.cents) || 0));
    tunerCents = tunerCents * 0.45 + raw * 0.55;
    const inTune = Math.abs(raw) <= 5;
    noteEl.textContent = tuner.note + String(tuner.octave);
    noteEl.className = "tuner-note " + (inTune ? "is-in" : "is-off");
    if (hzEl) hzEl.textContent = Number(tuner.hz).toFixed(1) + " Hz";
    if (centsEl) {
      const shown = Math.round(tunerCents);
      const side = shown === 0 ? "" : shown > 0 ? " sharp" : " flat";
      centsEl.textContent = (shown > 0 ? "+" : "") + shown + " cents" + side;
    }
    needle.style.left = 50 + tunerCents + "%";
    document.querySelectorAll("#tuner-strings span").forEach(function (el) {
      el.classList.toggle("is-target", Number(el.dataset.midi) === tuner.midi);
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
    applyTuner(status && status.tuner);
    if (typeof syncXyFromParams === "function") syncXyFromParams();
  }

  function pageBase() {
    var path = location.pathname || "/";
    if (!path.endsWith("/")) path = path.replace(/[^/]+$/, "");
    return path;
  }

  async function api(path, options) {
    var rel = path.charAt(0) === "/" ? path.slice(1) : path;
    const response = await fetch(pageBase() + rel, options);
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
    if (!el) return;
    el.addEventListener("input", function () {
      readParams();
      clearTimeout(paramTimer);
      paramTimer = setTimeout(pushParams, 80);
    });
  });

  function presetLabel(preset) {
    const slot = String(preset.slot).padStart(3, "0");
    return slot + "  " + preset.name;
  }

  let fillingPresets = false;

  function fillPresetList(filter) {
    const select = document.querySelector("#preset-list");
    if (!select) return;
    const query = (filter || "").trim().toLowerCase();
    const current = select.value;
    fillingPresets = true;
    select.innerHTML = "";
    presetCatalog.forEach(function (preset) {
      const blob = (preset.name + " " + (preset.amp || "") + " " + (preset.cab || "")).toLowerCase();
      if (query && blob.indexOf(query) < 0) return;
      const option = document.createElement("option");
      option.value = String(preset.slot);
      option.textContent = presetLabel(preset);
      select.appendChild(option);
    });
    if (current && select.querySelector('option[value="' + current + '"]')) {
      select.value = current;
    }
    fillingPresets = false;
  }

  function fillIrs(names) {
    const ir = document.querySelector("#ir");
    if (!ir) return;
    const current = ir.value;
    ir.innerHTML = "";
    const off = document.createElement("option");
    off.value = "";
    off.textContent = "Cab off";
    ir.appendChild(off);
    (names || []).forEach(function (name) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name.replace(/\.wav$/i, "");
      ir.appendChild(option);
    });
    if (current) ir.value = current;
  }

  function showPreset(preset) {
    const meta = document.querySelector("#preset-meta");
    const chain = document.querySelector("#preset-chain");
    if (!preset) {
      if (meta) meta.textContent = "Pick a preset.";
      if (chain) chain.textContent = "";
      return;
    }
    if (meta) {
      meta.textContent = preset.name + " — " + (preset.amp || "No amp") + " · " + (preset.cab || "No cab");
    }
    if (chain) chain.textContent = preset.chain || "";
  }

  function loadPresetSlot(slot) {
    const select = document.querySelector("#preset-list");
    showError("");
    api("/api/preset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: slot }),
    })
      .then(function (data) {
        if (data.params) {
          toneExtra.low_cut = data.params.low_cut;
          toneExtra.high_cut = data.params.high_cut;
          toneExtra.preset = data.params.preset || "";
          applyParamsToUi(data.params);
        }
        showPreset(data.preset);
        if (select && data.preset) select.value = String(data.preset.slot);
        applyStatus(data);
        if (typeof syncXyFromParams === "function") syncXyFromParams();
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  function stepPreset(direction) {
    const select = document.querySelector("#preset-list");
    if (!select || !select.options.length) return;
    let index = select.selectedIndex;
    if (index < 0) index = direction > 0 ? -1 : 0;
    index = Math.max(0, Math.min(select.options.length - 1, index + direction));
    select.selectedIndex = index;
    loadPresetSlot(parseInt(select.options[index].value, 10));
  }

  const presetSearch = document.querySelector("#preset-search");
  const presetList = document.querySelector("#preset-list");
  if (presetSearch) {
    presetSearch.addEventListener("input", function () {
      fillPresetList(presetSearch.value);
    });
  }
  if (presetList) {
    presetList.addEventListener("change", function () {
      if (fillingPresets || !presetList.value) return;
      loadPresetSlot(parseInt(presetList.value, 10));
    });
  }
  const presetPrev = document.querySelector("#preset-prev");
  const presetNext = document.querySelector("#preset-next");
  if (presetPrev) presetPrev.addEventListener("click", function () { stepPreset(-1); });
  if (presetNext) presetNext.addEventListener("click", function () { stepPreset(1); });
  const irSelect = document.querySelector("#ir");
  if (irSelect) {
    irSelect.addEventListener("change", function () {
      const mix = document.querySelector("#ir_mix");
      if (irSelect.value && mix && parseFloat(mix.value) === 0) {
        mix.value = "1";
      }
      if (!irSelect.value && mix) mix.value = "0";
      readParams();
      clearTimeout(paramTimer);
      paramTimer = setTimeout(pushParams, 40);
    });
  }


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
    ws = new WebSocket(proto + "//" + location.host + pageBase() + "ws");
    ws.onopen = function () {
      wsState.textContent = "Live link on";
      if (!presetCatalog.length) loadFactoryPresets();
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
    }, 200);
  }

  let presetLoadTimer = null;

  function loadFactoryPresets() {
    const meta = document.querySelector("#preset-meta");
    api("/api/presets")
      .then(function (data) {
        presetCatalog = data.presets || [];
        if (!presetCatalog.length) {
          throw new Error("Factory preset list was empty.");
        }
        fillIrs(data.irs || []);
        fillPresetList((document.querySelector("#preset-search") || {}).value || "");
        if (meta && !document.querySelector("#preset-list").value) {
          meta.textContent = presetCatalog.length + " factory presets. Pick one.";
        }
        showError("");
        if (presetLoadTimer) {
          clearTimeout(presetLoadTimer);
          presetLoadTimer = null;
        }
      })
      .catch(function (err) {
        if (meta) meta.textContent = "Loading factory presets…";
        showError(err.message || "Could not load factory presets.");
        if (presetLoadTimer) clearTimeout(presetLoadTimer);
        presetLoadTimer = setTimeout(loadFactoryPresets, 1500);
      });
  }

  readParams();
  initXyPad();
  loadFactoryPresets();
  api("/api/status").then(applyStatus).catch(function () {});
  connectWs();
})();