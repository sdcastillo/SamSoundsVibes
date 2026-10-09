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
  };

  function $(id) {
    return document.getElementById(id);
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

  function barLength() {
    var count = barCount();
    if (!count || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return audio.duration / count;
  }

  function currentBar() {
    var length = barLength();
    if (!length) return -1;
    return Math.max(0, Math.min(barCount() - 1, Math.floor((audio.currentTime + 0.0001) / length)));
  }

  function shownBar() {
    if (state.bar >= 0) return state.bar;
    return progression().length ? 0 : -1;
  }

  function chordAt(index) {
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
    var rigPanels = $("rig-panels");
    if (!rig || !practice || !rigPanels) return;
    function show(which) {
      var practiceOn = which === "practice";
      rig.setAttribute("aria-selected", practiceOn ? "false" : "true");
      practice.setAttribute("aria-selected", practiceOn ? "true" : "false");
      rigPanels.hidden = practiceOn;
      panel.hidden = !practiceOn;
      if (practiceOn) syncGuitarFromAmp();
    }
    rig.addEventListener("click", function () { show("rig"); });
    practice.addEventListener("click", function () { show("practice"); });
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
    audio.src = "/static/practice/" + track.file;
    audio.currentTime = 0;
    renderStudy();
    renderDetail();
    renderMeta();
    renderFretboard();
    var data = store();
    data.trackId = track.id;
    save(data);
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
    if (track.bpm) bits.push(track.bpm + " BPM");
    if (track.feel) bits.push(track.feel.charAt(0).toUpperCase() + track.feel.slice(1));
    if (track.timeSignature) bits.push(track.timeSignature);
    if (progression().length) bits.push(progression().length + " bars");
    if (bits.length) {
      var tempo = document.createElement("p");
      tempo.className = "tempo-line";
      tempo.textContent = bits.join(" · ");
      meta.appendChild(tempo);
    }
    renderBars();
    updateNow();
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
    now.textContent = chord;
    var buttons = $("practice-bars").querySelectorAll("button");
    buttons.forEach(function (button, index) {
      button.classList.toggle("is-current", index === shownBar());
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
    board.setAttribute("fill", "#241810");
    svg.appendChild(board);

    if (state.box) {
      var box = el("rect");
      var startX = state.box.start === 0 ? left - 22 : left + (state.box.start - 1) * fretSpace;
      var endX = left + state.box.end * fretSpace;
      box.setAttribute("x", String(startX));
      box.setAttribute("y", "12");
      box.setAttribute("width", String(Math.max(8, endX - startX)));
      box.setAttribute("height", String((stringCount - 1) * stringGap + 20));
      box.setAttribute("fill", "rgba(255, 179, 71, 0.14)");
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
        dot.setAttribute("fill", "rgba(242, 239, 232, 0.18)");
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
      wire.setAttribute("stroke", fret === maxFret ? "#8a8175" : "#5c5348");
      wire.setAttribute("stroke-width", fret % 12 === 0 ? "3" : "1");
      svg.appendChild(wire);
      var num = el("text");
      num.setAttribute("x", String(left + (fret - 0.5) * fretSpace));
      num.setAttribute("y", String(height - 8));
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("fill", "#9a958c");
      num.setAttribute("font-size", "11");
      num.textContent = String(fret);
      svg.appendChild(num);
    }

    var nut = el("rect");
    nut.setAttribute("x", String(left - 4));
    nut.setAttribute("y", String(top - 8));
    nut.setAttribute("width", "6");
    nut.setAttribute("height", String((stringCount - 1) * stringGap + 16));
    nut.setAttribute("fill", "#f2efe8");
    svg.appendChild(nut);

    theory.STRING_ORDER.forEach(function (stringName, index) {
      var y = top + index * stringGap;
      var line = el("line");
      line.setAttribute("x1", String(left));
      line.setAttribute("x2", String(left + maxFret * fretSpace));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("stroke", "#d9c7a6");
      line.setAttribute("stroke-width", String(1 + (stringCount - 1 - index) * 0.35));
      svg.appendChild(line);
      var name = el("text");
      name.setAttribute("x", "8");
      name.setAttribute("y", String(y + 4));
      name.setAttribute("fill", "#f2efe8");
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
      dot.dataset.root = note.root ? "1" : "0";
      dot.dataset.extra = note.extra ? "1" : "0";
      var title = el("title");
      title.textContent = note.name + (note.fret === 0 ? " open" : " fret " + note.fret);
      dot.appendChild(title);
      svg.appendChild(dot);
      state.dots.push(dot);
    });

    host.appendChild(svg);
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
      var fill = "#ffb347";
      var stroke = "none";
      var opacity = "1";
      if (outside) {
        opacity = "0.14";
      } else if (chordMode && inChord && root) {
        fill = "#ff6b2c";
        stroke = "#fff6e8";
      } else if (chordMode && inChord) {
        fill = "#fff6e8";
        stroke = "#ff6b2c";
      } else if (chordMode) {
        fill = root ? "#ff6b2c" : extra ? "#7eb6c9" : "#ffb347";
        opacity = "0.28";
      } else if (root) {
        fill = "#ff6b2c";
      } else if (extra) {
        fill = "#7eb6c9";
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

  function onTime() {
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
    audio.addEventListener("loadedmetadata", onTime);
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

  function loadCatalog() {
    if (!theory) {
      showPracticeError("Practice theory didn't load.");
      return;
    }
    fetch("/static/practice/tracks.json")
      .then(function (response) {
        if (!response.ok) throw new Error("Couldn't load the backing-track list.");
        return response.json();
      })
      .then(function (catalog) {
        state.catalog = catalog.tracks || [];
        var select = $("practice-track");
        select.textContent = "";
        state.catalog.forEach(function (track) {
          var option = document.createElement("option");
          option.value = track.id;
          option.textContent = track.title + " · " + track.key + " · " + track.bpm + " BPM";
          select.appendChild(option);
        });
        var saved = store().trackId;
        var initial = state.catalog.filter(function (track) { return track.id === saved; })[0] || state.catalog[0];
        if (initial) {
          select.value = initial.id;
          showLibraryTrack(initial, false);
        }
        select.addEventListener("change", function () {
          var track = state.catalog.filter(function (item) { return item.id === select.value; })[0];
          if (track) showLibraryTrack(track, !audio.paused);
        });
      })
      .catch(function (error) {
        showPracticeError(error.message || "Couldn't load practice tracks.");
      });
  }

  initTabs();
  initSources();
  initTransport();
  initMixer();
  initLocal();
  initNeck();
  loadCatalog();
})();
