(function () {
  var theory = window.PracticeTheory;
  var panel = document.getElementById("practice-panel");
  if (!panel) return;

  var audio = new Audio();
  audio.preload = "auto";
  audio.loop = true;

  var STORAGE = "samsounds.practice.v1";
  var TONICS = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"];
  var state = {
    catalog: [],
    kind: "library",
    track: null,
    scales: [],
    lessons: [],
    scaleId: "",
    lesson: null,
    step: null,
    box: null,
    chordMode: false,
    bar: -1,
    chordPcs: null,
    dots: [],
    fileName: "",
    objectUrl: "",
    seeking: false,
    riffs: null,
    phraseId: "riff",
    riffNotes: [],
    jam: null,
    geo: null,
    live: null,
    liveTimer: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function practiceScriptSrc() {
    var nodes = document.getElementsByTagName("script");
    var i;
    for (i = nodes.length - 1; i >= 0; i -= 1) {
      var raw = nodes[i].getAttribute("src") || "";
      if (/(^|\/)practice\.js(\?|#|$)/.test(raw)) return nodes[i].src || "";
    }
    return "";
  }

  function practiceAsset(path) {
    var base = theory && theory.assetBaseFromScript
      ? theory.assetBaseFromScript(practiceScriptSrc())
      : "/static/";
    return base + String(path || "").replace(/^\//, "");
  }

  function store() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
    } catch (error) {}
  }

  function progressId() {
    if (!state.track) return "practice";
    return state.track.id || "practice";
  }

  function doneKey(lesson, step) {
    return progressId() + ":" + lesson.id + ":" + step.id;
  }

  function isDone(lesson, step) {
    var data = store();
    return !!(data.done && data.done[doneKey(lesson, step)]);
  }

  function setDone(lesson, step, value) {
    var data = store();
    data.done = data.done || {};
    data.done[doneKey(lesson, step)] = !!value;
    if (!value) delete data.done[doneKey(lesson, step)];
    save(data);
  }

  function showPracticeError(message) {
    var el = $("practice-error");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function scaleById(id) {
    for (var i = 0; i < state.scales.length; i += 1) {
      if (state.scales[i].id === id) return state.scales[i];
    }
    return state.scales[0] || null;
  }

  function currentScale() {
    return scaleById(state.scaleId);
  }

  function progression() {
    return (state.track && state.track.progression) || [];
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var whole = Math.floor(seconds);
    var mins = Math.floor(whole / 60);
    var secs = whole % 60;
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  function barCount() {
    return progression().length;
  }

  // Timed chords: a track may carry "chords": [{"t": seconds, "chord": "C"}, ...]
  // (e.g. mapped from a real recording). Tracks without it keep the even split below.
  function timedChords() {
    var list = state.track && state.track.chords;
    return Array.isArray(list) && list.length ? list : null;
  }

  function timedIndexAt(seconds) {
    var list = timedChords();
    if (!list) return -1;
    var lo = 0, hi = list.length - 1, found = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (list[mid].t <= seconds + 0.0001) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function barLength() {
    var count = barCount();
    if (!count || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return audio.duration / count;
  }

  function currentBar() {
    if (timedChords()) return timedIndexAt(audio.currentTime);
    var length = barLength();
    if (!length) return -1;
    return Math.max(0, Math.min(barCount() - 1, Math.floor((audio.currentTime + 0.0001) / length)));
  }

  function shownBar() {
    if (state.bar >= 0) return state.bar;
    if (timedChords()) return 0;
    return progression().length ? 0 : -1;
  }

  function chordAt(index) {
    var timed = timedChords();
    if (timed) return index >= 0 && index < timed.length ? timed[index].chord : "";
    var chords = progression();
    if (index < 0 || index >= chords.length) return "";
    return chords[index];
  }

  function setChordPcs(symbol) {
    var scale = currentScale();
    var chord = symbol && scale ? theory.analyzeChord(symbol, scale) : null;
    if (!chord) {
      state.chordPcs = null;
      return;
    }
    var map = {};
    chord.pcs.forEach(function (pc) {
      map[pc] = true;
    });
    state.chordPcs = map;
  }

  function initTabs() {
    var rig = $("tab-rig");
    var practice = $("tab-practice");
    var song = $("tab-song");
    var rigPanels = $("rig-panels");
    var songPanel = $("song-panel");
    var staffLab = $("staff-lab");
    if (!rig || !practice || !rigPanels) return;
    function show(which) {
      var practiceOn = which === "practice";
      var songOn = which === "song";
      rig.setAttribute("aria-selected", !practiceOn && !songOn ? "true" : "false");
      practice.setAttribute("aria-selected", practiceOn ? "true" : "false");
      if (song) song.setAttribute("aria-selected", songOn ? "true" : "false");
      rigPanels.hidden = practiceOn || songOn;
      panel.hidden = !practiceOn;
      if (songPanel) songPanel.hidden = !songOn;
      if (staffLab) staffLab.hidden = songOn;
      if (practiceOn) syncGuitarFromAmp();
      if (songOn && window.SongStudio && window.SongStudio.controller()) {
        window.SongStudio.controller().renderSongScore();
      }
    }
    rig.addEventListener("click", function () { show("rig"); });
    practice.addEventListener("click", function () { show("practice"); });
    if (song) song.addEventListener("click", function () { show("song"); });
  }

  function initSources() {
    var libraryBtn = $("source-library");
    var localBtn = $("source-local");
    function show(which) {
      state.kind = which;
      libraryBtn.setAttribute("aria-selected", which === "library" ? "true" : "false");
      localBtn.setAttribute("aria-selected", which === "local" ? "true" : "false");
      $("practice-library").hidden = which !== "library";
      $("practice-local").hidden = which !== "local";
      if (which === "library" && state.catalog.length) {
        var select = $("practice-track");
        var track = state.catalog.filter(function (item) { return item.id === select.value; })[0] || state.catalog[0];
        showLibraryTrack(track, false);
      } else {
        refreshLocalTheory();
      }
    }
    libraryBtn.addEventListener("click", function () { show("library"); });
    localBtn.addEventListener("click", function () { show("local"); });
  }

  function fillTonicSelect() {
    var select = $("practice-tonic");
    TONICS.forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === "A") option.selected = true;
      select.appendChild(option);
    });
    $("practice-mode").value = "minor";
  }

  function parsedChordEntry() {
    var raw = ($("practice-local-chords").value || "").trim();
    var tokens = raw ? raw.split(/[\s,]+/) : [];
    var good = [];
    var bad = [];
    tokens.forEach(function (token) {
      if (theory.parseChord(token)) good.push(token);
      else bad.push(token);
    });
    return { good: good, bad: bad };
  }

  function refreshLocalTheory() {
    var tonic = $("practice-tonic").value || "A";
    var mode = $("practice-mode").value || "minor";
    var chords = parsedChordEntry();
    var bpm = parseFloat($("practice-local-bpm").value);
    var previous = state.step ? state.lesson.id + ":" + state.step.id : "";
    state.track = {
      id: "local:" + tonic + ":" + mode,
      title: state.fileName || "Local file",
      key: theory.keyLabel(tonic, mode),
      tonic: tonic,
      mode: mode,
      progression: chords.good,
      bpm: isFinite(bpm) ? bpm : null,
      timeSignature: "4/4",
      feel: "",
    };
    state.scales = theory.suggestScales(tonic, mode);
    if (!scaleById(state.scaleId)) state.scaleId = state.scales.length ? state.scales[0].id : "";
    state.lessons = theory.resolveLessons(state.track, state.scales);
    showPracticeError(chords.bad.length ? "Couldn't read " + chords.bad.join(", ") + ". Use chord names like Am7, G, or C#m." : "");
    renderStudy();
    restoreStep(previous);
    renderMeta();
    renderFretboard();
  }

  function restoreStep(key) {
    state.lesson = null;
    state.step = null;
    if (!key) return;
    state.lessons.forEach(function (lesson) {
      lesson.steps.forEach(function (step) {
        if (lesson.id + ":" + step.id === key) {
          state.lesson = lesson;
          state.step = step;
        }
      });
    });
    if (!state.step) return;
    if (state.step.scaleId && scaleById(state.step.scaleId)) state.scaleId = state.step.scaleId;
    state.box = stepBox(state.step);
    state.chordMode = state.lesson.kind === "chord-tones";
    if (state.chordMode) setChordPcs(chordAt(shownBar()));
    else state.chordPcs = null;
    markSelectedStep();
    renderDetail();
  }

  function stepBox(step) {
    if (!step || step.fretStart === undefined || step.fretEnd === undefined) return null;
    return { start: step.fretStart, end: step.fretEnd };
  }

  function showLibraryTrack(track, keepPlaying) {
    var wasPlaying = keepPlaying && !audio.paused;
    state.kind = "library";
    state.track = track;
    state.scales = track.scales || [];
    var home = theory.primaryScale(state.scales);
    state.scaleId = home ? home.id : (state.scales[0] && state.scales[0].id);
    state.lessons = theory.resolveLessons(track, state.scales);
    state.lesson = null;
    state.step = null;
    state.box = null;
    state.chordMode = false;
    state.bar = -1;
    audio.src = practiceAsset("practice/" + track.file);
    audio.currentTime = 0;
    renderStudy();
    renderDetail();
    renderMeta();
    renderFretboard();
    var data = store();
    data.trackId = track.id;
    save(data);
    document.dispatchEvent(new CustomEvent("practice:track", { detail: { id: track.id } }));
    if (wasPlaying) {
      audio.play().catch(function (error) {
        showPracticeError(error.message || "Couldn't play that track.");
      });
    }
  }

  function renderMeta() {
    var meta = $("practice-meta");
    var track = state.track;
    meta.textContent = "";
    if (!track) return;
    var title = document.createElement("p");
    title.className = "track-title";
    title.textContent = track.title || "Practice";
    var key = document.createElement("p");
    key.className = "key-line";
    key.textContent = "Key · " + (track.key || theory.keyLabel(track.tonic, track.mode) || "Set a key");
    meta.appendChild(title);
    meta.appendChild(key);
    var bits = [];
    if (track.genre) bits.push(track.genre);
    if (track.bpm) bits.push(track.bpm + " BPM");
    if (track.feel) {
      var feelLabel = String(track.feel).split("-").map(function (word) {
        return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
      }).join(" ");
      if (!track.genre || feelLabel.toLowerCase() !== String(track.genre).toLowerCase()) bits.push(feelLabel);
    }
    if (track.timeSignature) bits.push(track.timeSignature);
    if (progression().length) bits.push(progression().length + " bars");
    if (bits.length) {
      var tempo = document.createElement("p");
      tempo.className = "tempo-line";
      tempo.textContent = bits.join(" · ");
      meta.appendChild(tempo);
    }
    var entry = riffEntry();
    if (entry && entry.tone && state.kind === "library") meta.appendChild(toneCard(entry.tone));
    renderBars();
    updateNow();
    renderRiffs();
  }

  function riffEntry() {
    if (!state.riffs || !state.track || state.kind !== "library") return null;
    return state.riffs.tracks[state.track.id] || null;
  }

  function toneSummary(tone) {
    var o = tone.overrides || {};
    var bits = ["slot " + tone.slot];
    if (tone.ir) bits.push(tone.ir.replace(/\.wav$/i, "").replace(/^\d+_?/, "").replace(/[_-]+/g, " ").trim() + " IR");
    if (o.delay_ms) bits.push("delay " + o.delay_ms + " ms");
    if (o.mix != null) bits.push("mix " + Math.round(o.mix * 100) + "%");
    return bits.join(" · ");
  }

  function toneCard(tone) {
    var card = document.createElement("div");
    card.className = "tone-card";
    var head = document.createElement("div");
    head.className = "tone-head";
    var name = document.createElement("p");
    name.className = "tone-name";
    name.innerHTML = "<strong></strong> <span></span>";
    name.firstChild.textContent = tone.name;
    name.lastChild.textContent = toneSummary(tone);
    var button = document.createElement("button");
    button.type = "button";
    button.className = "tone-btn";
    button.textContent = "Recommended guitar preset + IR";
    head.appendChild(name);
    head.appendChild(button);
    var why = document.createElement("p");
    why.className = "tone-why";
    why.textContent = tone.why;
    var status = document.createElement("p");
    status.className = "tone-status";
    status.setAttribute("aria-live", "polite");
    button.addEventListener("click", function () {
      if (!window.AmpUI || !window.AmpUI.loadPreset) {
        status.textContent = "The amp controls aren't loaded on this page.";
        return;
      }
      button.disabled = true;
      status.textContent = "Loading " + tone.name + "…";
      window.AmpUI.loadPreset({ slot: tone.slot, overrides: tone.overrides, ir: tone.ir })
        .then(function (data) {
          var ir = (data.params && data.params.ir) || "";
          status.textContent =
            tone.name + " is on the amp" + (ir ? " with the " + ir.replace(/\.wav$/i, "") + " cab" : "") + (data.running ? "." : ". Press Start amp to hear it.");
          card.classList.add("is-loaded");
        })
        .catch(function (error) {
          status.textContent = "Couldn't load the tone: " + error.message;
        })
        .then(function () {
          button.disabled = false;
        });
    });
    card.appendChild(head);
    card.appendChild(why);
    card.appendChild(status);
    return card;
  }

  /* ---------- riffs and leads ---------- */

  function core() {
    return window.StaffCore || null;
  }

  function currentPhrase() {
    var entry = riffEntry();
    if (!entry) return null;
    return entry.phrases.filter(function (p) { return p.id === state.phraseId; })[0] || entry.phrases[0];
  }

  function perBar() {
    return Number(String((state.track && state.track.timeSignature) || "4/4").split("/")[0]) || 4;
  }

  function jamIsOurs() {
    var jam = state.jam;
    var phrase = currentPhrase();
    return !!(jam && jam.mode === "riff" && jam.running && state.track && jam.trackId === state.track.id && phrase && jam.phraseId === phrase.id);
  }

  function renderRiffs() {
    var block = $("practice-riffs");
    var entry = riffEntry();
    var C = core();
    if (!block) return;
    block.hidden = !entry || !C;
    if (block.hidden) {
      state.riffNotes = [];
      return;
    }
    var phrase = currentPhrase();
    state.phraseId = phrase.id;
    state.riffNotes = C.parseTab(phrase.tab, perBar()).notes;
    var tabs = $("riff-phrases");
    tabs.textContent = "";
    entry.phrases.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", p.id === phrase.id ? "true" : "false");
      b.textContent = (p.kind === "lead" ? "Lead · " : "Riff · ") + p.title;
      b.addEventListener("click", function () {
        state.phraseId = p.id;
        if (jamIsOurs() || (state.jam && state.jam.running && state.jam.mode === "riff")) window.StaffLab.stop();
        renderRiffs();
      });
      tabs.appendChild(b);
    });
    $("riff-tip").textContent = phrase.tip;
    var techList = $("riff-techniques");
    techList.textContent = "";
    if (phrase.kind === "lead" && phrase.techniqueTips && phrase.techniqueTips.length) {
      techList.hidden = false;
      phrase.techniqueTips.forEach(function (tip) {
        var li = document.createElement("li");
        var strong = document.createElement("strong");
        strong.textContent = tip.technique + ": ";
        li.appendChild(strong);
        li.appendChild(document.createTextNode(tip.text));
        techList.appendChild(li);
      });
    } else {
      techList.hidden = true;
    }
    drawRiffTab();
    updateRiffActions();
  }

  function riffCursor() {
    if (jamIsOurs() && state.jam.source === "track") return state.jam.cursorBeat;
    if (!state.riffNotes.length || audio.paused || !state.track) return null;
    return (audio.currentTime * state.track.bpm) / 60;
  }

  function riffCurrentIndex() {
    if (jamIsOurs()) return state.jam.index;
    var beat = riffCursor();
    if (beat == null) return -1;
    for (var i = 0; i < state.riffNotes.length; i++) {
      var n = state.riffNotes[i];
      if (beat >= n.beat - 0.02 && beat < n.beat + n.beats - 0.02) return n.rest ? -1 : i;
    }
    return -1;
  }

  function drawRiffTab() {
    var svg = $("riff-tab");
    if (!svg || !window.StaffLab || !state.riffNotes.length) return;
    var ours = jamIsOurs();
    window.StaffLab.renderTab(svg, state.riffNotes, {
      perBar: perBar(),
      bars: progression().length,
      chords: progression(),
      current: riffCurrentIndex(),
      status: ours ? state.jam.status : null,
      cursorBeat: riffCursor(),
    });
  }

  function updateRiffActions() {
    var ours = jamIsOurs();
    $("riff-stop").hidden = !ours;
    $("riff-play").textContent = ours && state.jam.timed ? "Restart" : "Play along (scored)";
    var score = $("riff-score");
    var jam = state.jam;
    if (ours && jam.stats) {
      var st = jam.stats;
      score.textContent =
        "Pass " + (jam.pass + 1) + " · " + st.hits + " of " + st.total + " hit" + (st.hits + st.misses ? " · " + Math.round(100 * st.accuracy) + "%" : "") + " · streak " + jam.streak + " · " + jam.score + " pts";
    } else if (ours) {
      score.textContent = "Learning mode: play each note when it lights up. Staff Lab above shows it on the staff.";
    } else {
      score.textContent = "Play along starts the track with a one-bar count-in and scores each note from your guitar.";
    }
  }

  function riffTick() {
    if (!state.riffNotes.length) return;
    drawRiffTab();
    drawLive();
  }

  function startRiffLoop() {
    if (state.riffLoop) return;
    state.riffLoop = true;
    requestAnimationFrame(function frame() {
      riffTick();
      if (!audio.paused || jamIsOurs()) requestAnimationFrame(frame);
      else {
        state.riffLoop = false;
        riffTick();
      }
    });
  }

  function initRiffs() {
    $("riff-play").addEventListener("click", function () {
      var phrase = currentPhrase();
      if (!phrase || !window.StaffLab) return;
      window.StaffLab.startJam(state.track.id, phrase.id, true);
    });
    $("riff-learn").addEventListener("click", function () {
      var phrase = currentPhrase();
      if (!phrase || !window.StaffLab) return;
      window.StaffLab.startJam(state.track.id, phrase.id, false);
      var lab = document.getElementById("staff-lab");
      if (lab) lab.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("riff-hear").addEventListener("click", function () {
      if (window.StaffLab && state.riffNotes.length) window.StaffLab.hear(state.riffNotes, state.track.bpm);
    });
    $("riff-stop").addEventListener("click", function () {
      if (window.StaffLab) window.StaffLab.stop();
    });
    var tempo = $("riff-practice-tempo");
    if (tempo) {
      tempo.addEventListener("input", function () {
        $("out-riff-practice-tempo").textContent = tempo.value + "%";
        applyRiffPracticeRate();
        var data = store();
        data.riffPracticeTempo = Number(tempo.value);
        save(data);
      });
    }
    var phraseLoop = $("riff-phrase-loop");
    if (phraseLoop) {
      phraseLoop.addEventListener("change", function () {
        var data = store();
        data.riffPhraseLoop = phraseLoop.checked;
        save(data);
      });
    }
    var saved = store();
    if (typeof saved.riffPracticeTempo === "number" && tempo) {
      tempo.value = String(saved.riffPracticeTempo);
      $("out-riff-practice-tempo").textContent = tempo.value + "%";
      applyRiffPracticeRate();
    }
    if (saved.riffPhraseLoop && phraseLoop) phraseLoop.checked = true;
    ["stafflab:jam", "stafflab:tick", "stafflab:mode"].forEach(function (name) {
      document.addEventListener(name, function (event) {
        state.jam = event.detail;
        var jam = state.jam;
        if (jam.mode === "riff" && jam.running && state.track && jam.trackId === state.track.id && jam.phraseId && jam.phraseId !== state.phraseId) {
          state.phraseId = jam.phraseId;
          renderRiffs();
        }
        if (name !== "stafflab:tick") updateRiffActions();
        if (jamIsOurs()) startRiffLoop();
        else if (name !== "stafflab:tick") riffTick();
      });
    });
    document.addEventListener("stafflab:note", function (event) {
      showLive(event.detail.midi);
    });
    audio.addEventListener("play", startRiffLoop);
    window.addEventListener("resize", function () {
      drawRiffTab();
    });
  }

  /* ---------- live notes on the fretboard ---------- */

  var DEGREES = ["root", "\u266D2", "2", "\u266D3", "3", "4", "\u266D5", "5", "\u266D6", "6", "\u266D7", "7"];

  function showLive(midi) {
    state.live = { midi: midi, at: Date.now() };
    clearTimeout(state.liveTimer);
    state.liveTimer = setTimeout(function () {
      state.live = null;
      drawLive();
    }, 1600);
    drawLive();
  }

  function liveRelation(midi) {
    var C = core();
    var pc = ((midi % 12) + 12) % 12;
    var name = C ? C.noteName(C.noteFromMidi(midi, false)) : String(midi);
    var scale = currentScale();
    var chord = chordAt(shownBar());
    var parsed = chord ? theory.parseChord(chord) : null;
    var parts = [];
    var kind = "outside";
    if (parsed) {
      var degree = (pc - parsed.rootPc + 12) % 12;
      var inChord = parsed.intervals.some(function (iv) { return iv % 12 === degree; });
      parts.push((inChord ? DEGREES[degree] + " of " + chord + " (chord tone)" : DEGREES[degree] + " over " + chord));
      if (inChord) kind = "chord";
    }
    if (scale) {
      var inScale = theory.scalePitchClasses(scale).indexOf(pc) >= 0;
      parts.push(inScale ? "in " + scale.name : "outside " + scale.name);
      if (inScale && kind !== "chord") kind = "scale";
    }
    return { text: "You played " + name + (parts.length ? " — " + parts.join(" · ") : ""), kind: kind };
  }

  function drawLive() {
    var geo = state.geo;
    var line = $("fret-live");
    if (!geo) return;
    var layer = geo.layer;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    var ns = "http://www.w3.org/2000/svg";
    function spotXY(string, fret) {
      return { x: fret === 0 ? geo.left - 18 : geo.left + (fret - 0.5) * geo.fretSpace, y: geo.top + (string - 1) * geo.stringGap };
    }
    function ring(string, fret, cls, r) {
      if (fret > geo.maxFret) return;
      var p = spotXY(string, fret);
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", String(r));
      c.setAttribute("class", cls);
      layer.appendChild(c);
    }
    var index = riffCurrentIndex();
    var target = index >= 0 ? state.riffNotes[index] : null;
    if (target && !target.rest) ring(target.string, target.fret, "live-target", 11);
    var C = core();
    if (state.live && C) {
      var rel = liveRelation(state.live.midi);
      C.fretPositions(state.live.midi, geo.maxFret).forEach(function (p) {
        var hit = target && target.string === p.string && target.fret === p.fret;
        ring(p.string, p.fret, "live-note is-" + rel.kind + (hit ? " is-hit" : ""), 8.5);
      });
      if (line) {
        line.textContent = rel.text + (target ? " · next note " + C.noteName(target.note) + (C.matches(target.midi, state.live.midi, false) ? " ✓" : "") : "");
        line.className = "fret-live is-" + rel.kind;
      }
    } else if (line) {
      line.textContent = target ? "Next note: " + C.noteName(target.note) + " — " + C.describePosition({ string: target.string, fret: target.fret }) : "";
      line.className = "fret-live";
    }
  }

  function renderBars() {
    var list = $("practice-bars");
    list.textContent = "";
    progression().forEach(function (chord, index) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = chord;
      button.dataset.index = String(index);
      button.addEventListener("click", function () {
        var timed = timedChords();
        if (timed) {
          // jump to the next time this chord comes around (wraps to its first entry)
          var from = timedIndexAt(audio.currentTime) + 1, hit = -1;
          for (var k = 0; k < timed.length && hit < 0; k++) {
            var j = (from + k) % timed.length;
            if (timed[j].chord === chord) hit = j;
          }
          if (hit >= 0) audio.currentTime = timed[hit].t;
          state.bar = -1;
          onTime();
          return;
        }
        var length = barLength();
        if (length) audio.currentTime = index * length;
        state.bar = -1;
        onTime();
      });
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  function updateNow() {
    var now = $("practice-now");
    var chord = chordAt(shownBar());
    var timed = timedChords();
    if (timed) {
      var nextChord = chordAt(shownBar() + 1);
      now.textContent = chord + (nextChord ? "  →  next " + nextChord : "");
    } else {
      now.textContent = chord;
    }
    var buttons = $("practice-bars").querySelectorAll("button");
    buttons.forEach(function (button, index) {
      button.classList.toggle("is-current", timed ? button.textContent === chord : index === shownBar());
    });
    var scale = currentScale();
    var legend = $("chord-legend");
    if (!legend) return;
    if (!state.chordMode || !chord || !scale) {
      legend.textContent = state.chordMode ? "Press play, or tap a chord, to light its chord tones." : "";
      return;
    }
    var report = theory.analyzeChord(chord, scale);
    if (!report) {
      legend.textContent = "";
      return;
    }
    var line = chord + " in " + scale.name + ": " + (report.inScale.join(", ") || "no chord tones in this scale");
    if (report.missing.length) line += ". In the chord, not in this scale: " + report.missing.join(", ");
    legend.textContent = line;
  }

  function renderStudy() {
    renderScales();
    renderLessons();
    updateProgress();
  }

  function renderScales() {
    var list = $("practice-scales");
    list.textContent = "";
    state.scales.forEach(function (scale) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "scale-card" + (scale.id === state.scaleId ? " is-selected" : "");
      var name = document.createElement("span");
      name.className = "scale-name";
      name.textContent = scale.name;
      var notes = document.createElement("span");
      notes.className = "scale-notes";
      notes.textContent = (scale.notes || theory.spellScale(scale.root, scale.intervals)).join("  ");
      var why = document.createElement("p");
      why.className = "scale-why";
      why.textContent = scale.why || "";
      button.appendChild(name);
      button.appendChild(notes);
      button.appendChild(why);
      button.addEventListener("click", function () {
        state.scaleId = scale.id;
        renderScales();
        renderFretboard();
        updateNow();
      });
      list.appendChild(button);
    });
  }

  function countDone(lesson) {
    var done = 0;
    lesson.steps.forEach(function (step) {
      if (isDone(lesson, step)) done += 1;
    });
    return done;
  }

  function updateProgress() {
    var total = 0;
    var done = 0;
    state.lessons.forEach(function (lesson) {
      total += lesson.steps.length;
      done += countDone(lesson);
      var badge = document.querySelector('[data-count="' + lesson.id + '"]');
      if (badge) badge.textContent = countDone(lesson) + "/" + lesson.steps.length;
    });
    var label = $("lesson-progress");
    if (label) label.textContent = total ? done + "/" + total + " steps" : "";
  }

  function renderLessons() {
    var list = $("practice-lessons");
    list.textContent = "";
    if (!state.lessons.length) {
      var empty = document.createElement("p");
      empty.className = "lesson-summary";
      empty.textContent = "No lessons for this key yet.";
      list.appendChild(empty);
      return;
    }
    state.lessons.forEach(function (lesson, index) {
      var details = document.createElement("details");
      details.className = "lesson";
      if (index === 0 || (state.lesson && state.lesson.id === lesson.id)) details.open = true;
      var summary = document.createElement("summary");
      var title = document.createElement("span");
      title.textContent = lesson.title;
      var count = document.createElement("span");
      count.className = "lesson-count";
      count.dataset.count = lesson.id;
      count.textContent = countDone(lesson) + "/" + lesson.steps.length;
      summary.appendChild(title);
      summary.appendChild(count);
      details.appendChild(summary);
      if (lesson.summary) {
        var blurb = document.createElement("p");
        blurb.className = "lesson-summary";
        blurb.textContent = lesson.summary;
        details.appendChild(blurb);
      }
      var steps = document.createElement("ul");
      steps.className = "step-list";
      lesson.steps.forEach(function (step) {
        var item = document.createElement("li");
        item.className = "step";
        if (state.step && state.lesson && state.lesson.id === lesson.id && state.step.id === step.id) {
          item.classList.add("is-selected");
        }
        var box = document.createElement("input");
        box.type = "checkbox";
        box.checked = isDone(lesson, step);
        box.setAttribute("aria-label", "Mark " + (step.title || "step") + " done");
        var text = document.createElement("button");
        text.type = "button";
        text.className = "step-title";
        text.textContent = step.title || step.id;
        item.appendChild(box);
        item.appendChild(text);
        box.addEventListener("change", function () {
          setDone(lesson, step, box.checked);
          updateProgress();
        });
        text.addEventListener("click", function () {
          selectStep(lesson, step);
        });
        steps.appendChild(item);
      });
      details.appendChild(steps);
      list.appendChild(details);
    });
  }

  function markSelectedStep() {
    var items = $("practice-lessons").querySelectorAll(".step");
    items.forEach(function (item) {
      item.classList.remove("is-selected");
    });
    if (!state.step || !state.lesson) return;
    state.lessons.forEach(function (lesson) {
      if (lesson.id !== state.lesson.id) return;
      lesson.steps.forEach(function (step, index) {
        if (step.id !== state.step.id) return;
        var lists = $("practice-lessons").querySelectorAll(".lesson");
        state.lessons.forEach(function (candidate, lessonIndex) {
          if (candidate.id !== lesson.id) return;
          var row = lists[lessonIndex] && lists[lessonIndex].querySelectorAll(".step")[index];
          if (row) row.classList.add("is-selected");
          if (lists[lessonIndex]) lists[lessonIndex].open = true;
        });
      });
    });
  }

  function selectStep(lesson, step) {
    state.lesson = lesson;
    state.step = step;
    if (step.scaleId && scaleById(step.scaleId)) state.scaleId = step.scaleId;
    state.box = stepBox(step);
    state.chordMode = lesson.kind === "chord-tones";
    if (state.chordMode) setChordPcs(chordAt(shownBar()));
    else state.chordPcs = null;
    renderScales();
    markSelectedStep();
    renderDetail();
    renderFretboard();
    updateNow();
  }

  function renderDetail() {
    var detail = $("lesson-detail");
    detail.textContent = "";
    if (!state.step) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    var heading = document.createElement("h4");
    heading.textContent = state.step.title || "Lesson";
    var text = document.createElement("p");
    text.className = "detail-text";
    text.textContent = state.step.text || "";
    detail.appendChild(heading);
    detail.appendChild(text);
    var scale = scaleById(state.step.scaleId) || currentScale();
    if (state.step.bend && scale) {
      var bend = document.createElement("p");
      bend.className = "bend-line";
      bend.textContent = theory.bendSentence(state.step.bend, scale);
      detail.appendChild(bend);
    }
    var tab = state.step.tab || (state.step.notes ? theory.renderTab(state.step.notes) : null);
    if (tab) {
      var pre = document.createElement("pre");
      pre.className = "tab-block";
      pre.textContent = tab.join("\n");
      detail.appendChild(pre);
    }
  }

  function renderFretboard() {
    var scale = currentScale();
    var host = $("fretboard");
    var caption = $("fretboard-caption");
    host.textContent = "";
    state.dots = [];
    state.geo = null;
    if (!scale) {
      caption.textContent = "";
      return;
    }
    var maxFret = 15;
    if (state.box && state.box.end > maxFret) maxFret = state.box.end;
    var notes = theory.notesOnFretboard(scale, 0, maxFret);
    var stringCount = theory.STRING_ORDER.length;
    var left = 58;
    var top = 28;
    var fretSpace = 40;
    var stringGap = 22;
    var width = left + maxFret * fretSpace + 24;
    var height = top + (stringCount - 1) * stringGap + 36;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("role", "img");
    var labelNotes = (scale.notes || theory.spellScale(scale.root, scale.intervals)).join(" ");
    var boxLabel = state.box ? " Frets " + state.box.start + " to " + state.box.end + " highlighted." : "";
    svg.setAttribute("aria-label", scale.name + " on the fretboard. Notes " + labelNotes + "." + boxLabel);

    function el(name) {
      return document.createElementNS(ns, name);
    }

    var board = el("rect");
    board.setAttribute("x", String(left));
    board.setAttribute("y", "8");
    board.setAttribute("width", String(maxFret * fretSpace));
    board.setAttribute("height", String((stringCount - 1) * stringGap + 28));
    board.setAttribute("fill", "#12264a");
    svg.appendChild(board);

    if (state.box) {
      var box = el("rect");
      var startX = state.box.start === 0 ? left - 22 : left + (state.box.start - 1) * fretSpace;
      var endX = left + state.box.end * fretSpace;
      box.setAttribute("x", String(startX));
      box.setAttribute("y", "12");
      box.setAttribute("width", String(Math.max(8, endX - startX)));
      box.setAttribute("height", String((stringCount - 1) * stringGap + 20));
      box.setAttribute("fill", "rgba(216, 159, 88, 0.18)");
      box.setAttribute("rx", "6");
      svg.appendChild(box);
    }

    var inlays = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1, 17: 1, 19: 1 };
    Object.keys(inlays).forEach(function (fret) {
      var fretNum = Number(fret);
      if (fretNum > maxFret) return;
      var cx = left + (fretNum - 0.5) * fretSpace;
      var marks = inlays[fret];
      var mid = top + ((stringCount - 1) * stringGap) / 2;
      var ys = marks === 2 ? [mid - 16, mid + 16] : [mid];
      ys.forEach(function (y) {
        var dot = el("circle");
        dot.setAttribute("cx", String(cx));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "4");
        dot.setAttribute("fill", "rgba(163, 217, 217, 0.25)");
        svg.appendChild(dot);
      });
    });

    for (var fret = 1; fret <= maxFret; fret += 1) {
      var wire = el("line");
      var x = left + fret * fretSpace;
      wire.setAttribute("x1", String(x));
      wire.setAttribute("x2", String(x));
      wire.setAttribute("y1", String(top - 6));
      wire.setAttribute("y2", String(top + (stringCount - 1) * stringGap + 6));
      wire.setAttribute("stroke", fret === maxFret ? "#A3D9D9" : "#176571");
      wire.setAttribute("stroke-width", fret % 12 === 0 ? "3" : "1");
      svg.appendChild(wire);
      var num = el("text");
      num.setAttribute("x", String(left + (fret - 0.5) * fretSpace));
      num.setAttribute("y", String(height - 8));
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("fill", "#A3D9D9");
      num.setAttribute("font-size", "11");
      num.textContent = String(fret);
      svg.appendChild(num);
    }

    var nut = el("rect");
    nut.setAttribute("x", String(left - 4));
    nut.setAttribute("y", String(top - 8));
    nut.setAttribute("width", "6");
    nut.setAttribute("height", String((stringCount - 1) * stringGap + 16));
    nut.setAttribute("fill", "#D89F58");
    svg.appendChild(nut);

    theory.STRING_ORDER.forEach(function (stringName, index) {
      var y = top + index * stringGap;
      var line = el("line");
      line.setAttribute("x1", String(left));
      line.setAttribute("x2", String(left + maxFret * fretSpace));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "#A3D9D9");
      line.setAttribute("stroke-width", String(1 + (stringCount - 1 - index) * 0.35));
      svg.appendChild(line);
      var name = el("text");
      name.setAttribute("x", "8");
      name.setAttribute("y", String(y + 4));
      name.setAttribute("fill", "#f3f9f9");
      name.setAttribute("font-size", "12");
      name.setAttribute("font-weight", "700");
      name.textContent = theory.STRING_LABEL[stringName];
      svg.appendChild(name);
    });

    notes.forEach(function (note) {
      var stringIndex = theory.STRING_ORDER.indexOf(note.string);
      var cx = note.fret === 0 ? left - 18 : left + (note.fret - 0.5) * fretSpace;
      var cy = top + stringIndex * stringGap;
      var dot = el("circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", note.root ? "8" : "6.5");
      dot.dataset.pc = String(note.pc);
      dot.dataset.fret = String(note.fret);
      dot.dataset.string = String(stringIndex + 1);
      dot.dataset.root = note.root ? "1" : "0";
      dot.dataset.extra = note.extra ? "1" : "0";
      var title = el("title");
      title.textContent = note.name + (note.fret === 0 ? " open" : " fret " + note.fret);
      dot.appendChild(title);
      svg.appendChild(dot);
      state.dots.push(dot);
    });

    var layer = el("g");
    layer.setAttribute("class", "live-layer");
    svg.appendChild(layer);
    state.geo = { left: left, top: top, fretSpace: fretSpace, stringGap: stringGap, maxFret: maxFret, layer: layer };
    host.appendChild(svg);
    drawLive();
    var extras = theory.extraIntervals(scale);
    caption.textContent = scale.name + " · " + labelNotes + (extras.length ? " · blue notes are the ones outside the pentatonic box" : "");
    paintDots();
    updateLegend();
    if (state.box && host.scrollWidth > host.clientWidth) {
      host.scrollLeft = Math.max(0, (state.box.start / maxFret) * (host.scrollWidth - host.clientWidth) - 40);
    }
  }

  function paintDots() {
    var chordMode = state.chordMode && state.chordPcs;
    state.dots.forEach(function (dot) {
      var fret = Number(dot.dataset.fret);
      var pc = Number(dot.dataset.pc);
      var root = dot.dataset.root === "1";
      var extra = dot.dataset.extra === "1";
      var outside = state.box && (fret < state.box.start || fret > state.box.end);
      var inChord = chordMode && state.chordPcs[pc];
      var fill = "#D89F58";
      var stroke = "none";
      var opacity = "1";
      if (outside) {
        opacity = "0.14";
      } else if (chordMode && inChord && root) {
        fill = "#C33F45";
        stroke = "#A3D9D9";
      } else if (chordMode && inChord) {
        fill = "#A3D9D9";
        stroke = "#D89F58";
      } else if (chordMode) {
        fill = root ? "#C33F45" : extra ? "#A3D9D9" : "#D89F58";
        opacity = "0.28";
      } else if (root) {
        fill = "#C33F45";
      } else if (extra) {
        fill = "#A3D9D9";
      }
      dot.setAttribute("fill", fill);
      dot.setAttribute("stroke", stroke);
      dot.setAttribute("stroke-width", stroke === "none" ? "0" : "2");
      dot.setAttribute("opacity", opacity);
    });
  }

  function updateLegend() {
    var legend = $("fret-legend");
    if (!legend) return;
    legend.textContent = "";
    function item(className, text) {
      var span = document.createElement("span");
      var swatch = document.createElement("span");
      swatch.className = "swatch " + className;
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(text));
      legend.appendChild(span);
    }
    if (state.chordMode) {
      item("chord", "Chord tone");
      item("tone", "Other scale note");
      item("root", "Root, when it is a chord tone");
    } else {
      item("root", "Root");
      item("tone", "Scale note");
      var scale = currentScale();
      if (scale && theory.extraIntervals(scale).length) item("extra", "Outside the pentatonic box");
    }
    var range = document.createElement("span");
    range.textContent = "Standard tuning · nut on the left · high e on top";
    legend.appendChild(range);
  }

  function riffPracticeRate() {
    var slider = $("riff-practice-tempo");
    return slider ? Number(slider.value) / 100 : 1;
  }

  function applyRiffPracticeRate() {
    audio.playbackRate = riffPracticeRate();
  }

  function phraseLoopRange() {
    if (!$("riff-phrase-loop") || !$("riff-phrase-loop").checked || !state.riffNotes.length || !state.track) return null;
    var last = state.riffNotes[state.riffNotes.length - 1];
    var totalBeats = progression().length * perBar();
    if (!totalBeats || !isFinite(audio.duration)) return null;
    var secPerBeat = audio.duration / totalBeats;
    return { start: 0, end: (last.beat + last.beats) * secPerBeat };
  }

  function maybePhraseLoopSeek() {
    var range = phraseLoopRange();
    if (!range || audio.paused) return;
    if (audio.currentTime >= range.end - 0.02) audio.currentTime = range.start;
  }

  function onTime() {
    maybePhraseLoopSeek();
    if (!state.seeking) {
      var duration = audio.duration;
      var seek = $("practice-seek");
      if (isFinite(duration) && duration > 0) seek.value = String(audio.currentTime / duration);
      $("practice-time").textContent = formatTime(audio.currentTime) + " / " + formatTime(duration);
    }
    var bar = currentBar();
    if (bar !== state.bar) {
      state.bar = bar;
      setChordPcs(chordAt(bar));
      if (state.chordMode) paintDots();
      updateNow();
    }
    var pill = $("practice-pill");
    if (pill) pill.hidden = audio.paused;
    $("practice-pause").disabled = audio.paused;
  }

  function initTransport() {
    audio.loop = $("practice-loop").checked;
    audio.volume = parseFloat($("backing-level").value);
    $("out-backing").textContent = Number(audio.volume).toFixed(2);
    $("practice-play").addEventListener("click", function () {
      if (!audio.src) {
        showPracticeError("Pick a backing track or a local file first.");
        return;
      }
      showPracticeError("");
      audio.play().catch(function (error) {
        showPracticeError(error.message || "The browser blocked playback.");
      });
    });
    $("practice-pause").addEventListener("click", function () {
      audio.pause();
    });
    $("practice-loop").addEventListener("change", function () {
      audio.loop = $("practice-loop").checked;
      var data = store();
      data.loop = audio.loop;
      save(data);
    });
    $("backing-level").addEventListener("input", function () {
      audio.volume = parseFloat($("backing-level").value);
      $("out-backing").textContent = Number(audio.volume).toFixed(2);
      var data = store();
      data.backing = audio.volume;
      save(data);
    });
    var seek = $("practice-seek");
    seek.addEventListener("pointerdown", function () { state.seeking = true; });
    seek.addEventListener("pointerup", function () { state.seeking = false; });
    seek.addEventListener("input", function () {
      if (!isFinite(audio.duration)) return;
      audio.currentTime = parseFloat(seek.value) * audio.duration;
      state.bar = -1;
      onTime();
    });
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onTime);
    audio.addEventListener("pause", onTime);
    audio.addEventListener("ended", onTime);
    audio.addEventListener("loadedmetadata", function () {
      applyRiffPracticeRate();
      onTime();
    });
    audio.addEventListener("error", function () {
      showPracticeError("That audio file wouldn't load.");
    });
  }

  function syncGuitarFromAmp() {
    var amp = $("volume");
    var guitar = $("practice-guitar");
    if (!amp || !guitar || document.activeElement === guitar) return;
    guitar.value = amp.value;
    $("out-practice-guitar").textContent = Number(amp.value).toFixed(2);
  }

  function initMixer() {
    var amp = $("volume");
    var guitar = $("practice-guitar");
    if (amp && guitar) {
      guitar.min = amp.min;
      guitar.max = amp.max;
      guitar.step = amp.step;
      syncGuitarFromAmp();
      amp.addEventListener("input", syncGuitarFromAmp);
      guitar.addEventListener("input", function () {
        amp.value = guitar.value;
        $("out-practice-guitar").textContent = Number(guitar.value).toFixed(2);
        amp.dispatchEvent(new Event("input"));
      });
      setInterval(syncGuitarFromAmp, 500);
    }
    var saved = store();
    if (typeof saved.backing === "number") {
      $("backing-level").value = String(saved.backing);
      audio.volume = saved.backing;
      $("out-backing").textContent = saved.backing.toFixed(2);
    }
    if (saved.loop === false) {
      $("practice-loop").checked = false;
      audio.loop = false;
    }
  }

  function initLocal() {
    fillTonicSelect();
    $("practice-tonic").addEventListener("change", refreshLocalTheory);
    $("practice-mode").addEventListener("change", refreshLocalTheory);
    var chordTimer = null;
    $("practice-local-chords").addEventListener("input", function () {
      clearTimeout(chordTimer);
      chordTimer = setTimeout(refreshLocalTheory, 250);
    });
    $("practice-local-bpm").addEventListener("input", refreshLocalTheory);
    $("practice-file").addEventListener("change", function () {
      var file = $("practice-file").files && $("practice-file").files[0];
      if (!file) return;
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = URL.createObjectURL(file);
      state.fileName = file.name.replace(/\.[^.]+$/, "");
      audio.src = state.objectUrl;
      audio.currentTime = 0;
      showPracticeError("");
      refreshLocalTheory();
    });
  }

  function initNeck() {
    $("practice-neck").addEventListener("click", function () {
      state.box = null;
      renderFretboard();
    });
    $("practice-clear").addEventListener("click", function () {
      var data = store();
      var prefix = progressId() + ":";
      Object.keys(data.done || {}).forEach(function (key) {
        if (key.indexOf(prefix) === 0) delete data.done[key];
      });
      save(data);
      renderLessons();
      updateProgress();
      markSelectedStep();
    });
  }

  function trackOptionLabel(track) {
    return track.title + " · " + track.key + " · " + track.bpm + " BPM";
  }

  function filteredTracks() {
    var genre = ($("practice-genre") && $("practice-genre").value) || "";
    if (!genre) return state.catalog.slice();
    return state.catalog.filter(function (track) {
      return track.genre === genre;
    });
  }

  function fillGenreSelect() {
    var select = $("practice-genre");
    if (!select) return;
    var seen = {};
    state.catalog.forEach(function (track) {
      if (track.genre) seen[track.genre] = true;
    });
    Object.keys(seen).forEach(function (genre) {
      var option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      select.appendChild(option);
    });
    var saved = store().genre;
    if (saved && seen[saved]) select.value = saved;
    select.addEventListener("change", function () {
      var data = store();
      data.genre = select.value;
      save(data);
      fillTrackSelect(true);
    });
  }

  function fillTrackSelect(fromGenreChange) {
    var select = $("practice-track");
    var previous = select.value;
    var tracks = filteredTracks();
    select.textContent = "";
    tracks.forEach(function (track) {
      var option = document.createElement("option");
      option.value = track.id;
      option.textContent = trackOptionLabel(track);
      select.appendChild(option);
    });
    var saved = store().trackId;
    var prefer = fromGenreChange ? previous : saved;
    var chosen = tracks.filter(function (track) { return track.id === prefer; })[0] || tracks[0];
    if (!chosen) return;
    select.value = chosen.id;
    if (fromGenreChange && chosen.id === previous) return;
    showLibraryTrack(chosen, fromGenreChange && !audio.paused);
  }

  function loadCatalog() {
    if (!theory) {
      showPracticeError("Practice theory didn't load.");
      return;
    }
    fetch(practiceAsset("practice/tracks.json"))
      .then(function (response) {
        if (!response.ok) throw new Error("Couldn't load the backing-track list.");
        return response.json();
      })
      .then(function (catalog) {
        state.catalog = catalog.tracks || [];
        return fetch(practiceAsset("practice/riffs.json"))
          .then(function (response) {
            return response.ok ? response.json() : null;
          })
          .catch(function () {
            return null;
          });
      })
      .then(function (riffs) {
        state.riffs = riffs && riffs.tracks ? riffs : null;
        fillGenreSelect();
        fillTrackSelect(false);
        $("practice-track").addEventListener("change", function () {
          var track = state.catalog.filter(function (item) {
            return item.id === $("practice-track").value;
          })[0];
          if (track) showLibraryTrack(track, !audio.paused);
        });
        document.dispatchEvent(new CustomEvent("practice:ready"));
      })
      .catch(function (error) {
        showPracticeError(error.message || "Couldn't load practice tracks.");
      });
  }

  function whenPlayable() {
    return new Promise(function (resolve) {
      if (audio.readyState >= 3) {
        resolve();
        return;
      }
      function done() {
        audio.removeEventListener("canplay", done);
        resolve();
      }
      audio.addEventListener("canplay", done);
      setTimeout(done, 4000);
    });
  }

  /* For Staff Lab: the backing-track player, its catalog, and the riffs. */
  window.PracticePlayer = {
    audio: audio,
    catalog: function () {
      return state.catalog;
    },
    riffs: function () {
      return state.riffs;
    },
    track: function () {
      return state.kind === "library" ? state.track : null;
    },
    playbackRate: riffPracticeRate,
    phraseLoop: function () {
      var box = $("riff-phrase-loop");
      return !!(box && box.checked);
    },
    phraseLoopRange: phraseLoopRange,
    selectTrack: function (id) {
      var track = state.catalog.filter(function (item) { return item.id === id; })[0];
      if (!track) return Promise.reject(new Error("No backing track " + id));
      if (state.kind !== "library") $("source-library").click();
      if (state.track !== track || state.kind !== "library") {
        var select = $("practice-track");
        if (!select.querySelector('option[value="' + id + '"]')) {
          $("practice-genre").value = "";
          fillTrackSelect(true);
        }
        select.value = id;
        showLibraryTrack(track, false);
      }
      return whenPlayable();
    },
  };

  initTabs();
  initSources();
  initTransport();
  initMixer();
  initLocal();
  initNeck();
  initRiffs();
  loadCatalog();
})();
