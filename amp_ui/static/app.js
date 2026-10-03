(function () {
  const PARAMS = ["drive", "delay_ms", "feedback", "mix", "volume"];
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

  function readParams() {
    const out = {};
    PARAMS.forEach(function (name) {
      const el = document.querySelector("#" + name);
      out[name] = parseFloat(el.value);
      const label = document.querySelector("#out-" + name);
      if (label) {
        label.textContent = name === "delay_ms" ? String(out[name]) : out[name].toFixed(2);
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
        label.textContent = name === "delay_ms" ? String(params[name]) : Number(params[name]).toFixed(2);
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
      runDetail.textContent = running ? "" : "Scarlett Solo in → Logitech headset when you start";
    }
    applyParamsToUi(status && status.params);
    applyMeters(status && status.meters);
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
  api("/api/status")
    .then(applyStatus)
    .catch(function () {});
  connectWs();
})();
