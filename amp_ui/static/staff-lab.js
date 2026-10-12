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
  var TOP = 12;

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
      { notation: "guitar", names: true, frets: true, anyOctave: false, input: "amp", level: "open", round: "practice", scale: "c-major", song: "mary" },
      s.settings || {}
    );
    ["best", "notes", "scales", "songs", "trophies", "levelHits"].forEach(function (k) {
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
      pluck(item.note.midi, t, Math.min(1.2, item.beats * beat * 0.95));
      t += item.beats * beat;
    });
    synth.stopAt = now() + (t - ctx.currentTime) * 1000;
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

  function geometry() {
    var g = C.notation(S.notation);
    var height = TOP + (g.maxStep - g.minStep) * HALF + 34;
    return {
      n: g,
      height: height,
      y: function (step) {
        return TOP + (g.maxStep - step) * HALF;
      },
      labelY: height - 10,
    };
  }

  function drawStaffFrame(svg, geo, opts) {
    var lines = el("g", { class: "lab-lines" });
    geo.n.lines.forEach(function (step) {
      lines.appendChild(el("line", { x1: 16, x2: STAFF_W - 10, y1: geo.y(step), y2: geo.y(step) }));
    });
    svg.appendChild(lines);
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
      if (dur === "e") {
        var d = up
          ? "M" + sx + " " + sy + " c 2 8 12 10 9 22 c 0 -8 -5 -12 -9 -14 z"
          : "M" + sx + " " + sy + " c 2 -8 12 -10 9 -22 c 0 8 -5 12 -9 14 z";
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

  function freeScene() {
    var items = state.trail.map(function (entry, i) {
      var newest = i === state.trail.length - 1;
      return {
        note: entry.note,
        x: 128 + (8 - state.trail.length + i) * 62,
        cls: newest ? "is-live" : "is-ghost",
        forceName: newest,
      };
    });
    return { items: items };
  }

  function questScene() {
    var items = [];
    if (state.target) {
      items.push({ note: state.target, x: 250, cls: "is-target", tag: "play this", forceName: state.hint });
    }
    if (playedIsFresh()) {
      items.push({
        note: state.played.note,
        x: 400,
        cls: state.played.ok ? "is-ok" : "is-bad",
        tag: "you played",
        forceName: true,
      });
    }
    return { items: items };
  }

  function buildPages(seq, isSong) {
    var pages = [];
    var perLine = $("lab-stage").clientWidth < 560 ? 6 : 12;
    var maxNotes = Math.ceil(seq.length / Math.ceil(seq.length / perLine));
    var start = 0;
    while (start < seq.length) {
      var end = Math.min(seq.length, start + maxNotes);
      if (isSong && end < seq.length) {
        var cut = end;
        while (cut > start + 1 && seq[cut].bar === seq[cut - 1].bar) cut--;
        if (cut > start + 1) end = cut;
      }
      pages.push({ start: start, end: end });
      start = end;
    }
    return pages;
  }

  function seqScene() {
    var page = state.pages[0];
    for (var p = 0; p < state.pages.length; p++) {
      if (state.index >= state.pages[p].start && state.index < state.pages[p].end) page = state.pages[p];
    }
    if (!page) return { items: [], bars: [] };
    if (!state.running && state.index >= state.seq.length) page = state.pages[state.pages.length - 1];
    var isSong = state.mode === "song";
    var slots = [];
    var pos = 0;
    var bars = [];
    for (var i = page.start; i < page.end; i++) {
      if (isSong && i > page.start && state.seq[i].bar !== state.seq[i - 1].bar) {
        bars.push(pos + 0.1);
        pos += 0.6;
      }
      slots.push(pos);
      pos += 1;
    }
    var x0 = isSong && page.start === 0 ? 104 : 86;
    var width = STAFF_W - 24 - x0;
    var slotW = width / Math.max(pos, 6);
    var items = [];
    for (i = page.start; i < page.end; i++) {
      var cls = i < state.index ? "is-done" : i === state.index && state.running ? "is-target" : "is-todo";
      items.push({
        note: state.seq[i].note,
        dur: isSong ? state.seq[i].dur : "q",
        x: x0 + (slots[i - page.start] + 0.5) * slotW,
        cls: cls,
      });
    }
    var current = items[state.index - page.start];
    if (current && playedIsFresh() && !state.played.ok) {
      items.push({ note: state.played.note, x: current.x + 20, cls: "is-bad is-small", forceName: true });
    }
    var barX = bars.map(function (b) {
      return x0 + b * slotW;
    });
    var end = page.end === state.seq.length ? x0 + pos * slotW : null;
    return {
      items: items,
      bars: barX,
      finalBar: end,
      meter: isSong && page.start === 0 ? currentSong().meter : null,
      pageLabel: state.pages.length > 1 ? "Line " + (state.pages.indexOf(page) + 1) + " of " + state.pages.length : "",
    };
  }

  function renderStaff() {
    var svg = $("lab-staff");
    var geo = geometry();
    svg.setAttribute("viewBox", "0 0 " + STAFF_W + " " + geo.height);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var scene;
    if (state.mode === "quest" && state.running) scene = questScene();
    else if ((state.mode === "scale" || state.mode === "song") && state.seq.length) scene = seqScene();
    else scene = freeScene();
    drawStaffFrame(svg, geo, { meter: scene.meter });
    var lowStep = geo.n.id === "concert" ? -10 : 2;
    (scene.bars || []).forEach(function (x) {
      svg.appendChild(el("line", { class: "lab-bar", x1: x, x2: x, y1: geo.y(10), y2: geo.y(lowStep) }));
    });
    if (scene.finalBar) {
      svg.appendChild(el("line", { class: "lab-bar", x1: scene.finalBar - 5, x2: scene.finalBar - 5, y1: geo.y(10), y2: geo.y(lowStep) }));
      svg.appendChild(el("line", { class: "lab-bar is-final", x1: scene.finalBar, x2: scene.finalBar, y1: geo.y(10), y2: geo.y(lowStep) }));
    }
    scene.items.forEach(function (item) {
      drawNote(svg, geo, item);
    });
    if (scene.pageLabel) {
      svg.appendChild(el("text", { class: "lab-page", x: STAFF_W - 14, y: 16 }, scene.pageLabel));
    }
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
    if (!state.running) return null;
    if (state.mode === "quest") return state.target;
    if (state.mode === "scale" || state.mode === "song") return state.seq[state.index] ? state.seq[state.index].note : null;
    return null;
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
      var spots = C.fretPositions(target.midi);
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
    } else if (state.mode === "scale" || state.mode === "song") {
      var total = state.seq.length;
      var bestStars = state.mode === "scale" ? store.scales[S.scale] : store.songs[S.song];
      html += hudItem("Note", total ? Math.min(state.index + (state.running ? 1 : 0), total) + " / " + total : "\u2014");
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
      node.hidden = !show;
    });
    $("lab-go").textContent = state.running ? "Restart" : "Start";
    $("lab-hear").textContent = state.mode === "song" && !state.running ? "Hear the melody" : "Hear it";
    var tip = "";
    if (state.mode === "quest") tip = state.pool ? "Your weak notes come up until you nail them." : C.findById(C.LEVELS, S.level).tip;
    else if (state.mode === "scale") tip = C.findById(C.SCALES, S.scale).tip;
    else if (state.mode === "song") tip = C.findById(C.SONGS, S.song).tip;
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
    var colors = ["#ff6b2c", "#ffb347", "#ffe08a", "#7be0a5", "#7ab8ff", "#ff7ab8"];
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
    $("lab-result").hidden = true;
    detector.reset();
  }

  function loadSequence() {
    if (state.mode === "scale") {
      state.seq = C.scaleNotes(C.findById(C.SCALES, S.scale));
      state.pages = buildPages(state.seq, false);
    } else if (state.mode === "song") {
      state.seq = C.parseSong(currentSong()).notes;
      state.pages = buildPages(state.seq, true);
    } else {
      state.seq = [];
      state.pages = [];
    }
  }

  function setMode(mode) {
    stopSounds();
    resetRun();
    state.mode = mode;
    state.pool = null;
    loadSequence();
    if (mode === "free") setMessage("Play any note. It shows up on the staff.");
    else if (mode === "quest") setMessage("Read the note, play it. Press Start when you're ready.");
    else if (mode === "scale") setMessage("Climb the scale up and back down, one note at a time. Press Start.");
    else setMessage("Play the melody note by note. It waits for you. Press Start, or hear it first.");
    render();
  }

  function start() {
    stopSounds();
    resetRun();
    loadSequence();
    state.running = true;
    state.startedAt = now();
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
      setMessage(state.mode === "song" ? "First note: " + C.noteName(state.seq[0].note) + ". Take your time." : "Start at the bottom: " + C.noteName(state.seq[0].note) + ".");
    }
    render();
  }

  function stop() {
    stopSounds();
    clearTimer();
    state.running = false;
    state.target = null;
    setMessage("Stopped. Press Start to go again.");
    render();
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
      var total = state.seq.length;
      var stars = C.stars(state.misses, total);
      var bucket = state.mode === "scale" ? store.scales : store.songs;
      var id = state.mode === "scale" ? S.scale : S.song;
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
      var title = state.mode === "scale" ? C.findById(C.SCALES, id).title : currentSong().title;
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
    if (state.mode === "scale" || state.mode === "song") return state.seq[state.index] ? state.seq[state.index].note : null;
    return null;
  }

  function onNote(ev) {
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
  }

  function wire() {
    refreshSelects();
    $("lab-notation").value = S.notation;
    $("lab-names").checked = !!S.names;
    $("lab-frets").checked = !!S.frets;
    $("lab-octave").checked = !!S.anyOctave;
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
    onSetting("lab-octave", "anyOctave");
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
  };

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
