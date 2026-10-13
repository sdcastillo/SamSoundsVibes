/* Staff Lab: play-along note reading, scales, and songs on the live staff. */
(function () {
  "use strict";
  var C = window.StaffCore;
  var root = document.getElementById("staff-lab");
  if (!C || !root) return;

  var NS = "http://www.w3.org/2000/svg";
  var STORE_KEY = "samsounds.stafflab.v1";
  var CHALLENGE_SECONDS = 60;
  var STAFF_W = 640;
  var HALF = 7;
  var TOP = 24;
  var TAB_GAP = 12;
  /* Seconds from pluck to onset event that the onset detector's start time doesn't cover. */
  var INPUT_LATENCY = { amp: 0.15, mic: 0.06, tap: 0 };

  function $(id) {
    return document.getElementById(id);
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function loadStore() {
    var s;
    try {
      s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (e) {
      s = {};
    }
    s.settings = Object.assign(
      {
        notation: "guitar",
        names: true,
        frets: true,
        tab: true,
        anyOctave: false,
        input: "amp",
        level: "open",
        round: "practice",
        scale: "c-major",
        song: "mary",
        timing: "wait",
        bpm: 80,
        meter: "4/4",
        riffTrack: "a-minor-blues",
        riffPhrase: "riff",
        offsetMs: 0,
      },
      s.settings || {}
    );
    ["best", "notes", "scales", "songs", "riffs", "trophies", "levelHits"].forEach(function (k) {
      if (!s[k] || typeof s[k] !== "object") s[k] = {};
    });
    return s;
  }

  var store = loadStore();
  var S = store.settings;
  var demoMode = (/[?&]labDemo=(\w+)/.exec(location.search || "") || [])[1] || "";

  function save() {
    if (demoMode) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {}
  }

  var state = {
    mode: "free",
    running: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    hits: 0,
    misses: 0,
    inTuneRun: 0,
    target: null,
    targetAt: 0,
    lastHit: null,
    missesOnTarget: 0,
    hint: false,
    pool: null,
    poolLabel: "",
    seq: [],
    frets: [],
    piece: null,
    timed: null,
    cursorBeat: null,
    layout: null,
    index: 0,
    pages: [],
    startedAt: 0,
    endsAt: 0,
    timer: null,
    played: null,
    trail: [],
    ampRunning: false,
    mutedUntil: 0,
    message: "",
  };

  var detector = C.createOnsetDetector({ stableMs: 110 });

  /* ---------- sound ---------- */

  var synth = { ctx: null, stopAt: 0, nodes: [] };

  function audioCtx() {
    if (!synth.ctx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      synth.ctx = new Ctx();
    }
    if (synth.ctx.state === "suspended") synth.ctx.resume();
    return synth.ctx;
  }

  function pluck(midi, when, length) {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = when || ctx.currentTime;
    var hz = C.midiToHz(midi);
    var out = ctx.createGain();
    var tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(Math.min(8000, hz * 8), t);
    tone.frequency.exponentialRampToValueAtTime(Math.max(200, hz * 2), t + 0.6);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, length || 1.1));
    [
      ["triangle", 1, 1],
      ["sine", 2, 0.35],
      ["sawtooth", 1, 0.08],
    ].forEach(function (p) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = p[0];
      osc.frequency.setValueAtTime(hz * p[1], t);
      g.gain.value = p[2];
      osc.connect(g);
      g.connect(tone);
      osc.start(t);
      osc.stop(t + Math.max(0.35, length || 1.1) + 0.05);
      synth.nodes.push(osc);
    });
    tone.connect(out);
    out.connect(ctx.destination);
    var endMs = now() + (t - ctx.currentTime + (length || 1.1)) * 1000 + 200;
    state.mutedUntil = Math.max(state.mutedUntil, endMs);
  }

  function stopSounds() {
    synth.nodes.forEach(function (osc) {
      try {
        osc.stop();
      } catch (e) {}
    });
    synth.nodes = [];
    synth.stopAt = 0;
  }

  function hearSequence(items, bpm) {
    var ctx = audioCtx();
    if (!ctx) return;
    stopSounds();
    var beat = 60 / (bpm || 96);
    var t = ctx.currentTime + 0.08;
    items.forEach(function (item) {
      if (!item.rest) pluck(item.note.midi, t, Math.min(1.2, item.beats * beat * 0.95));
      t += item.beats * beat;
    });
    synth.stopAt = now() + (t - ctx.currentTime) * 1000;
  }

  /* ---------- metronome ---------- */

  /* Clicks sit above 1100 Hz, the top of the pitch detector, and are too short to read as notes. */
  var metro = { on: false, start: 0, next: 0, count: 0, timer: null, meter: null, spc: 0.75, until: Infinity, nodes: [] };

  function meterById(id) {
    return C.METERS.filter(function (m) {
      return m.id === id;
    })[0] || C.METERS[2];
  }

  function click(t, accent) {
    var ctx = audioCtx();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(accent === 2 ? 1760 : accent === 1 ? 1480 : 1250, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent === 2 ? 0.32 : accent === 1 ? 0.2 : 0.14, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
    metro.nodes.push(osc);
    if (metro.nodes.length > 32) metro.nodes.shift();
  }

  function metroSchedule() {
    var ctx = audioCtx();
    if (metro.until !== Infinity && ctx.currentTime > metro.until + metro.spc) {
      metroStop();
      return;
    }
    while (metro.next < ctx.currentTime + 0.12 && metro.next < metro.until) {
      var m = metro.meter;
      click(metro.next, m.accents[metro.count % m.beats]);
      metro.count += 1;
      metro.next = metro.start + metro.count * metro.spc;
    }
  }

  /* opts.at: audio-clock time of the first click; opts.clicks: stop after this many. */
  function metroStart(opts) {
    opts = opts || {};
    var ctx = audioCtx();
    if (!ctx) return;
    metroStop();
    metro.meter = meterById(opts.meter || S.meter);
    metro.spc = 60 / (opts.bpm || S.bpm);
    metro.start = opts.at || ctx.currentTime + 0.1;
    metro.count = 0;
    metro.next = metro.start;
    metro.until = opts.clicks ? metro.start + (opts.clicks - 0.5) * metro.spc : Infinity;
    metro.on = true;
    metroSchedule();
    metro.timer = setInterval(metroSchedule, 25);
    renderMetro();
    loop();
  }

  function metroStop() {
    if (metro.timer) clearInterval(metro.timer);
    metro.timer = null;
    metro.on = false;
    metro.nodes.forEach(function (osc) {
      try {
        osc.stop();
      } catch (e) {}
    });
    metro.nodes = [];
    renderMetro();
  }

  function metroClickAt(t) {
    if (!metro.on || t < metro.start || t > metro.until + metro.spc) return -1;
    return Math.floor((t - metro.start) / metro.spc + 1e-6);
  }

  function renderMetro() {
    var lights = $("lab-beats");
    if (!lights) return;
    var m = metro.on ? metro.meter : meterById(S.meter);
    if (lights.childElementCount !== m.beats) {
      lights.innerHTML = "";
      for (var i = 0; i < m.beats; i++) {
        var dot = document.createElement("i");
        if (m.accents[i] === 2) dot.className = "is-down";
        else if (m.accents[i] === 1) dot.className = "is-mid";
        lights.appendChild(dot);
      }
    }
    var ctx = synth.ctx;
    var n = ctx ? metroClickAt(ctx.currentTime) : -1;
    var lit = n >= 0 && ctx.currentTime - (metro.start + n * metro.spc) < Math.min(0.15, metro.spc * 0.6) ? n % m.beats : -1;
    Array.prototype.forEach.call(lights.children, function (dot, i) {
      dot.classList.toggle("is-on", i === lit);
    });
    $("lab-metro-go").textContent = metro.on && metro.until === Infinity ? "Stop click" : "Start click";
    $("lab-metro-go").setAttribute("aria-pressed", metro.on ? "true" : "false");
  }

  /* One animation loop drives the beat lights, timed lessons, and the playhead. */
  var looping = false;
  function loop() {
    if (looping) return;
    looping = true;
    requestAnimationFrame(function frame() {
      renderMetro();
      if (state.timed) timedTick();
      if (metro.on || state.timed) requestAnimationFrame(frame);
      else {
        looping = false;
        renderMetro();
      }
    });
  }

  /* ---------- svg helpers ---------- */

  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, String(attrs[k]));
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function geometry(withTab) {
    var g = C.notation(S.notation);
    var staffH = TOP + (g.maxStep - g.minStep) * HALF + 34;
    var tabTop = staffH + 10;
    return {
      n: g,
      height: withTab ? tabTop + 5 * TAB_GAP + 18 : staffH,
      y: function (step) {
        return TOP + (g.maxStep - step) * HALF;
      },
      labelY: staffH - 10,
      tab: withTab
        ? {
            top: tabTop,
            bottom: tabTop + 5 * TAB_GAP,
            y: function (string) {
              return tabTop + (string - 1) * TAB_GAP;
            },
          }
        : null,
    };
  }

  function drawTabFrame(svg, tab, x0, x1) {
    var lines = el("g", { class: "lab-tab-lines" });
    for (var s = 1; s <= 6; s++) lines.appendChild(el("line", { x1: x0, x2: x1, y1: tab.y(s), y2: tab.y(s) }));
    svg.appendChild(lines);
    ["T", "A", "B"].forEach(function (letter, i) {
      svg.appendChild(el("text", { class: "lab-tab-clef", x: x0 + 12, y: tab.top + 15 + i * 17 }, letter));
    });
  }

  function drawTabNumber(svg, tab, item) {
    if (!item.tab) return;
    var y = tab.y(item.tab.string);
    var label = String(item.tab.fret);
    var g = el("g", { class: "lab-tabnum " + (item.cls || "") });
    g.appendChild(el("rect", { x: item.x - 4 - label.length * 3.6, y: y - 7, width: 8 + label.length * 7.2, height: 14, rx: 3 }));
    g.appendChild(el("text", { x: item.x, y: y + 4.5 }, label));
    svg.appendChild(g);
  }

  function drawRest(svg, geo, item) {
    var mid = geo.y(6);
    var x = item.x;
    var g = el("g", { class: "lab-rest " + (item.cls || "") });
    var d = item.dur;
    if (d === "w") g.appendChild(el("rect", { x: x - 7, y: geo.y(8), width: 14, height: 5 }));
    else if (d === "h" || d === "h.") g.appendChild(el("rect", { x: x - 7, y: mid - 5, width: 14, height: 5 }));
    else if (d === "q" || d === "q.") {
      g.appendChild(el("path", { d: "M" + (x - 3) + " " + (mid - 15) + " l7 8 l-6 6 l6 8 c-5 -2 -9 0 -5 6 c-8 -4 -6 -11 1 -9 l-6 -8 l5 -6 z" }));
    } else {
      var flags = d === "s" ? 2 : 1;
      g.appendChild(el("line", { class: "lab-rest-stem", x1: x + 4, y1: mid - 9, x2: x - 2, y2: mid + 11 }));
      for (var f = 0; f < flags; f++) g.appendChild(el("circle", { cx: x - 2 - f * 2, cy: mid - 6 + f * 8, r: 2.6 }));
    }
    if (d.slice(-1) === ".") g.appendChild(el("circle", { cx: x + 11, cy: mid - 3, r: 2 }));
    svg.appendChild(g);
  }

  function drawStaffFrame(svg, geo, opts) {
    var lines = el("g", { class: "lab-lines" });
    geo.n.lines.forEach(function (step) {
      lines.appendChild(el("line", { x1: 16, x2: STAFF_W - 10, y1: geo.y(step), y2: geo.y(step) }));
    });
    svg.appendChild(lines);
    if (geo.tab) drawTabFrame(svg, geo.tab, 16, STAFF_W - 10);
    svg.appendChild(el("text", { class: "lab-clef", x: 22, y: geo.y(4) + 10 }, "\uD834\uDD1E"));
    if (geo.n.id === "guitar") {
      svg.appendChild(el("text", { class: "lab-clef-8", x: 37, y: geo.y(-2) + 4 }, "8"));
    } else {
      svg.appendChild(el("text", { class: "lab-clef lab-bass", x: 24, y: geo.y(-4) + 30 }, "\uD834\uDD22"));
      svg.appendChild(el("line", { class: "lab-brace", x1: 16, x2: 16, y1: geo.y(10), y2: geo.y(-10) }));
    }
    if (opts && opts.meter) {
      var tops = geo.n.id === "guitar" ? [8] : [8, -4];
      tops.forEach(function (topStep) {
        svg.appendChild(el("text", { class: "lab-meter", x: 76, y: geo.y(topStep) + 7 }, String(opts.meter[0])));
        svg.appendChild(el("text", { class: "lab-meter", x: 76, y: geo.y(topStep - 4) + 7 }, String(opts.meter[1])));
      });
    }
  }

  function drawNote(svg, geo, item) {
    if (geo.tab) drawTabNumber(svg, geo.tab, item);
    if (item.rest) {
      drawRest(svg, geo, item);
      return;
    }
    var written = C.writtenNote(item.note, geo.n.id);
    var step = C.staffStep(written);
    var x = item.x;
    var y = geo.y(step);
    var g = el("g", { class: "lab-note " + (item.cls || "") });
    C.ledgerSteps(step, geo.n.id).forEach(function (s) {
      g.appendChild(el("line", { class: "lab-ledger", x1: x - 13, x2: x + 13, y1: geo.y(s), y2: geo.y(s) }));
    });
    if (written.accidental) {
      g.appendChild(el("text", { class: "lab-acc", x: x - 22, y: y + 6 }, C.accidentalGlyph(written.accidental)));
    }
    var dur = item.dur || "q";
    var hollow = dur === "w" || dur === "h" || dur === "h.";
    g.appendChild(
      el("ellipse", {
        class: "lab-head" + (hollow ? " is-hollow" : ""),
        cx: x,
        cy: y,
        rx: 7.6,
        ry: 5.3,
        transform: "rotate(-20 " + x + " " + y + ")",
      })
    );
    if (dur !== "w") {
      var up = C.stemUp(step, geo.n.id);
      var sx = up ? x + 6.9 : x - 6.9;
      var sy = up ? y - 34 : y + 34;
      g.appendChild(el("line", { class: "lab-stem", x1: sx, x2: sx, y1: y, y2: sy }));
      var flags = dur === "e" || dur === "e." ? 1 : dur === "s" ? 2 : 0;
      for (var f = 0; f < flags; f++) {
        var fy = sy + (up ? f * 8 : -f * 8);
        var d = up
          ? "M" + sx + " " + fy + " c 2 8 12 10 9 22 c 0 -8 -5 -12 -9 -14 z"
          : "M" + sx + " " + fy + " c 2 -8 12 -10 9 -22 c 0 8 -5 12 -9 14 z";
        g.appendChild(el("path", { class: "lab-flag", d: d }));
      }
    }
    if (dur.slice(-1) === ".") {
      g.appendChild(el("circle", { class: "lab-dot", cx: x + 13, cy: step % 2 === 0 ? y - 3.5 : y, r: 2.2 }));
    }
    if (item.tag) {
      g.appendChild(el("text", { class: "lab-tag", x: x, y: Math.min(y, geo.y(10)) - 26 }, item.tag));
    }
    if (S.names || item.forceName) {
      g.appendChild(el("text", { class: "lab-name", x: x, y: geo.labelY }, C.pitchClassName(written)));
    }
    svg.appendChild(g);
  }

  /* ---------- scenes ---------- */

  function playedIsFresh() {
    return state.played && now() - state.played.at < 1400;
  }

  function firstPosition(midi) {
    var spots = C.fretPositions(midi);
    return spots.length ? { string: spots[0].string, fret: spots[0].fret } : null;
  }

  function freeScene() {
    var gap = (STAFF_W - 200) / 8;
    var items = state.trail.map(function (entry, i) {
      var newest = i === state.trail.length - 1;
      return {
        note: entry.note,
        x: 128 + (8 - state.trail.length + i) * gap,
        cls: newest ? "is-live" : "is-ghost",
        forceName: newest,
        tab: firstPosition(entry.note.midi),
      };
    });
    return { items: items };
  }

  function questScene() {
    var items = [];
    if (state.target) {
      items.push({
        note: state.target,
        x: STAFF_W * 0.42,
        cls: "is-target",
        tag: "play this",
        forceName: state.hint,
        tab: state.hint ? firstPosition(state.target.midi) : null,
      });
    }
    if (playedIsFresh()) {
      items.push({
        note: state.played.note,
        x: STAFF_W * 0.62,
        cls: state.played.ok ? "is-ok" : "is-bad",
        tag: "you played",
        forceName: true,
        tab: firstPosition(state.played.midi),
      });
    }
    return { items: items };
  }

  function barsPerLine() {
    return STAFF_W >= 880 ? 4 : 2;
  }

  function buildPages(seq, piece) {
    var pages = [];
    var per = barsPerLine();
    for (var from = 0; from < piece.bars; from += per) {
      var to = Math.min(piece.bars, from + per);
      var start = seq.length;
      var end = seq.length;
      for (var i = 0; i < seq.length; i++) {
        if (start === seq.length && seq[i].bar >= from) start = i;
        if (seq[i].bar >= to) {
          end = i;
          break;
        }
      }
      pages.push({ from: from, to: to, start: start, end: end });
    }
    return pages;
  }

  function pageForBar(bar) {
    for (var p = 0; p < state.pages.length; p++) {
      if (bar >= state.pages[p].from && bar < state.pages[p].to) return state.pages[p];
    }
    return state.pages[state.pages.length - 1];
  }

  /* Bar k of a line spans a fixed width so beats line up line to line; a pickup bar is shorter. */
  function lineLayout(page) {
    var piece = state.piece;
    var per = barsPerLine();
    var x0 = page.from === 0 ? 108 : 70;
    var right = STAFF_W - 14;
    var pickupW = piece.pickup ? Math.max(0.4, piece.pickup / piece.perBar) : 1;
    var weights = [];
    for (var k = 0; k < per; k++) weights.push(page.from + k === 0 ? pickupW : 1);
    var total = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var unit = (right - x0) / total;
    var bars = [];
    var x = x0;
    for (k = 0; k < page.to - page.from; k++) {
      var bar = page.from + k;
      var startPos = bar === 0 && piece.pickup ? piece.perBar - piece.pickup : 0;
      bars.push({ bar: bar, x: x, w: weights[k] * unit, startPos: startPos, len: piece.perBar - startPos });
      x += weights[k] * unit;
    }
    function xFor(bar, pos) {
      var b = bars[bar - page.from];
      if (!b) return null;
      return b.x + 18 + ((pos - b.startPos) / b.len) * (b.w - 30);
    }
    return {
      bars: bars,
      xFor: xFor,
      xForBeat: function (beat) {
        var bar = Math.floor(beat / piece.perBar + 1e-9);
        if (bar < page.from || bar >= page.to) return null;
        var b = bars[bar - page.from];
        var pos = Math.max(b.startPos, beat - bar * piece.perBar);
        return b.x + 18 + ((pos - b.startPos) / b.len) * (b.w - 30);
      },
    };
  }

  function noteClass(i) {
    if (state.timed) {
      var st = state.timed.judge.status(i);
      if (st === "hit") return "is-hit";
      if (st === "miss") return "is-missed";
      return i === state.index && state.running ? "is-target" : "is-todo";
    }
    return i < state.index ? "is-done" : i === state.index && state.running ? "is-target" : "is-todo";
  }

  function currentPage() {
    if (state.timed && state.cursorBeat != null) return pageForBar(Math.max(0, Math.floor(state.cursorBeat / state.piece.perBar)));
    var item = state.seq[Math.min(state.index, state.seq.length - 1)];
    if (!state.running && state.index >= state.seq.length) return state.pages[state.pages.length - 1];
    return pageForBar(item ? item.bar : 0);
  }

  function seqScene() {
    var page = currentPage();
    if (!page) return { items: [], bars: [] };
    var layout = lineLayout(page);
    var items = [];
    for (var i = page.start; i < page.end; i++) {
      var n = state.seq[i];
      items.push({
        note: n.note,
        rest: n.rest,
        dur: n.dur,
        x: layout.xFor(n.bar, n.pos),
        cls: noteClass(i),
        tab: S.tab ? state.frets[i] : null,
      });
    }
    var current = items[state.index - page.start];
    if (current && !state.timed && playedIsFresh() && !state.played.ok) {
      items.push({ note: state.played.note, x: current.x + 20, cls: "is-bad is-small", forceName: true });
    }
    var last = layout.bars[layout.bars.length - 1];
    var isEnd = page.to === state.piece.bars;
    return {
      items: items,
      layout: layout,
      bars: layout.bars.slice(0, isEnd ? -1 : undefined).map(function (b) {
        return b.x + b.w;
      }),
      finalBar: isEnd ? last.x + last.w : null,
      chords: state.piece.chords
        ? layout.bars.map(function (b) {
            return { x: b.x + 18, text: state.piece.chords[b.bar] || "" };
          })
        : null,
      meter: page.from === 0 ? state.piece.meter : null,
      pageLabel: state.pages.length > 1 ? "Line " + (state.pages.indexOf(page) + 1) + " of " + state.pages.length : "",
    };
  }

  function renderStaff() {
    var svg = $("lab-staff");
    var seqMode = state.mode === "scale" || state.mode === "song" || state.mode === "riff";
    var scene;
    if (state.mode === "quest" && state.running) scene = questScene();
    else if (seqMode && state.seq.length) scene = seqScene();
    else scene = freeScene();
    var geo = geometry(S.tab);
    svg.setAttribute("viewBox", "0 0 " + STAFF_W + " " + geo.height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawStaffFrame(svg, geo, { meter: scene.meter });
    var lowStep = geo.n.id === "concert" ? -10 : 2;
    var barBottom = geo.tab ? geo.tab.bottom : geo.y(lowStep);
    function barLine(x, cls) {
      svg.appendChild(el("line", { class: "lab-bar" + (cls || ""), x1: x, x2: x, y1: geo.y(10), y2: geo.y(lowStep) }));
      if (geo.tab) svg.appendChild(el("line", { class: "lab-bar" + (cls || ""), x1: x, x2: x, y1: geo.tab.top, y2: geo.tab.bottom }));
    }
    (scene.bars || []).forEach(function (x) {
      barLine(x);
    });
    if (scene.finalBar) {
      barLine(scene.finalBar - 5);
      barLine(scene.finalBar, " is-final");
    }
    (scene.chords || []).forEach(function (c) {
      svg.appendChild(el("text", { class: "lab-chord", x: c.x, y: 14 }, c.text));
    });
    scene.items.forEach(function (item) {
      drawNote(svg, geo, item);
    });
    state.layout = scene.layout || null;
    if (scene.layout && state.timed) {
      svg.appendChild(el("line", { id: "lab-playhead", class: "lab-playhead", x1: -10, x2: -10, y1: geo.y(12), y2: barBottom + 6 }));
      placePlayhead();
    }
    if (scene.pageLabel) {
      svg.appendChild(el("text", { class: "lab-page", x: STAFF_W - 14, y: 14 }, scene.pageLabel));
    }
  }

  function placePlayhead() {
    var line = $("lab-playhead");
    if (!line || !state.layout) return;
    var x = state.cursorBeat == null ? null : state.layout.xForBeat(state.cursorBeat);
    line.setAttribute("x1", x == null ? -10 : x);
    line.setAttribute("x2", x == null ? -10 : x);
  }

  function measureStaff() {
    var stage = $("lab-stage");
    var w = Math.round(Math.max(480, Math.min(1800, stage.clientWidth || 640)));
    if (w === STAFF_W) return false;
    STAFF_W = w;
    return true;
  }

  /* ---------- fretboard ---------- */

  var FRET = { nut: 56, end: 626, top: 18, gap: 20 };

  function fretX(f) {
    return FRET.nut + f * ((FRET.end - FRET.nut) / C.MAX_FRET);
  }

  function dotX(f) {
    return f === 0 ? 36 : (fretX(f - 1) + fretX(f)) / 2;
  }

  function stringY(number) {
    return FRET.top + (number - 1) * FRET.gap;
  }

  function currentTarget() {
    return activeTarget();
  }

  function showTargetOnFrets() {
    if (!state.running) return false;
    if (state.mode === "quest") return state.hint;
    return S.frets;
  }

  function renderFret() {
    var svg = $("lab-fret");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.classList.toggle("is-tap", S.input === "tap");
    svg.appendChild(el("rect", { class: "lab-neck", x: FRET.nut, y: FRET.top - 8, width: FRET.end - FRET.nut, height: FRET.gap * 5 + 16, rx: 3 }));
    [3, 5, 7, 9].forEach(function (f) {
      svg.appendChild(el("circle", { class: "lab-inlay", cx: dotX(f), cy: stringY(3.5), r: 5 }));
    });
    svg.appendChild(el("circle", { class: "lab-inlay", cx: dotX(12), cy: stringY(2.5), r: 5 }));
    svg.appendChild(el("circle", { class: "lab-inlay", cx: dotX(12), cy: stringY(4.5), r: 5 }));
    for (var f = 1; f <= C.MAX_FRET; f++) {
      svg.appendChild(el("line", { class: "lab-fretwire", x1: fretX(f), x2: fretX(f), y1: FRET.top - 8, y2: stringY(6) + 8 }));
    }
    svg.appendChild(el("line", { class: "lab-nut", x1: FRET.nut, x2: FRET.nut, y1: FRET.top - 8, y2: stringY(6) + 8 }));
    [0, 3, 5, 7, 9, 12].forEach(function (f) {
      svg.appendChild(el("text", { class: "lab-fretnum", x: dotX(f), y: stringY(6) + 26 }, String(f)));
    });
    C.STRINGS.forEach(function (s) {
      var y = stringY(s.number);
      svg.appendChild(el("line", { class: "lab-string", x1: 24, x2: FRET.end, y1: y, y2: y, "stroke-width": 0.8 + (s.number - 1) * 0.32 }));
      svg.appendChild(el("text", { class: "lab-stringname", x: 10, y: y + 4 }, s.short));
    });

    var target = currentTarget();
    var caption = "";
    if (target && showTargetOnFrets()) {
      var assigned = state.mode !== "quest" && state.frets[state.index];
      var spots = assigned ? [{ string: assigned.string, fret: assigned.fret }] : C.fretPositions(target.midi);
      spots.forEach(function (p, i) {
        var g = el("g", { class: "lab-spot is-target" + (i === 0 ? " is-first" : "") });
        g.appendChild(el("circle", { cx: dotX(p.fret), cy: stringY(p.string), r: 9 }));
        g.appendChild(el("text", { x: dotX(p.fret), y: stringY(p.string) + 4 }, C.pitchClassName(target)));
        svg.appendChild(g);
      });
      caption =
        "Play " +
        C.noteName(target) +
        ": " +
        spots
          .map(function (p) {
            return C.describePosition(p);
          })
          .join(" \u00B7 or ");
    }
    if (playedIsFresh()) {
      C.fretPositions(state.played.midi).forEach(function (p) {
        var g = el("g", { class: "lab-spot " + (state.played.ok ? "is-ok" : "is-bad") });
        g.appendChild(el("circle", { cx: dotX(p.fret), cy: stringY(p.string), r: 7 }));
        svg.appendChild(g);
      });
      if (!caption || state.mode === "free" || !state.running) {
        var spots2 = C.fretPositions(state.played.midi);
        caption =
          "You played " +
          C.noteName(state.played.note) +
          (spots2.length
            ? ": " +
              spots2
                .map(function (p) {
                  return C.describePosition(p);
                })
                .join(" \u00B7 or ")
            : "");
      }
    }
    if (S.input === "tap") {
      C.STRINGS.forEach(function (s) {
        for (var fret = 0; fret <= C.MAX_FRET; fret++) {
          var x0 = fret === 0 ? 20 : fretX(fret - 1);
          var x1 = fret === 0 ? FRET.nut : fretX(fret);
          var hit = el("rect", {
            class: "lab-tap",
            x: x0,
            y: stringY(s.number) - FRET.gap / 2,
            width: x1 - x0,
            height: FRET.gap,
            "data-midi": s.midi + fret,
          });
          svg.appendChild(hit);
        }
      });
      if (!caption) caption = "Tap a string and fret to play it.";
    }
    $("lab-fret-caption").textContent = caption;
  }

  /* ---------- HUD and text ---------- */

  function starText(n) {
    return "\u2605\u2605\u2605".slice(0, n) + "\u2606\u2606\u2606".slice(0, 3 - n);
  }

  function clock(ms) {
    var secs = Math.max(0, Math.round(ms / 1000));
    return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  }

  function hudItem(label, value, extra) {
    return '<div class="lab-stat' + (extra ? " " + extra : "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function bestKey() {
    return (state.pool ? "weak" : S.level) + ":" + S.round;
  }

  function renderHud() {
    var hud = $("lab-hud");
    var html = "";
    if (state.mode === "quest") {
      var tries = state.hits + state.misses;
      var mult = C.multiplier(state.streak);
      html += hudItem("Score", state.score);
      html += hudItem("Streak", state.streak + (mult > 1 ? " \u00D7" + mult : ""), state.streak >= 5 ? "is-hot" : "");
      html += hudItem(S.round === "challenge" ? "Time" : "Round", S.round === "challenge" ? clock(state.running ? state.endsAt - now() : CHALLENGE_SECONDS * 1000) : "Practice");
      html += hudItem("Accuracy", tries ? Math.round((100 * state.hits) / tries) + "%" : "\u2014");
      html += hudItem("Best", store.best[bestKey()] || 0);
    } else if (state.timed) {
      var st = state.timed.judge.stats();
      html += hudItem("Score", state.score);
      html += hudItem("Hits", st.hits + " / " + st.total);
      html += hudItem("Accuracy", st.hits + st.misses ? Math.round(100 * st.accuracy) + "%" : "\u2014");
      html += hudItem("Streak", state.streak, state.streak >= 5 ? "is-hot" : "");
      if (state.mode === "riff") html += hudItem("Pass", state.timed.pass + 1);
      html += hudItem("Best", bestTimed() ? bestTimed() + "%" : "\u2014");
    } else if (state.mode === "riff") {
      html += hudItem("Track", state.piece ? state.piece.bpm + " BPM" : "\u2014");
      html += hudItem("Notes", playableCount());
      html += hudItem("Best", bestTimed() ? bestTimed() + "%" : "\u2014");
    } else if (state.mode === "scale" || state.mode === "song") {
      var total = playableCount();
      var bestStars = state.mode === "scale" ? store.scales[S.scale] : store.songs[S.song];
      html += hudItem("Note", total ? Math.min(playedCount() + (state.running ? 1 : 0), total) + " / " + total : "\u2014");
      html += hudItem("Misses", state.misses);
      html += hudItem("Time", state.startedAt ? clock((state.running ? now() : state.finishedAt) - state.startedAt) : "0:00");
      html += hudItem("Streak", state.streak, state.streak >= 5 ? "is-hot" : "");
      html += hudItem("Best", bestStars ? starText(bestStars) : "\u2014");
    } else {
      var last = state.trail[state.trail.length - 1];
      html += hudItem("Last note", last ? C.noteName(last.note) : "\u2014");
      html += hudItem("Written as", last ? C.noteName(C.writtenNote(last.note, S.notation)) : "\u2014");
      html += hudItem("Notes played", state.hits);
    }
    hud.innerHTML = html;
  }

  function setMessage(text, kind) {
    var m = $("lab-message");
    m.textContent = text;
    m.className = "lab-message" + (kind ? " is-" + kind : "");
  }

  function inputStatus() {
    var el2 = $("lab-input-status");
    var text;
    var warn = false;
    if (S.input === "tap") text = "Input: tap the fretboard";
    else if (S.input === "mic") {
      text = mic.on ? "Listening on this device's mic" : mic.error || "Mic is off";
      warn = !mic.on;
    } else if (state.ampRunning) text = "Listening through the amp tuner";
    else {
      text = "Amp is stopped \u2014 press Start amp, or switch input to the mic or the tap fretboard";
      warn = true;
    }
    el2.textContent = text;
    el2.classList.toggle("is-warn", warn);
  }

  function renderControls() {
    root.querySelectorAll(".lab-modes [data-mode]").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.mode === state.mode ? "true" : "false");
    });
    root.querySelectorAll("[data-for]").forEach(function (node) {
      var modes = node.dataset.for.split(" ");
      var show = modes.indexOf(state.mode) >= 0;
      if (node.id === "lab-hint" || node.id === "lab-skip" || node.id === "lab-stop") show = show && state.running;
      if (node.id === "lab-riff-tone") show = show && !!riffEntry();
      node.hidden = !show;
    });
    var timedMode = S.timing === "time" || state.mode === "riff";
    $("lab-go").textContent = state.running ? "Restart" : state.mode === "riff" && S.timing === "time" ? "Play along" : timedMode && state.mode !== "riff" ? "Start with count-in" : "Start";
    $("lab-hear").textContent = state.mode === "song" && !state.running ? "Hear the melody" : "Hear it";
    if (state.mode === "riff") $("lab-hear").textContent = state.running ? "Hear it" : "Hear the " + (S.riffPhrase === "lead" ? "lead" : "riff");
    $("lab-timing").value = S.timing;
    $("lab-timing").options[1].textContent = state.mode === "riff" ? "With the backing track" : "In time with the click";
    var tip = "";
    if (state.mode === "quest") tip = state.pool ? "Your weak notes come up until you nail them." : C.findById(C.LEVELS, S.level).tip;
    else if (state.mode === "scale") tip = C.findById(C.SCALES, S.scale).tip;
    else if (state.mode === "song") tip = C.findById(C.SONGS, S.song).tip;
    else if (state.mode === "riff") {
      var phrase = riffPhrase();
      tip = phrase ? phrase.tip : "The riffs load with the Practice backing tracks.";
    }
    else
      tip =
        S.notation === "guitar"
          ? "Guitar music is written an octave higher than it sounds, so it fits on one treble staff. The little 8 under the clef means that."
          : "Grand staff at sounding pitch: notes below middle C go on the bass clef, like piano music.";
    $("lab-tip").textContent = tip ? "Tip: " + tip : "";
  }

  function render() {
    renderControls();
    renderHud();
    renderStaff();
    renderFret();
    inputStatus();
    renderMetro();
  }

  /* ---------- effects ---------- */

  function pop(text, kind) {
    var p = $("lab-pop");
    p.textContent = text;
    p.className = "lab-pop";
    void p.offsetWidth;
    p.className = "lab-pop is-on" + (kind ? " is-" + kind : "");
  }

  function confetti(count) {
    var box = $("lab-confetti");
    var colors = ["#176571", "#1A3567", "#D89F58", "#A3D9D9", "#C33F45"];
    for (var i = 0; i < (count || 36); i++) {
      var bit = document.createElement("i");
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = Math.random() * 0.25 + "s";
      bit.style.setProperty("--spin", Math.round(Math.random() * 720 - 360) + "deg");
      bit.style.setProperty("--drift", Math.round(Math.random() * 120 - 60) + "px");
      box.appendChild(bit);
    }
    setTimeout(function () {
      box.innerHTML = "";
    }, 1800);
  }

  function shake() {
    var stage = $("lab-stage");
    stage.classList.remove("is-shake");
    void stage.offsetWidth;
    stage.classList.add("is-shake");
  }

  function award(id) {
    if (store.trophies[id]) return;
    store.trophies[id] = Date.now();
    save();
    var t = C.TROPHIES.filter(function (x) {
      return x.id === id;
    })[0];
    if (t) {
      setTimeout(function () {
        pop("Trophy: " + t.title, "trophy");
        confetti(24);
      }, 450);
    }
    renderTrophies();
  }

  function renderTrophies() {
    var list = $("lab-trophies");
    var got = 0;
    list.innerHTML = "";
    C.TROPHIES.forEach(function (t) {
      var li = document.createElement("li");
      var have = !!store.trophies[t.id];
      if (have) got++;
      li.className = have ? "is-earned" : "";
      li.innerHTML = "<strong>" + (have ? "\u2605 " : "\u2606 ") + t.title + "</strong><span>" + t.how + "</span>";
      list.appendChild(li);
    });
    $("lab-trophy-count").textContent = "(" + got + "/" + C.TROPHIES.length + ")";
    var weak = C.weakestNotes(store.notes, 6);
    $("lab-weak").textContent = weak.length
      ? "Needs practice: " +
        weak
          .map(function (w) {
            return C.noteName(C.noteFromMidi(w.midi)) + " (" + Math.round(100 * (1 - w.rate)) + "%)";
          })
          .join(", ")
      : "Play a few Note Quest rounds and your trickiest notes show up here.";
    $("lab-drill").disabled = weak.length < 2;
  }

  /* ---------- lesson flow ---------- */

  function currentSong() {
    return C.findById(C.SONGS, S.song);
  }

  function clearTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function resetRun() {
    clearTimer();
    state.running = false;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.hits = 0;
    state.misses = 0;
    state.inTuneRun = 0;
    state.target = null;
    state.lastHit = null;
    state.played = null;
    state.hint = false;
    state.index = 0;
    state.startedAt = 0;
    state.finishedAt = 0;
    stopTimed();
    $("lab-result").hidden = true;
    detector.reset();
  }

  /* ---------- riffs from the Practice backing tracks ---------- */

  function player() {
    return window.PracticePlayer || null;
  }

  function riffTracks() {
    var p = player();
    if (!p || !p.riffs()) return [];
    return p.catalog().filter(function (t) {
      return p.riffs().tracks[t.id];
    });
  }

  function riffTrack() {
    var list = riffTracks();
    return (
      list.filter(function (t) {
        return t.id === S.riffTrack;
      })[0] ||
      list[0] ||
      null
    );
  }

  function riffEntry() {
    var p = player();
    var track = riffTrack();
    return track && p && p.riffs() ? p.riffs().tracks[track.id] : null;
  }

  function riffPhrase() {
    var entry = riffEntry();
    if (!entry) return null;
    return (
      entry.phrases.filter(function (ph) {
        return ph.id === S.riffPhrase;
      })[0] || entry.phrases[0]
    );
  }

  function riffKey() {
    var track = riffTrack();
    return track ? track.id + ":" + (riffPhrase() || {}).id : "";
  }

  function perBarOf(track) {
    return Number(String((track && track.timeSignature) || "4/4").split("/")[0]) || 4;
  }

  /* ---------- sequences ---------- */

  function playableCount() {
    return state.seq.filter(function (n) {
      return !n.rest;
    }).length;
  }

  function playedCount() {
    var n = 0;
    for (var i = 0; i < Math.min(state.index, state.seq.length); i++) if (!state.seq[i].rest) n++;
    return n;
  }

  function skipRests() {
    while (state.index < state.seq.length && state.seq[state.index].rest) state.index++;
  }

  function bestTimed() {
    var key = state.mode === "riff" ? riffKey() : state.mode + ":" + (state.mode === "song" ? S.song : S.scale);
    return store.riffs[key] || 0;
  }

  function loadSequence() {
    state.piece = null;
    state.frets = [];
    if (state.mode === "scale") {
      var scale = C.findById(C.SCALES, S.scale);
      state.seq = C.scaleNotes(scale);
      state.piece = { perBar: 4, meter: [4, 4], pickup: 0, bars: Math.ceil(state.seq.length / 4), bpm: S.bpm };
      state.frets = C.assignFrets(state.seq, scale.frets || [0, 4]);
    } else if (state.mode === "song") {
      var song = C.parseSong(currentSong());
      state.seq = song.notes;
      state.piece = { perBar: song.perBar, meter: song.meter, pickup: currentSong().pickup || 0, bars: song.bars, bpm: song.bpm };
      state.frets = C.assignFrets(state.seq, [0, 4]);
    } else if (state.mode === "riff" && riffPhrase()) {
      var track = riffTrack();
      var perBar = perBarOf(track);
      var tab = C.parseTab(riffPhrase().tab, perBar);
      var flats = {};
      (track.scales || []).forEach(function (s) {
        (s.notes || []).forEach(function (name) {
          if (/^[A-G]b$/.test(name)) flats[C.parseNote(name + "4").midi % 12] = true;
        });
      });
      tab.notes.forEach(function (n) {
        if (!n.rest && flats[n.midi % 12]) n.note = C.noteFromMidi(n.midi, true);
      });
      state.seq = tab.notes;
      state.piece = { perBar: perBar, meter: [perBar, 4], pickup: 0, bars: tab.bars, bpm: track.bpm, chords: track.progression, track: track };
      setBpm(track.bpm, true);
      state.frets = tab.notes.map(function (n) {
        return n.rest ? null : { string: n.string, fret: n.fret };
      });
    } else {
      state.seq = [];
    }
    state.pages = state.piece ? buildPages(state.seq, state.piece) : [];
  }

  function setMode(mode) {
    stopSounds();
    resetRun();
    state.mode = mode;
    state.pool = null;
    if (mode === "riff") fillRiffSelects();
    if (mode === "song") setBpm(currentSong().bpm, true);
    loadSequence();
    if (mode === "free") setMessage("Play any note. It shows up on the staff and in the tab.");
    else if (mode === "quest") setMessage("Read the note, play it. Press Start when you're ready.");
    else if (mode === "scale") setMessage("Climb the scale up and back down. Press Start, or pick In time with the click.");
    else if (mode === "song") setMessage("Play the melody. Waits for me goes note by note; In time with the click keeps the tempo.");
    else if (!riffPhrase()) setMessage("Loading riffs from the Practice backing tracks\u2026");
    else setMessage("Play along with " + riffTrack().title + ": the track counts you in and scores every note. Or pick Waits for me to learn it slowly.");
    render();
    emit("mode", {});
  }

  function start() {
    stopSounds();
    resetRun();
    loadSequence();
    if (state.mode === "riff" && !state.seq.length) return;
    state.running = true;
    state.startedAt = now();
    if (state.mode === "riff" && S.timing === "time") {
      startJam();
      return;
    }
    if ((state.mode === "scale" || state.mode === "song") && S.timing === "time") {
      startTimedLesson();
      return;
    }
    skipRests();
    if (state.mode === "quest") {
      if (S.round === "challenge") {
        state.endsAt = now() + CHALLENGE_SECONDS * 1000;
        state.timer = setInterval(function () {
          if (now() >= state.endsAt) finish();
          else renderHud();
        }, 250);
      }
      nextTarget();
      setMessage(S.round === "challenge" ? "Go! As many as you can in 60 seconds." : "Play the note on the staff.");
    } else {
      state.timer = setInterval(renderHud, 500);
      var first = state.seq[state.index];
      var where = state.frets[state.index] ? " (" + C.describePosition(state.frets[state.index]) + ")" : "";
      setMessage(
        state.mode === "scale" ? "Start at the bottom: " + C.noteName(first.note) + where + "." : "First note: " + C.noteName(first.note) + where + ". Take your time."
      );
    }
    render();
  }

  function stop() {
    stopSounds();
    clearTimer();
    var wasJam = state.timed && state.timed.source === "track";
    stopTimed();
    if (wasJam && player()) {
      var loopBox = document.getElementById("practice-loop");
      player().audio.pause();
      player().audio.loop = loopBox ? loopBox.checked : true;
    }
    state.running = false;
    state.target = null;
    setMessage("Stopped. Press Start to go again.");
    render();
    emit("jam", {});
  }

  /* ---------- timed play: songs and scales with the click, riffs with the backing track ---------- */

  function latency() {
    return (INPUT_LATENCY[S.input] || 0) + (Number(S.offsetMs) || 0) / 1000;
  }

  /* Seconds into the piece, measured on the clock the music is playing on. */
  function pieceTime(perfMs) {
    var tm = state.timed;
    var lag = perfMs == null ? 0 : Math.max(0, (now() - perfMs) / 1000);
    if (tm.source === "track") {
      var a = player().audio;
      return a.currentTime - lag;
    }
    return audioCtx().currentTime - lag - tm.t0;
  }

  function newJudge(secPerBeat) {
    return C.createTimedJudge(state.seq, { secPerBeat: secPerBeat, early: 0.2, late: 0.3, anyOctave: S.anyOctave });
  }

  function startTimedLesson() {
    var ctx = audioCtx();
    if (!ctx) return;
    var piece = state.piece;
    piece.bpm = S.bpm;
    var spb = 60 / piece.bpm;
    var meterId = piece.perBar === 3 ? "3/4" : piece.perBar === 2 ? "2/4" : "4/4";
    var countBeats = piece.perBar;
    var t0 = ctx.currentTime + 0.15 + countBeats * spb;
    state.timed = {
      source: "click",
      t0: t0,
      spb: spb,
      judge: newJudge(spb),
      pass: 0,
      endBeat: lastBeat(),
      countBeats: countBeats,
    };
    S.meter = meterId;
    $("lab-meter").value = meterId;
    metroStart({ bpm: piece.bpm, meter: meterId, at: ctx.currentTime + 0.15 });
    state.cursorBeat = -countBeats;
    state.index = 0;
    skipRests();
    setMessage("Count-in: " + countBeats + " clicks, then play. " + piece.bpm + " BPM.");
    render();
    loop();
  }

  function lastBeat() {
    var last = state.seq[state.seq.length - 1];
    return last ? last.beat + last.beats : 0;
  }

  function startJam() {
    var p = player();
    var track = state.piece.track;
    if (!p) return;
    var spb = 60 / track.bpm;
    var ctx = audioCtx();
    var countBeats = state.piece.perBar;
    state.timed = {
      source: "track",
      spb: spb,
      judge: newJudge(spb),
      pass: 0,
      lastT: 0,
      endBeat: state.piece.bars * state.piece.perBar,
      countBeats: countBeats,
      passes: [],
      waiting: true,
    };
    state.cursorBeat = 0;
    state.index = 0;
    skipRests();
    p.selectTrack(track.id).then(function () {
      if (!state.timed || state.timed.source !== "track") return;
      var a = p.audio;
      a.pause();
      a.loop = true;
      a.currentTime = 0;
      var at = ctx.currentTime + 0.15;
      metroStart({ bpm: track.bpm, meter: perBarOf(track) === 3 ? "3/4" : "4/4", at: at, clicks: countBeats });
      setMessage("Count-in\u2026 " + track.title + " at " + track.bpm + " BPM.");
      setTimeout(function () {
        if (!state.timed || state.timed.source !== "track") return;
        state.timed.waiting = false;
        a.play().catch(function (err) {
          setMessage("The browser blocked the backing track: " + (err && err.message ? err.message : "press Play along again") + ".", "bad");
        });
      }, Math.max(0, (at - ctx.currentTime + countBeats * spb) * 1000 - 30));
    });
    render();
    loop();
  }

  function stopTimed() {
    if (!state.timed) return;
    if (state.timed.source === "click") metroStop();
    state.timed = null;
    state.cursorBeat = null;
  }

  function timedTick() {
    var tm = state.timed;
    if (!tm || !state.running) return;
    if (tm.source === "track" && tm.waiting) {
      state.cursorBeat = 0;
      return;
    }
    var t = pieceTime();
    if (tm.source === "track") {
      if (t + 0.5 < tm.lastT) endPass();
      tm.lastT = t;
    }
    var tJudge = t - latency();
    var missed = tm.judge.sweep(tJudge);
    if (missed.length) {
      state.streak = 0;
      state.misses += missed.length;
    }
    var beat = t / tm.spb;
    var prevBar = state.cursorBeat == null ? null : Math.floor(state.cursorBeat / state.piece.perBar);
    state.cursorBeat = beat;
    var next = tm.judge.next(tJudge);
    var newIndex = next < 0 ? state.seq.length : next;
    var bar = Math.floor(beat / state.piece.perBar);
    if (beat < 0) {
      var left = Math.min(tm.countBeats, Math.ceil(-beat));
      setMessage("Count-in\u2026 " + left, "");
    } else if (prevBar != null && prevBar < 0) {
      setMessage("Go! Play each note as the playhead reaches it.");
    }
    if (missed.length || newIndex !== state.index || bar !== prevBar) {
      state.index = newIndex;
      render();
      emit("jam", {});
    } else {
      placePlayhead();
      emit("tick", {});
    }
    if (tm.source === "click" && tJudge > tm.endBeat * tm.spb + 0.4) finishTimed();
  }

  function endPass() {
    var tm = state.timed;
    tm.judge.sweep(Infinity);
    var st = tm.judge.stats();
    var pct = Math.round(100 * st.accuracy);
    tm.passes.push(pct);
    recordBest(pct);
    tm.pass += 1;
    tm.judge.reset();
    state.misses = 0;
    pop("Pass " + tm.pass + ": " + pct + "%", pct >= 90 ? "big" : "ok");
    if (pct >= 90) confetti(40);
    setMessage("Pass " + tm.pass + ": " + st.hits + " of " + st.total + " notes (" + pct + "%). The loop keeps going \u2014 go again.", pct >= 70 ? "ok" : "");
  }

  function recordBest(pct) {
    var key = state.mode === "riff" ? riffKey() : state.mode + ":" + (state.mode === "song" ? S.song : S.scale);
    if (pct > (store.riffs[key] || 0)) {
      store.riffs[key] = pct;
      save();
    }
    if (state.mode === "riff" && pct >= 90) award("riff90");
  }

  function finishTimed() {
    var tm = state.timed;
    tm.judge.sweep(Infinity);
    var st = tm.judge.stats();
    var pct = Math.round(100 * st.accuracy);
    recordBest(pct);
    state.finishedAt = now();
    state.running = false;
    stopTimed();
    var stars = pct >= 95 ? 3 : pct >= 80 ? 2 : 1;
    var bucket = state.mode === "scale" ? store.scales : store.songs;
    var id = state.mode === "scale" ? S.scale : S.song;
    bucket[id] = Math.max(bucket[id] || 0, stars);
    if (state.mode === "song") {
      award("firstsong");
      award("intime");
    }
    save();
    var title = state.mode === "scale" ? C.findById(C.SCALES, id).title : currentSong().title;
    var result = $("lab-result");
    result.innerHTML =
      "<h3>" +
      title +
      ' in time</h3><p class="lab-stars">' +
      starText(stars) +
      "</p><p>" +
      st.hits +
      " of " +
      st.total +
      " notes on the beat (" +
      pct +
      "%) at " +
      state.piece.bpm +
      " BPM, " +
      state.score +
      " points." +
      (stars < 3 ? " 95% earns three stars. Slow the click down if it's rushing you." : " Perfect timing \u2014 try it a few BPM faster.") +
      "</p>";
    result.hidden = false;
    confetti(stars === 3 ? 70 : 30);
    setMessage(stars === 3 ? "Locked in with the click." : "Done. Play it again, or lower the BPM.", "ok");
    renderTrophies();
    render();
    emit("jam", {});
  }

  function timingWord(offset) {
    if (offset < -0.08) return "early";
    if (offset > 0.12) return "late";
    return "on the beat";
  }

  function onTimedNote(ev) {
    var tm = state.timed;
    if (tm.source === "track" && tm.waiting) return;
    var t = pieceTime(ev.at) - latency();
    var res = tm.judge.onset(ev.midi, t);
    var note = spellLike(res.index >= 0 && state.seq[res.index].note ? state.seq[res.index].note : null, ev.midi);
    state.played = { note: note, midi: ev.midi, ok: res.type === "hit", at: now() };
    if (res.type === "hit") {
      state.streak++;
      state.hits++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      var pts = C.hitPoints(state.streak, ev.cents);
      var onBeat = Math.abs(res.offset) <= 0.08 ? 5 : 0;
      state.score += pts.total + onBeat;
      award("first");
      pop(timingWord(res.offset) === "on the beat" ? "+" + (pts.total + onBeat) + " on the beat" : timingWord(res.offset), "ok");
      if (state.streak === 10) {
        pop("10 in a row!", "big");
        confetti(30);
      }
      setMessage(C.noteName(note) + " \u2014 " + timingWord(res.offset) + ".", "ok");
    } else {
      state.streak = 0;
      var want = res.index >= 0 ? state.seq[res.index] : null;
      setMessage(
        want && !want.rest
          ? "That was " + C.noteName(note) + "; the note here is " + C.noteName(want.note) + (state.frets[res.index] ? " (" + C.describePosition(state.frets[res.index]) + ")." : ".")
          : "That was " + C.noteName(note) + " \u2014 nothing due right then. Wait for the playhead.",
        "bad"
      );
    }
    render();
    scheduleFade();
    emit("jam", {});
  }

  /* ---------- events for the Practice tab ---------- */

  function emit(type, extra) {
    var detail = Object.assign(
      {
        type: type,
        mode: state.mode,
        running: state.running,
        trackId: state.mode === "riff" && riffTrack() ? riffTrack().id : null,
        phraseId: state.mode === "riff" && riffPhrase() ? riffPhrase().id : null,
        index: state.index,
        cursorBeat: state.cursorBeat,
        timed: !!state.timed,
        source: state.timed ? state.timed.source : null,
        score: state.score,
        streak: state.streak,
        stats: state.timed ? state.timed.judge.stats() : null,
        pass: state.timed ? state.timed.pass : 0,
        status: state.timed
          ? state.seq.map(function (n, i) {
              return state.timed.judge.status(i);
            })
          : null,
      },
      extra || {}
    );
    document.dispatchEvent(new CustomEvent("stafflab:" + type, { detail: detail }));
  }

  function poolNames() {
    if (state.pool) return state.pool;
    return C.findById(C.LEVELS, S.level).notes;
  }

  function nextTarget() {
    var prevKey = state.target ? C.noteKey(state.target) : null;
    state.target = C.pickTarget(poolNames(), store.notes, prevKey);
    state.targetAt = now();
    state.hint = false;
    state.missesOnTarget = 0;
  }

  function noteStat(midi, ok) {
    var key = String(midi);
    var st = store.notes[key] || { hits: 0, misses: 0 };
    if (ok) st.hits++;
    else st.misses++;
    store.notes[key] = st;
  }

  function spellLike(target, midi) {
    if (target && target.midi === midi) return target;
    return C.noteFromMidi(midi, target ? target.accidental === "b" : false);
  }

  function onHit(ev, target) {
    state.lastHit = { midi: ev.midi, at: now() };
    state.streak++;
    state.hits++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    var inTune = Math.abs(ev.cents) <= 10;
    state.inTuneRun = inTune ? state.inTuneRun + 1 : 0;
    award("first");
    if (state.inTuneRun >= 10) award("intune10");
    if (state.mode === "quest") {
      var pts = C.hitPoints(state.streak, ev.cents);
      state.score += pts.total;
      noteStat(target.midi, true);
      if (!state.pool && S.level === "accidentals") {
        store.levelHits.accidentals = (store.levelHits.accidentals || 0) + 1;
        if (store.levelHits.accidentals >= 20) award("sharp20");
      }
      save();
      if (state.streak === 5) {
        pop("Streak 5 \u2014 double points!", "big");
        confetti(20);
      } else if (state.streak === 10) {
        pop("Streak 10 \u2014 triple points!", "big");
        confetti(40);
        award("streak10");
      } else if (state.streak === 25) {
        pop("25 in a row!", "big");
        confetti(60);
        award("streak25");
      } else {
        pop("+" + pts.total + (pts.bonus ? " in tune!" : ""), "ok");
      }
      setMessage(praise() + " " + C.noteName(target) + (inTune ? ", right in tune." : ", " + Math.round(Math.abs(ev.cents)) + " cents " + (ev.cents > 0 ? "sharp." : "flat.")), "ok");
      nextTarget();
    } else {
      state.index++;
      skipRests();
      pop(inTune ? "in tune!" : "\u2713", "ok");
      if (state.index >= state.seq.length) {
        finish();
        return;
      }
      setMessage(praise() + " Next: " + C.noteName(state.seq[state.index].note) + ".", "ok");
    }
  }

  var PRAISE = ["Nice!", "Yes!", "Got it.", "Clean.", "Sweet.", "Spot on.", "Right!"];
  function praise() {
    return PRAISE[Math.floor(Math.random() * PRAISE.length)];
  }

  function onMiss(ev, target) {
    state.streak = 0;
    state.misses++;
    state.inTuneRun = 0;
    state.missesOnTarget++;
    if (state.mode === "quest") {
      noteStat(target.midi, false);
      save();
      if (state.missesOnTarget >= 2) state.hint = true;
    }
    shake();
    var played = spellLike(target, ev.midi);
    setMessage("That was " + C.noteName(played) + ". " + C.missHint(target.midi, ev.midi) + (state.hint && state.mode === "quest" ? " The fretboard shows where." : ""), "bad");
  }

  function finish() {
    clearTimer();
    var wasRunning = state.running;
    state.running = false;
    state.finishedAt = now();
    if (!wasRunning) return;
    var result = $("lab-result");
    var html = "";
    if (state.mode === "quest") {
      var key = bestKey();
      var prev = store.best[key] || 0;
      var newBest = state.score > prev;
      if (newBest) store.best[key] = state.score;
      if (S.round === "challenge" && state.score >= 150) award("speed150");
      save();
      var tries = state.hits + state.misses;
      html =
        "<h3>" +
        (S.round === "challenge" ? "Time!" : "Round over") +
        "</h3><p><strong>" +
        state.score +
        "</strong> points" +
        (newBest ? " \u2014 new best!" : " (best " + prev + ")") +
        "</p><p>" +
        state.hits +
        " notes read, " +
        state.misses +
        " misses, " +
        (tries ? Math.round((100 * state.hits) / tries) : 0) +
        "% accuracy, longest streak " +
        state.bestStreak +
        ".</p>";
      if (newBest) confetti(60);
      state.target = null;
      setMessage(newBest ? "New high score. Play again to beat it." : "Play again, or try the next level.");
    } else {
      var total = playableCount();
      var stars = C.stars(state.misses, total);
      var bucket = state.mode === "scale" ? store.scales : state.mode === "song" ? store.songs : {};
      var id = state.mode === "scale" ? S.scale : state.mode === "song" ? S.song : riffKey();
      var prevStars = bucket[id] || 0;
      bucket[id] = Math.max(prevStars, stars);
      if (state.mode === "scale" && stars === 3) award("cleanclimb");
      if (state.mode === "song") {
        award("firstsong");
        var all = C.SONGS.every(function (s) {
          return store.songs[s.id];
        });
        if (all) award("songbook");
      }
      save();
      var title = state.mode === "scale" ? C.findById(C.SCALES, id).title : state.mode === "song" ? currentSong().title : riffPhrase().title;
      html =
        '<h3>' +
        title +
        '</h3><p class="lab-stars">' +
        starText(stars) +
        "</p><p>" +
        total +
        " notes in " +
        clock(state.finishedAt - state.startedAt) +
        " with " +
        state.misses +
        (state.misses === 1 ? " miss." : " misses.") +
        (stars < 3 ? " Zero misses earns three stars." : " Perfect!") +
        "</p>";
      confetti(stars === 3 ? 70 : 36);
      setMessage(stars === 3 ? "Flawless. Try another one." : "Done! Play it again for more stars.", "ok");
    }
    result.innerHTML = html;
    result.hidden = false;
    renderTrophies();
    render();
  }

  function activeTarget() {
    if (!state.running) return null;
    if (state.mode === "quest") return state.target;
    var item = state.seq[state.index];
    return item && !item.rest ? item.note : null;
  }

  function onNote(ev) {
    emit("note", { midi: ev.midi, cents: ev.cents });
    if (state.timed && state.running) {
      onTimedNote(ev);
      return;
    }
    var target = activeTarget();
    var t = now();
    if (target && state.lastHit && ev.midi === state.lastHit.midi && t - state.lastHit.at < 1500 && !C.matches(target.midi, ev.midi, S.anyOctave)) return;
    var note = spellLike(target, ev.midi);
    if (!target) {
      state.trail.push({ note: note, at: t });
      if (state.trail.length > 8) state.trail.shift();
      state.hits++;
      state.played = { note: note, midi: ev.midi, ok: true, at: t };
      var spots = C.fretPositions(ev.midi);
      setMessage(
        C.noteName(note) +
          (spots.length ? " \u2014 " + C.describePosition(spots[0]) + "." : ".") +
          (Math.abs(ev.cents) > 15 ? " " + Math.round(Math.abs(ev.cents)) + " cents " + (ev.cents > 0 ? "sharp" : "flat") + "." : "")
      );
      render();
      scheduleFade();
      return;
    }
    var ok = C.matches(target.midi, ev.midi, S.anyOctave);
    state.played = { note: note, midi: ev.midi, ok: ok, at: t };
    if (ok) onHit(ev, target);
    else onMiss(ev, target);
    render();
    scheduleFade();
  }

  var fadeTimer = null;
  function scheduleFade() {
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      fadeTimer = null;
      renderStaff();
      renderFret();
    }, 1500);
  }

  function handleFrame(frame) {
    if (now() < state.mutedUntil && S.input === "mic") frame = { active: false };
    var ev = detector.push(frame, now());
    if (ev) onNote(ev);
  }

  /* ---------- inputs ---------- */

  var mic = { on: false, error: "", ctx: null, stream: null, analyser: null, buf: null, timer: null, last: null, lastAt: 0 };

  function startMic() {
    if (mic.on) return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mic.error = "The browser only opens the mic on https or on this computer (http://127.0.0.1:8790). Use the amp tuner or tap mode here.";
      render();
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        mic.ctx = new Ctx();
        mic.stream = stream;
        var src = mic.ctx.createMediaStreamSource(stream);
        mic.analyser = mic.ctx.createAnalyser();
        mic.analyser.fftSize = 4096;
        src.connect(mic.analyser);
        mic.buf = new Float32Array(mic.analyser.fftSize);
        mic.on = true;
        mic.error = "";
        detector = C.createOnsetDetector({ stableMs: 90 });
        mic.timer = setInterval(micTick, 50);
        render();
      })
      .catch(function (err) {
        mic.error = "Mic blocked (" + (err && err.name ? err.name : "error") + "). Allow the mic in the address bar, or use tap mode.";
        render();
      });
  }

  function stopMic() {
    if (mic.timer) clearInterval(mic.timer);
    mic.timer = null;
    if (mic.stream) mic.stream.getTracks().forEach(function (t) {
      t.stop();
    });
    if (mic.ctx) mic.ctx.close();
    mic.on = false;
    mic.ctx = mic.stream = mic.analyser = null;
  }

  function micTick() {
    mic.analyser.getFloatTimeDomainData(mic.buf);
    var t = now();
    var found = C.detectPitch(mic.buf, mic.ctx.sampleRate);
    var frame;
    if (found) {
      mic.last = found;
      mic.lastAt = t;
      frame = found;
    } else if (mic.last && t - mic.lastAt < 300) {
      frame = Object.assign({}, mic.last, { level: C.rms(mic.buf) });
    } else {
      mic.last = null;
      frame = { active: false };
    }
    if (window.AmpUI) window.AmpUI.applyTuner(frame.active ? frame : null);
    handleFrame(frame);
  }

  var tapIdle = null;
  function tapNote(midi) {
    var n = C.noteFromMidi(midi, false);
    pluck(midi, 0, 0.9);
    if (window.AmpUI) {
      window.AmpUI.applyTuner({ active: true, note: n.letter + n.accidental, octave: n.octave, midi: midi, hz: C.midiToHz(midi), cents: 0 });
      if (tapIdle) clearTimeout(tapIdle);
      tapIdle = setTimeout(function () {
        window.AmpUI.applyTuner(null);
      }, 900);
    }
    onNote({ midi: midi, cents: 0, hz: C.midiToHz(midi) });
  }

  function setInput(value) {
    if (value !== "mic") stopMic();
    S.input = value;
    save();
    detector = C.createOnsetDetector({ stableMs: 110 });
    root.querySelectorAll('input[name="lab-input"]').forEach(function (r) {
      r.checked = r.value === value;
    });
    if (value === "mic") startMic();
    if (value !== "amp" && window.AmpUI) window.AmpUI.applyTuner(null);
    render();
  }

  /* ---------- wiring ---------- */

  function fillSelect(id, items, value) {
    var sel = $(id);
    sel.innerHTML = "";
    items.forEach(function (item) {
      var o = document.createElement("option");
      o.value = item.id;
      o.textContent = item.title;
      sel.appendChild(o);
    });
    sel.value = value;
    if (sel.value !== value) sel.value = items[0].id;
  }

  function songTitles() {
    return C.SONGS.map(function (s) {
      var stars = store.songs[s.id];
      return { id: s.id, title: s.title + (stars ? "  " + starText(stars) : "") };
    });
  }

  function scaleTitles() {
    return C.SCALES.map(function (s) {
      var stars = store.scales[s.id];
      return { id: s.id, title: s.title + (stars ? "  " + starText(stars) : "") };
    });
  }

  function refreshSelects() {
    fillSelect("lab-level", C.LEVELS, S.level);
    fillSelect("lab-scale", scaleTitles(), S.scale);
    fillSelect("lab-song", songTitles(), S.song);
    $("lab-round").value = S.round;
    fillRiffSelects();
  }

  function fillRiffSelects() {
    var tracks = riffTracks();
    if (!tracks.length) return;
    fillSelect(
      "lab-riff-track",
      tracks.map(function (t) {
        return { id: t.id, title: t.title + " \u00B7 " + t.key + " \u00B7 " + t.bpm + " BPM" };
      }),
      S.riffTrack
    );
    S.riffTrack = $("lab-riff-track").value;
    var entry = riffEntry();
    fillSelect(
      "lab-riff-phrase",
      entry.phrases.map(function (ph) {
        var best = store.riffs[S.riffTrack + ":" + ph.id];
        return { id: ph.id, title: (ph.kind === "lead" ? "Lead: " : "Riff: ") + ph.title + (best ? "  (best " + best + "%)" : "") };
      }),
      S.riffPhrase
    );
    S.riffPhrase = $("lab-riff-phrase").value;
  }

  function setBpm(value, quiet) {
    var bpm = Math.max(40, Math.min(240, Math.round(Number(value) || 80)));
    S.bpm = bpm;
    $("lab-bpm").value = String(bpm);
    $("lab-bpm-range").value = String(bpm);
    if (!quiet) save();
    if (metro.on && metro.until === Infinity && !state.timed) metroStart();
  }

  function loadRiffTone() {
    var entry = riffEntry();
    var out = $("lab-tone-status");
    if (!entry || !window.AmpUI || !window.AmpUI.loadPreset) return;
    var tone = entry.tone;
    out.textContent = "Loading " + tone.name + "\u2026";
    window.AmpUI.loadPreset({ slot: tone.slot, overrides: tone.overrides, ir: tone.ir })
      .then(function (data) {
        var ir = (data.params && data.params.ir) || "";
        out.textContent =
          tone.name + " loaded" + (ir ? " with " + ir.replace(/\.wav$/i, "") : "") + (data.running ? "." : ". Press Start amp to hear it.");
      })
      .catch(function (err) {
        out.textContent = "Couldn't load the tone: " + err.message;
      });
  }

  var tapTimes = [];
  function tapTempo() {
    var t = now();
    tapTimes = tapTimes.filter(function (x) {
      return t - x < 2500;
    });
    tapTimes.push(t);
    if (tapTimes.length < 2) return;
    var span = (tapTimes[tapTimes.length - 1] - tapTimes[0]) / (tapTimes.length - 1);
    setBpm(60000 / span);
  }

  function wire() {
    refreshSelects();
    $("lab-notation").value = S.notation;
    $("lab-names").checked = !!S.names;
    $("lab-frets").checked = !!S.frets;
    $("lab-tab").checked = !!S.tab;
    $("lab-octave").checked = !!S.anyOctave;
    $("lab-offset").value = String(S.offsetMs || 0);
    $("lab-meter").innerHTML = C.METERS.map(function (m) {
      return '<option value="' + m.id + '">' + m.id + (m.unit === 8 ? " (clicks eighths)" : "") + "</option>";
    }).join("");
    $("lab-meter").value = S.meter;
    setBpm(S.bpm, true);
    root.querySelectorAll('input[name="lab-input"]').forEach(function (r) {
      r.checked = r.value === S.input;
      r.addEventListener("change", function () {
        if (r.checked) setInput(r.value);
      });
    });

    root.querySelectorAll(".lab-modes [data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        setMode(b.dataset.mode);
      });
    });

    function onSetting(id, key, after) {
      $(id).addEventListener("change", function (e) {
        S[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        save();
        if (after) after();
        render();
      });
    }
    onSetting("lab-notation", "notation");
    onSetting("lab-names", "names");
    onSetting("lab-frets", "frets");
    onSetting("lab-tab", "tab");
    onSetting("lab-octave", "anyOctave");
    onSetting("lab-offset", "offsetMs");
    onSetting("lab-timing", "timing", function () {
      if (state.running) stop();
    });
    onSetting("lab-riff-track", "riffTrack", function () {
      if (state.running) stop();
      fillRiffSelects();
      resetRun();
      loadSequence();
      $("lab-tone-status").textContent = "";
    });
    onSetting("lab-riff-phrase", "riffPhrase", function () {
      if (state.running) stop();
      resetRun();
      loadSequence();
    });
    onSetting("lab-meter", "meter", function () {
      if (metro.on && !state.timed) metroStart();
      renderMetro();
    });
    $("lab-bpm").addEventListener("change", function () {
      setBpm($("lab-bpm").value);
    });
    $("lab-bpm-range").addEventListener("input", function () {
      setBpm($("lab-bpm-range").value);
    });
    root.querySelectorAll("[data-bpm-step]").forEach(function (b) {
      b.addEventListener("click", function () {
        setBpm(S.bpm + Number(b.dataset.bpmStep));
      });
    });
    $("lab-tap-tempo").addEventListener("click", tapTempo);
    $("lab-metro-go").addEventListener("click", function () {
      if (metro.on && metro.until === Infinity) {
        if (state.timed && state.timed.source === "click") stop();
        else metroStop();
      } else metroStart();
    });
    $("lab-riff-tone").addEventListener("click", loadRiffTone);
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!measureStaff()) return;
        if (state.piece) state.pages = buildPages(state.seq, state.piece);
        renderStaff();
      }, 120);
    });
    document.addEventListener("practice:track", function (event) {
      var id = event.detail && event.detail.id;
      if (state.mode !== "riff" || !id || id === S.riffTrack) return;
      if (state.running) stop();
      S.riffTrack = id;
      save();
      fillRiffSelects();
      resetRun();
      loadSequence();
      $("lab-tone-status").textContent = "";
      render();
    });
    document.addEventListener("practice:ready", function () {
      fillRiffSelects();
      if (state.mode === "riff" && !state.running) setMode("riff");
    });
    onSetting("lab-level", "level", function () {
      state.pool = null;
      if (state.running) start();
    });
    onSetting("lab-round", "round", function () {
      if (state.running) start();
    });
    onSetting("lab-scale", "scale", function () {
      resetRun();
      loadSequence();
    });
    onSetting("lab-song", "song", function () {
      resetRun();
      setBpm(currentSong().bpm);
      loadSequence();
    });

    $("lab-go").addEventListener("click", function () {
      audioCtx();
      start();
    });
    $("lab-stop").addEventListener("click", stop);
    $("lab-skip").addEventListener("click", function () {
      if (!state.running || state.mode !== "quest" || !state.target) return;
      onMiss({ midi: -1000, cents: 0 }, state.target);
      setMessage("Skipped " + C.noteName(state.target) + " \u2014 " + C.describePosition(C.fretPositions(state.target.midi)[0]) + ".");
      nextTarget();
      render();
    });
    $("lab-hint").addEventListener("click", function () {
      if (!state.running || !state.target) return;
      state.hint = true;
      if (S.round === "challenge") state.streak = 0;
      var spots = C.fretPositions(state.target.midi);
      setMessage(
        "It's " + C.noteName(state.target) + ". Try the " + C.describePosition(spots[0]) + "." + (S.round === "challenge" ? " Hints reset your streak." : "")
      );
      render();
    });
    $("lab-hear").addEventListener("click", function () {
      var target = activeTarget();
      if (target) {
        pluck(target.midi, 0, 1.2);
        return;
      }
      if (state.mode === "song") {
        if (synth.stopAt > now()) {
          stopSounds();
          return;
        }
        hearSequence(C.parseSong(currentSong()).notes, currentSong().bpm);
      } else if (state.mode === "riff" && state.seq.length) {
        if (synth.stopAt > now()) {
          stopSounds();
          return;
        }
        hearSequence(state.seq, state.piece.bpm);
      } else if (state.mode === "scale") {
        hearSequence(C.scaleNotes(C.findById(C.SCALES, S.scale)), 160);
      } else if (state.mode === "quest") {
        hearSequence(
          C.findById(C.LEVELS, S.level).notes.slice(0, 8).map(function (n) {
            return { note: C.parseNote(n), beats: 1 };
          }),
          140
        );
      }
    });
    $("lab-fret").addEventListener("click", function (e) {
      var midi = e.target && e.target.getAttribute && e.target.getAttribute("data-midi");
      if (midi && S.input === "tap") tapNote(Number(midi));
    });
    $("lab-drill").addEventListener("click", function () {
      var weak = C.weakestNotes(store.notes, 6);
      if (weak.length < 2) return;
      state.mode = "quest";
      state.pool = weak.map(function (w) {
        var n = C.noteFromMidi(w.midi);
        return n.letter + n.accidental + n.octave;
      });
      start();
      setMessage("Drilling your weak notes. They repeat until they stick.");
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("lab-reset").addEventListener("click", function () {
      if (!window.confirm("Reset Staff Lab scores, stars, and trophies?")) return;
      var keep = store.settings;
      store = loadStore();
      store.best = {};
      store.notes = {};
      store.scales = {};
      store.songs = {};
      store.trophies = {};
      store.levelHits = {};
      store.settings = keep;
      S = keep;
      save();
      refreshSelects();
      renderTrophies();
      render();
    });
  }

  window.StaffLab = {
    onAmpStatus: function (status) {
      var was = state.ampRunning;
      state.ampRunning = !!(status && status.running);
      if (was !== state.ampRunning) inputStatus();
      if (S.input !== "amp") return;
      var tuner = (status && status.tuner) || {};
      var meters = (status && status.meters) || {};
      handleFrame({
        active: !!tuner.active,
        midi: tuner.midi,
        cents: tuner.cents,
        hz: tuner.hz,
        level: Number(meters.in) || 0,
      });
    },
    ownsTuner: function () {
      return S.input !== "amp";
    },
    wantsFastStatus: function () {
      return S.input === "amp" && state.running;
    },
    play: tapNote,
    /* Switches to Riffs & leads for this track and phrase; timed plays along with the backing track. */
    startJam: function (trackId, phraseId, timed) {
      if (state.running) stop();
      S.riffTrack = trackId;
      S.riffPhrase = phraseId;
      S.timing = timed === false ? "wait" : "time";
      save();
      setMode("riff");
      start();
    },
    stop: function () {
      if (state.running) stop();
    },
    state: function () {
      return { mode: state.mode, running: state.running, timed: !!state.timed, trackId: state.mode === "riff" && riffTrack() ? riffTrack().id : null };
    },
    renderTab: renderTabStrip,
    hear: function (notes, bpm) {
      if (synth.stopAt > now()) stopSounds();
      else hearSequence(notes, bpm);
    },
  };

  /* A tab-only strip for the Practice tab: chords over each bar, lines of barsPerRow bars. */
  function renderTabStrip(svg, notes, opts) {
    opts = opts || {};
    var width = Math.max(480, Math.round(svg.clientWidth || svg.parentNode.clientWidth || 640));
    var perBar = opts.perBar || 4;
    var bars = opts.bars || 1;
    var perRow = opts.barsPerRow || (width >= 860 ? 4 : 2);
    var rows = Math.ceil(bars / perRow);
    var rowH = 5 * TAB_GAP + 40;
    svg.setAttribute("viewBox", "0 0 " + width + " " + rows * rowH);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var x0 = 40;
    var barW = (width - x0 - 8) / perRow;
    var positions = [];
    for (var r = 0; r < rows; r++) {
      var top = r * rowH + 22;
      var tab = {
        top: top,
        bottom: top + 5 * TAB_GAP,
        y: function (s) {
          return this.top + (s - 1) * TAB_GAP;
        },
      };
      var rowBars = Math.min(perRow, bars - r * perRow);
      var x1 = x0 + rowBars * barW;
      var lines = el("g", { class: "lab-tab-lines" });
      for (var s = 1; s <= 6; s++) lines.appendChild(el("line", { x1: 6, x2: x1, y1: tab.y(s), y2: tab.y(s) }));
      svg.appendChild(lines);
      ["T", "A", "B"].forEach(function (letter, i) {
        svg.appendChild(el("text", { class: "lab-tab-clef", x: 18, y: top + 15 + i * 17 }, letter));
      });
      for (var b = 0; b <= rowBars; b++) {
        var bx = x0 + b * barW;
        svg.appendChild(el("line", { class: "lab-bar" + (r * perRow + b === bars ? " is-final" : ""), x1: bx, x2: bx, y1: tab.top, y2: tab.bottom }));
        if (b < rowBars && opts.chords) {
          svg.appendChild(el("text", { class: "lab-chord", x: bx + 10, y: top - 8 }, opts.chords[r * perRow + b] || ""));
        }
      }
      positions.push({ tab: tab, x0: x0 });
    }
    notes.forEach(function (n, i) {
      if (n.rest) return;
      var row = Math.floor(n.bar / perRow);
      var p = positions[row];
      if (!p) return;
      var x = x0 + (n.bar - row * perRow) * barW + 16 + (n.pos / perBar) * (barW - 26);
      var st = opts.status ? opts.status[i] : "";
      var cls = st === "hit" ? "is-hit" : st === "miss" ? "is-missed" : i === opts.current ? "is-target" : "";
      drawTabNumber(svg, p.tab, { x: x, tab: { string: n.string, fret: n.fret }, cls: cls });
    });
    if (opts.cursorBeat != null && opts.cursorBeat >= 0) {
      var cb = Math.floor(opts.cursorBeat / perBar);
      var crow = Math.floor(cb / perRow);
      var cp = positions[crow];
      if (cp) {
        var cx = x0 + (cb - crow * perRow) * barW + 16 + ((opts.cursorBeat - cb * perBar) / perBar) * (barW - 26);
        svg.appendChild(el("line", { class: "lab-playhead", x1: cx, x2: cx, y1: cp.tab.top - 8, y2: cp.tab.bottom + 8 }));
      }
    }
  }

  measureStaff();
  wire();
  renderTrophies();
  if (S.input === "mic") {
    S.input = "amp";
    root.querySelectorAll('input[name="lab-input"]').forEach(function (r) {
      r.checked = r.value === "amp";
    });
  }
  setMode("free");

  if (demoMode) runDemo(demoMode);

  function runDemo(which) {
    S.input = "tap";
    S.names = true;
    root.querySelectorAll('input[name="lab-input"]').forEach(function (r) {
      r.checked = r.value === "tap";
    });
    $("lab-names").checked = true;
    var free = [40, 45, 48, 52, 55, 59, 64, 66];
    var count = 0;
    if (which === "concert") {
      S.notation = "concert";
      $("lab-notation").value = "concert";
      which = "free";
    }
    if (which !== "free") setMode(which);
    if (which === "song") {
      S.song = "ode";
      $("lab-song").value = "ode";
      loadSequence();
    }
    if (which !== "free") start();
    var timer = setInterval(function () {
      count++;
      var target = activeTarget();
      if (which === "free" || !target) {
        if (which === "free") onNote({ midi: free[count % free.length], cents: count % 3 ? 3 : -22 });
        if (count > 7 && which === "free") clearInterval(timer);
        return;
      }
      var wrong = count % 5 === 3;
      onNote({ midi: wrong ? target.midi + 2 : target.midi, cents: count % 2 ? 4 : 18 });
      if (count >= Number((/[?&]labSteps=(\d+)/.exec(location.search) || [])[1] || 9)) clearInterval(timer);
    }, 350);
  }
})();
