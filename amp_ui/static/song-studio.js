/* Song Studio — multi-song guitar recorder (catalog-driven song data).
   Safe to load in the browser (window.SongStudio) or in Node for unit tests (module.exports). */
(function (root, factory) {
  var C = typeof module === "object" && module.exports ? require("./staff-core.js") : root.StaffCore;
  var api = factory(C);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SongStudio = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";

  var SongCatalog = typeof module === "object" && module.exports
    ? require("./song-catalog.js")
    : (typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : self).SongCatalog;
  var activeSongId = SongCatalog.defaultSongId;
  var SONG_DATA = SongCatalog.load(activeSongId);

  function loadSongById(songId) {
    activeSongId = songId || SongCatalog.defaultSongId;
    SONG_DATA = SongCatalog.load(activeSongId);
    return SONG_DATA;
  }

  var DRUM_KIT_ROWS = ["crash", "ride", "hihat", "snare", "kick"];

  function drumPatternKeyForBarIndex(barIdx) {
    var prog = SONG_DATA.drumProgram;
    if (prog && prog.barPatternKeys && prog.barPatternKeys[barIdx]) {
      return prog.barPatternKeys[barIdx];
    }
    var keys = SONG_DATA.drumPatterns ? Object.keys(SONG_DATA.drumPatterns) : [];
    return keys[0] || "verse";
  }

  function defaultDrumPatternKey(data) {
    data = data || SONG_DATA;
    var sec = (data.sections || []).filter(function (s) { return s.id !== "all"; })[0];
    if (sec && sec.drumPattern) return sec.drumPattern;
    var keys = data.drumPatterns ? Object.keys(data.drumPatterns) : [];
    return keys[0] || "verse";
  }

  /** Expand hard-coded drumPatterns into absolute-beat hits for the whole song. */
  function buildDrumHitTimeline(songData, patternSource) {
    var hits = [];
    var rows = (songData.drumProgram && songData.drumProgram.kitRows) || DRUM_KIT_ROWS;
    var bars = songData.bars || 16;
    var patterns = patternSource || songData.drumPatterns;
    for (var bar = 0; bar < bars; bar++) {
      var patKey = drumPatternKeyForBarIndex(bar);
      var pat = patterns[patKey];
      if (!pat || !pat.rows) continue;
      for (var s = 0; s < 16; s++) {
        var beat = bar * 4 + s * 0.25;
        rows.forEach(function (kind) {
          var row = pat.rows[kind];
          if (row && row[s]) {
            hits.push({ beat: beat, kind: kind, id: beat.toFixed(3) + ":" + kind });
          }
        });
      }
    }
    return hits;
  }

  /* Build parsed notes for each part and attach lyric syllables to notes in each bar */
  function parsePartNotes(partId) {
    var part = SONG_DATA.parts[partId];
    if (!part) throw new Error("Unknown song part: " + partId);
    var parsed = C.parseTab(part.tab, 4);
    var vocalsLyrics = SONG_DATA.parts.vocals.lyricsByBar;
    var byBar = {};
    parsed.notes.forEach(function (n) {
      if (!byBar[n.bar]) byBar[n.bar] = [];
      byBar[n.bar].push(n);
    });
    Object.keys(byBar).forEach(function (barKey) {
      var barIdx = Number(barKey);
      var words = vocalsLyrics[barIdx] || [];
      var barNotes = byBar[barKey].filter(function (n) { return !n.rest; });
      barNotes.forEach(function (n, idx) {
        if (partId === "vocals" && idx < words.length) {
          n.lyric = words[idx];
        } else if (idx < words.length && idx < 4) {
          n.cueLyric = words[idx];
        }
        /* Sounding pitch for bass when octaveDown is active */
        n.soundingMidi = part.octaveDown ? n.midi - 12 : n.midi;
        n.noteLabel = C.pitchClassName(n.note) + String(n.note.octave);
      });
    });
    return parsed;
  }

  /* Verify all parts parse cleanly with exact 4-beat bars across 16 bars */
  function validateSong() {
    var summary = {};
    Object.keys(SONG_DATA.parts).forEach(function (partId) {
      var parsed = parsePartNotes(partId);
      if (parsed.bars !== SONG_DATA.bars) {
        throw new Error(partId + " expected " + SONG_DATA.bars + " bars, got " + parsed.bars);
      }
      parsed.barSums.forEach(function (sum, idx) {
        if (Math.abs(sum - 4) > 1e-6) {
          throw new Error(partId + " bar " + (idx + 1) + " has " + sum + " beats instead of 4");
        }
      });
      summary[partId] = {
        bars: parsed.bars,
        noteCount: parsed.notes.length
      };
    });
    summary.drumHitCount = buildDrumHitTimeline(SONG_DATA, SONG_DATA.drumPatterns).length;
    return summary;
  }

  /* Browser UI controller */
  function initBrowserStudio() {
    if (typeof document === "undefined") return;
    var panel = document.getElementById("song-panel");
    if (!panel || !C) return;

    var NS = "http://www.w3.org/2000/svg";
    var state = {
      partId: "rhythm",
      sectionId: "all",
      bpm: SONG_DATA.bpm,
      octaveDown: false,
      playing: false,
      midiPlaying: false,
      recording: false,
      recPart: null,
      countInBeatsLeft: 0,
      drumPatternKey: defaultDrumPatternKey(),
      cursorBeat: null,
      currentStep: -1,
      judge: null,
      highContrast: false,
      ampRunning: false,
      scoreText: "Ready — pick a part and press Play Backing or Record My Guitar Take.",
      takes: {},
      takeBuffers: {},
      stems: {
        drums: { label: "4) Drum Machine", vol: 0.85, muted: false, solo: false, recordable: false },
        bass: { label: "3) Bass (-1 Oct)", vol: 0.82, muted: false, solo: false, recordable: true },
        rhythm: { label: "1) Rhythm Guitar", vol: 0.80, muted: false, solo: false, recordable: true },
        lead: { label: "2) Lead + Solo", vol: 0.85, muted: false, solo: false, recordable: true },
        vocals: { label: "5) Vocal Melody Guide", vol: 0.65, muted: false, solo: false, recordable: true }
      }
    };

    var parsedParts = {};
    Object.keys(SONG_DATA.parts).forEach(function (k) {
      parsedParts[k] = parsePartNotes(k);
    });

    /* Deep copy drum patterns so the user can edit steps live */
    var customDrumPatterns = JSON.parse(JSON.stringify(SONG_DATA.drumPatterns));
    var drumHitTimeline = buildDrumHitTimeline(SONG_DATA, customDrumPatterns);
    var DRUM_LOOKAHEAD_SEC = 0.45;
    var NOTE_LOOKAHEAD_SEC = 0.35;
    var NOTE_LATE_SEC = 0.06;

    function rebuildDrumHitTimeline() {
      drumHitTimeline = buildDrumHitTimeline(SONG_DATA, customDrumPatterns);
    }

    function $(id) {
      return document.getElementById(id);
    }

    function el(tag, attrs, text) {
      var node = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) {
        node.setAttribute(k, String(attrs[k]));
      });
      if (text != null) node.textContent = text;
      return node;
    }

    /* WebAudio Engine for Drum Machine, Guide Guitar/Bass/Vocal Synths, and Browser Take Recording */
    var audio = {
      ctx: null,
      master: null,
      recDest: null,
      mediaRecorder: null,
      recChunks: [],
      timer: null,
      raf: null,
      startTime: 0,
      loopStartBeat: 0,
      loopEndBeat: 64,
      countInBeats: 0,
      scheduledStep: -1,
      scheduledNotes: {},
      scheduledDrumHits: {},
      drumLoopEpoch: 0,
      activeSources: [],
      noiseBuffer: null
    };

    var midiTransport = {
      noteEvents: [],
      scheduledKeys: {},
      loopEpoch: 0,
      timer: null,
      raf: null,
      startTime: 0,
      loopStartBeat: 0,
      loopEndBeat: 64
    };

    function ensureAudio() {
      if (!audio.ctx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audio.ctx = new Ctx();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.9;
        audio.master.connect(audio.ctx.destination);
        audio.recDest = audio.ctx.createMediaStreamDestination();
        /* Create 1-second white noise buffer for snare/hi-hat/crash */
        var sr = audio.ctx.sampleRate;
        var buf = audio.ctx.createBuffer(1, sr, sr);
        var data = buf.getChannelData(0);
        for (var i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
        audio.noiseBuffer = buf;
      }
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return audio.ctx;
    }

    /* When set, synth voices render into this { ctx, dest } (OfflineAudioContext for Export Full Mix WAV). */
    var renderTarget = null;
    function voiceCtx() { return renderTarget ? renderTarget.ctx : ensureAudio(); }
    function voiceOut() { return renderTarget ? renderTarget.dest : audio.master; }

    function stemAudible(stemId) {
      var anySolo = Object.keys(state.stems).some(function (k) { return state.stems[k].solo; });
      var st = state.stems[stemId];
      if (!st) return false;
      if (anySolo) return !!st.solo;
      return !st.muted && st.vol > 0.001;
    }

    /* Synthesize punchy rock/metal drum hits */
    function playDrumHit(kind, when, gainScale) {
      var ctx = voiceCtx();
      if (!ctx || !stemAudible("drums")) return;
      var out = voiceOut();
      var vol = state.stems.drums.vol * (gainScale || 1);
      var t = Math.max(ctx.currentTime, when);

      if (kind === "kick") {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(135, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.22);
        g.gain.setValueAtTime(vol * 0.95, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        osc.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + 0.25);
        /* Click beater transient */
        var clickOsc = ctx.createOscillator();
        var clickG = ctx.createGain();
        clickOsc.type = "triangle";
        clickOsc.frequency.setValueAtTime(920, t);
        clickG.gain.setValueAtTime(vol * 0.28, t);
        clickG.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
        clickOsc.connect(clickG);
        clickG.connect(out);
        clickOsc.start(t);
        clickOsc.stop(t + 0.02);
      } else if (kind === "snare") {
        /* Body */
        var sOsc = ctx.createOscillator();
        var sG = ctx.createGain();
        sOsc.type = "triangle";
        sOsc.frequency.setValueAtTime(210, t);
        sOsc.frequency.exponentialRampToValueAtTime(115, t + 0.11);
        sG.gain.setValueAtTime(vol * 0.55, t);
        sG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        sOsc.connect(sG);
        sG.connect(out);
        sOsc.start(t);
        sOsc.stop(t + 0.15);
        /* Wires */
        if (audio.noiseBuffer) {
          var nSrc = ctx.createBufferSource();
          nSrc.buffer = audio.noiseBuffer;
          var hp = ctx.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.setValueAtTime(900, t);
          var nG = ctx.createGain();
          nG.gain.setValueAtTime(vol * 0.65, t);
          nG.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
          nSrc.connect(hp);
          hp.connect(nG);
          nG.connect(out);
          nSrc.start(t);
          nSrc.stop(t + 0.2);
        }
      } else if (kind === "ride") {
        /* Ride: inharmonic square partials (metallic ping) through a bandpass, long-ish decay */
        var rG = ctx.createGain();
        var rBp = ctx.createBiquadFilter();
        rBp.type = "bandpass";
        rBp.frequency.setValueAtTime(5200, t);
        rBp.Q.setValueAtTime(0.9, t);
        rG.gain.setValueAtTime(vol * 0.16, t);
        rG.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        [1, 1.342, 1.586, 2.137].forEach(function (ratio) {
          var ro = ctx.createOscillator();
          ro.type = "square";
          ro.frequency.setValueAtTime(410 * ratio, t);
          ro.connect(rBp);
          ro.start(t);
          ro.stop(t + 0.45);
        });
        rBp.connect(rG);
        rG.connect(out);
      } else if (kind === "hihat" || kind === "crash") {
        if (!audio.noiseBuffer) return;
        var cSrc = ctx.createBufferSource();
        cSrc.buffer = audio.noiseBuffer;
        var bp = ctx.createBiquadFilter();
        bp.type = kind === "crash" ? "bandpass" : "highpass";
        bp.frequency.setValueAtTime(kind === "crash" ? 4200 : 6500, t);
        bp.Q.setValueAtTime(kind === "crash" ? 0.7 : 1.2, t);
        var cG = ctx.createGain();
        var dur = kind === "crash" ? 0.58 : 0.065;
        cG.gain.setValueAtTime(vol * (kind === "crash" ? 0.42 : 0.25), t);
        cG.gain.exponentialRampToValueAtTime(0.001, t + dur);
        cSrc.connect(bp);
        bp.connect(cG);
        cG.connect(out);
        cSrc.start(t);
        cSrc.stop(t + dur + 0.02);
      }
    }

    /* Guide synth for Rhythm, Lead/Solo, Bass (-1 Oct), and Vocals */
    function playPartNote(partId, midi, when, durationSec, alsoToRecorder) {
      var ctx = voiceCtx();
      if (!ctx) return;
      if (!alsoToRecorder && !stemAudible(partId)) return;
      /* If the user has already recorded a real take for this part and we're not currently re-recording it, let the recorded audio stem play instead of the guide synth */
      if (!alsoToRecorder && !state.midiPlaying && state.takeBuffers[partId] && state.recPart !== partId) return;

      var t = Math.max(ctx.currentTime, when);
      var dur = Math.max(0.08, durationSec);
      var effectiveMidi = partId === "bass" ? midi - 12 : midi;
      var hz = C.midiToHz(effectiveMidi);
      var vol = (state.stems[partId] ? state.stems[partId].vol : 0.75) * 0.24;

      var osc1 = ctx.createOscillator();
      var osc2 = ctx.createOscillator();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();

      if (partId === "bass") {
        osc1.type = "sawtooth";
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(hz, t);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(480, t);
        filter.frequency.exponentialRampToValueAtTime(190, t + dur);
      } else if (partId === "rhythm") {
        osc1.type = "sawtooth";
        osc2.type = "square";
        osc2.frequency.setValueAtTime(hz * 1.5, t); /* Power chord fifth */
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2400, t);
      } else if (partId === "lead") {
        osc1.type = "sawtooth";
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(hz * 1.003, t);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(3600, t);
      } else {
        /* Vocals melody guide */
        osc1.type = "triangle";
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(hz * 2, t);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2200, t);
      }
      osc1.frequency.setValueAtTime(hz, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(voiceOut());
      if (alsoToRecorder && audio.recDest && !renderTarget) {
        gain.connect(audio.recDest);
      }
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + dur + 0.03);
      osc2.stop(t + dur + 0.03);
    }

    function currentSection() {
      return SONG_DATA.sections.filter(function (s) {
        return s.id === state.sectionId;
      })[0] || SONG_DATA.sections[0];
    }

    function sectionPatternForBar(bar) {
      if (state.sectionId !== "all") return state.drumPatternKey;
      return drumPatternKeyForBarIndex(bar);
    }

    /** Schedule hard-coded drum hits through playDrumHit (same master bus as guide synths). */
    function scheduleHardcodedDrums(songSec, countInSec, loopStartBeat, loopEndBeat) {
      if (!audio.scheduledDrumHits) audio.scheduledDrumHits = {};
      var spb = 60 / state.bpm;
      drumHitTimeline.forEach(function (hit) {
        if (hit.beat < loopStartBeat - 1e-6 || hit.beat >= loopEndBeat - 1e-6) return;
        var relSec = (hit.beat - loopStartBeat) * spb;
        if (relSec < songSec - NOTE_LATE_SEC || relSec > songSec + DRUM_LOOKAHEAD_SEC) return;
        var loopKey = String(audio.drumLoopEpoch) + ":" + hit.id;
        if (audio.scheduledDrumHits[loopKey]) return;
        audio.scheduledDrumHits[loopKey] = true;
        var when = audio.startTime + countInSec + relSec;
        var gainScale =
          hit.kind === "hihat" ? 0.85 : hit.kind === "crash" ? 0.9 : hit.kind === "ride" ? 0.8 : 1.0;
        playDrumHit(hit.kind, when, gainScale);
      });
    }

    /* Sync Octave-Down state across Song Studio, Amp panel, and backend server */
    function setOctaveDown(enabled, pushToServer) {
      state.octaveDown = !!enabled;
      var val = state.octaveDown ? 1.0 : 0.0;
      ["song-octave-btn", "octave-down-btn"].forEach(function (id) {
        var btn = $(id);
        if (!btn) return;
        btn.setAttribute("aria-pressed", state.octaveDown ? "true" : "false");
        var txt = btn.querySelector(".octave-btn-text");
        if (txt) {
          txt.textContent = state.octaveDown
            ? "Down-Octave: ON (-1 Oct Bass)"
            : "Down-Octave: OFF (Guitar Pitch)";
        }
      });
      var slider = $("octave_down");
      if (slider) slider.value = String(val);
      if (pushToServer !== false && window.AmpUI && typeof window.AmpUI.setOctaveDown === "function") {
        window.AmpUI.setOctaveDown(state.octaveDown, true);
      }
    }

    /* Installed cabinet IRs (from /api/presets). Requested IRs that are not installed are reported, never faked. */
    var installedIrs = null;
    function fetchInstalledIrs() {
      if (installedIrs) return Promise.resolve(installedIrs);
      return fetch("api/presets")
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (data) {
          installedIrs = (data && data.irs) || [];
          return installedIrs;
        })
        .catch(function () { return []; });
    }

    function loadPartTone(partId) {
      var part = SONG_DATA.parts[partId || state.partId];
      if (!part) return;
      setOctaveDown(!!part.octaveDown, true);
      var statusEl = $("song-tone-status");
      if (!part.tone) {
        if (statusEl) statusEl.textContent = "Drum Machine selected — edit the 16-step groove below.";
        return;
      }
      if (!window.AmpUI || !window.AmpUI.loadPreset) return;
      if (statusEl) statusEl.textContent = "Loading " + part.tone.name + "…";
      fetchInstalledIrs().then(function (irs) {
        var wanted = part.tone.irWanted || "";
        var haveWanted = !!wanted && irs.indexOf(wanted) >= 0;
        var request = { slot: part.tone.slot, overrides: part.tone.overrides };
        if (haveWanted) request.ir = wanted;
        return window.AmpUI.loadPreset(request).then(function (data) {
          setOctaveDown(!!part.octaveDown, true);
          if (!statusEl) return;
          var cab = data && data.preset && data.preset.ir ? data.preset.ir : "preset cab";
          var msg = "Loaded " + part.tone.name + " → " + cab +
            (part.octaveDown ? " + Down-Octave (-1 Oct Bass Mode ON)" : "") +
            (data && data.running ? " (amp live)" : " (press Start on the Amp tab to play)");
          if (wanted && !haveWanted) {
            msg += ". Note: " + wanted + " isn't in irs/ yet, so the preset's own cab IR is used. Drop that file into irs/ and reload the tone to use it.";
          }
          statusEl.textContent = msg;
        });
      }).catch(function (err) {
        if (statusEl) statusEl.textContent = "Preset note: " + err.message;
      });
    }

    var HC_KEY = "samSongStudioHighContrast";
    var pitchDetector = null;
    var mic = { on: false, timer: null, ctx: null, stream: null, analyser: null, buf: null, last: null, lastAt: 0 };
    var INPUT_LATENCY = 0.15;
    var TAB_PARTS = { rhythm: true, lead: true, bass: true, vocals: true }; /* vocals: words under their melody notes */
    var GUITAR_MIDI_PARTS = { rhythm: true, lead: true, bass: true };
    var SongMidiApi = typeof SongMidi !== "undefined" ? SongMidi : null;

    function sectionLabelForBar(rowStartBar) {
      var match = null;
      SONG_DATA.sections.forEach(function (sec) {
        if (sec.id === "all") return;
        if (rowStartBar >= sec.startBar && rowStartBar < sec.endBar) match = sec;
      });
      return match ? match.label.toUpperCase() : "SECTION";
    }

    function refreshSongHeader() {
      var titleEl = $("song-title");
      var subEl = $("song-subtitle");
      var ledeEl = $("song-lede");
      var keyBadge = $("song-key-badge");
      var barsBadge = $("song-bars-badge");
      var tabBtn = $("tab-song");
      var panel = $("song-panel");
      if (titleEl) titleEl.textContent = SONG_DATA.title + " — " + (SONG_DATA.subtitle || SONG_DATA.songType || "Song Studio");
      if (subEl) subEl.textContent = SONG_DATA.subtitle || "";
      if (ledeEl) {
        ledeEl.textContent =
          SONG_DATA.songType === "neo-classical"
            ? "Harmonic minor themes with classical arpeggios and a high-gain lead solo. Pick a part, load its tone, and record over the lighter neo-classical drum grooves."
            : "Fast cars racing down the shoreline at sunset. Select any part below to view its notation, guitar tab, and lyrics, load its amp tone, toggle the Down-Octave button so your guitar sounds like a bass, and record your takes over the metal drum machine.";
      }
      if (keyBadge) keyBadge.textContent = "Key: " + SONG_DATA.key;
      if (barsBadge) barsBadge.textContent = SONG_DATA.meter[0] + "/" + SONG_DATA.meter[1] + " · " + SONG_DATA.bars + " Bars";
      if (tabBtn) tabBtn.textContent = "Song Studio · " + SONG_DATA.title;
      if (panel) panel.setAttribute("aria-label", "Song Studio: " + SONG_DATA.title);
      var lyricsHead = $("song-lyrics-heading");
      if (lyricsHead) {
        lyricsHead.textContent =
          "5) Complete Lyrics: Notes + Words (\"" + SONG_DATA.title + "\")";
      }
      var tabLabel = $("song-tab-stage-label");
      if (tabLabel) tabLabel.textContent = "Guitar tab (" + SONG_DATA.bars + " bars · by section)";
      var bpmSlider = $("song-bpm");
      if (bpmSlider) {
        bpmSlider.min = String(Math.max(60, SONG_DATA.bpm - 60));
        bpmSlider.max = String(SONG_DATA.bpm + 60);
        bpmSlider.value = String(SONG_DATA.bpm);
      }
      var bpmOut = $("song-bpm-out");
      if (bpmOut) bpmOut.textContent = SONG_DATA.bpm + " BPM";
    }

    function renderSectionButtons() {
      var wrap = $("song-sections");
      if (!wrap) return;
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      SONG_DATA.sections.forEach(function (sec) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.section = sec.id;
        btn.setAttribute("aria-pressed", sec.id === state.sectionId ? "true" : "false");
        btn.textContent = sec.shortLabel || sec.label;
        btn.addEventListener("click", function () {
          selectSection(sec.id);
        });
        wrap.appendChild(btn);
      });
    }

    function renderDrumPresetSelect() {
      var sel = $("song-drum-preset");
      if (!sel) return;
      var prev = sel.value;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      Object.keys(SONG_DATA.drumPatterns).forEach(function (key) {
        var opt = document.createElement("option");
        opt.value = key;
        opt.textContent = SONG_DATA.drumPatterns[key].name || key;
        sel.appendChild(opt);
      });
      if (SONG_DATA.drumPatterns[prev]) sel.value = prev;
      else sel.value = defaultDrumPatternKey();
      state.drumPatternKey = sel.value;
    }

    function reparsedSongParts() {
      parsedParts = {};
      Object.keys(SONG_DATA.parts).forEach(function (k) {
        parsedParts[k] = parsePartNotes(k);
      });
      customDrumPatterns = JSON.parse(JSON.stringify(SONG_DATA.drumPatterns));
      rebuildDrumHitTimeline();
    }

    function switchActiveSong(songId) {
      if (songId === activeSongId) return;
      stopTransport();
      loadSongById(songId);
      state.bpm = SONG_DATA.bpm;
      state.sectionId = "all";
      state.drumPatternKey = defaultDrumPatternKey();
      state.takes = {};
      state.takeBuffers = {};
      reparsedSongParts();
      refreshSongHeader();
      renderSectionButtons();
      renderDrumPresetSelect();
      var picker = $("song-picker");
      if (picker) picker.value = activeSongId;
      selectPart("rhythm");
      selectSection("all");
      renderDrumGrid();
      renderLyricSheet();
      renderMixerRows();
      refreshTakes();
      renderSongScore();
    }

    function scoreLayout(svg) {
      var parsed = parsedParts[state.partId];
      var sec = currentSection();
      var startBar = sec.startBar;
      var endBar = sec.endBar;
      var perRow = 4;
      var totalBars = endBar - startBar;
      var rows = Math.max(1, Math.ceil(totalBars / perRow));
      var width = Math.max(780, Math.round((svg && svg.parentNode && svg.parentNode.clientWidth) || 920) - 16);
      var x0 = 46;
      var barW = (width - x0 - 14) / perRow;
      return { parsed: parsed, sec: sec, startBar: startBar, endBar: endBar, perRow: perRow, rows: rows, width: width, x0: x0, barW: barW };
    }

    function noteClass(noteIdx, n) {
      var st = state.judge ? state.judge.status(noteIdx) : "";
      var isCurrent =
        state.cursorBeat != null &&
        state.cursorBeat >= n.beat - 0.05 &&
        state.cursorBeat < n.beat + n.beats;
      return st === "hit" ? "is-hit" : st === "miss" ? "is-missed" : isCurrent ? "is-target" : "";
    }

    function appendPlayhead(svg, lay, rY, yTop, yBottom) {
      if (state.cursorBeat == null) return;
      var cBar = Math.floor(state.cursorBeat / 4);
      var rowStartBar = lay._rowStartBar;
      var rowBars = lay._rowBars;
      if (cBar < rowStartBar || cBar >= rowStartBar + rowBars) return;
      var cBeatInBar = state.cursorBeat - cBar * 4;
      var cx = lay.x0 + (cBar - rowStartBar) * lay.barW + 18 + (cBeatInBar / 4) * (lay.barW - 30);
      svg.appendChild(el("line", {
        class: "lab-playhead",
        x1: cx,
        x2: cx,
        y1: yTop,
        y2: yBottom
      }));
    }

    function renderStaffSvg() {
      var svg = $("song-staff-svg");
      if (!svg) return;
      var lay = scoreLayout(svg);
      var half = 5.5;
      var staffTop = 28;
      var rowH = 118;
      svg.setAttribute("viewBox", "0 0 " + lay.width + " " + (lay.rows * rowH + 10));
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      for (var r = 0; r < lay.rows; r++) {
        var rY = r * rowH;
        var rowStartBar = lay.startBar + r * lay.perRow;
        var rowBars = Math.min(lay.perRow, lay.endBar - rowStartBar);
        var x1 = lay.x0 + rowBars * lay.barW;
        lay._rowStartBar = rowStartBar;
        lay._rowBars = rowBars;

        svg.appendChild(el("text", { class: "song-section-tag", x: lay.x0, y: rY + 13 }, sectionLabelForBar(rowStartBar)));

        var staffLinesG = el("g", { class: "lab-staff-lines" });
        for (var l = 0; l < 5; l++) {
          var ly = rY + staffTop + l * (half * 2);
          staffLinesG.appendChild(el("line", { x1: 10, x2: x1, y1: ly, y2: ly }));
        }
        svg.appendChild(staffLinesG);
        svg.appendChild(el("text", { class: "lab-clef", x: 14, y: rY + staffTop + 36 }, "\uD834\uDD1E"));

        for (var b = 0; b <= rowBars; b++) {
          var bx = lay.x0 + b * lay.barW;
          var barIndex = rowStartBar + b;
          var isEnd = barIndex === lay.endBar;
          svg.appendChild(el("line", {
            class: "lab-bar" + (isEnd ? " is-final" : ""),
            x1: bx,
            x2: bx,
            y1: rY + staffTop,
            y2: rY + staffTop + 4 * half * 2
          }));
          if (b < rowBars) {
            var chordName = SONG_DATA.chords[barIndex] || "";
            svg.appendChild(el("text", {
              class: "lab-chord",
              x: bx + 10,
              y: rY + 28
            }, "Bar " + (barIndex + 1) + " · " + chordName));
          }
        }

        lay.parsed.notes.forEach(function (n, noteIdx) {
          if (n.bar < rowStartBar || n.bar >= rowStartBar + rowBars || n.rest) return;
          var localBar = n.bar - rowStartBar;
          var nx = lay.x0 + localBar * lay.barW + 18 + (n.pos / 4) * (lay.barW - 30);
          var written = C.writtenNote(n.note, "guitar");
          var step = C.staffStep(written);
          var clampedStep = Math.max(-4, Math.min(16, step));
          var ny = rY + staffTop + (10 - clampedStep) * half;
          var cls = noteClass(noteIdx, n);
          var noteG = el("g", { class: "lab-note " + cls });
          var hollow = n.dur === "w" || n.dur === "h" || n.dur === "h.";
          noteG.appendChild(el("ellipse", {
            class: "lab-head" + (hollow ? " is-hollow" : ""),
            cx: nx,
            cy: ny,
            rx: 5.5,
            ry: 4.0,
            transform: "rotate(-18 " + nx + " " + ny + ")"
          }));
          if (n.dur !== "w") {
            noteG.appendChild(el("line", { class: "lab-stem", x1: nx + 5, x2: nx + 5, y1: ny, y2: ny - 22 }));
          }
          svg.appendChild(noteG);
        });

        appendPlayhead(svg, lay, rY, rY + staffTop - 6, rY + staffTop + 4 * half * 2 + 6);
      }
    }

    function renderTabSvg() {
      var wrap = $("song-tab-wrap");
      var svg = $("song-tab-svg");
      if (!svg) return;
      var showTab = TAB_PARTS[state.partId];
      if (wrap) wrap.hidden = !showTab;
      if (!showTab) return;

      var lay = scoreLayout(svg);
      var tabGap = 11;
      var tabTop = 36;
      var rowH = 146; /* room for a second lyric lane */
      svg.setAttribute("viewBox", "0 0 " + lay.width + " " + (lay.rows * rowH + 10));
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      for (var r = 0; r < lay.rows; r++) {
        var rY = r * rowH;
        var rowStartBar = lay.startBar + r * lay.perRow;
        var rowBars = Math.min(lay.perRow, lay.endBar - rowStartBar);
        var x1 = lay.x0 + rowBars * lay.barW;
        lay._rowStartBar = rowStartBar;
        lay._rowBars = rowBars;
        var lastLyric = null;

        svg.appendChild(el("text", { class: "song-section-tag", x: lay.x0, y: rY + 13 }, sectionLabelForBar(rowStartBar)));

        var tabTopY = rY + tabTop;
        var tabLinesG = el("g", { class: "lab-tab-lines" });
        for (var s = 1; s <= 6; s++) {
          var ty = tabTopY + (s - 1) * tabGap;
          tabLinesG.appendChild(el("line", { x1: 10, x2: x1, y1: ty, y2: ty }));
        }
        svg.appendChild(tabLinesG);
        ["T", "A", "B"].forEach(function (ch, idx) {
          svg.appendChild(el("text", { class: "lab-tab-clef", x: 18, y: tabTopY + 14 + idx * 16 }, ch));
        });

        for (var b = 0; b <= rowBars; b++) {
          var bx = lay.x0 + b * lay.barW;
          var barIndex = rowStartBar + b;
          var isEnd = barIndex === lay.endBar;
          svg.appendChild(el("line", {
            class: "lab-bar" + (isEnd ? " is-final" : ""),
            x1: bx,
            x2: bx,
            y1: tabTopY,
            y2: tabTopY + 5 * tabGap
          }));
        }

        lay.parsed.notes.forEach(function (n, noteIdx) {
          if (n.bar < rowStartBar || n.bar >= rowStartBar + rowBars || n.rest) return;
          var localBar = n.bar - rowStartBar;
          var nx = lay.x0 + localBar * lay.barW + 18 + (n.pos / 4) * (lay.barW - 30);
          var cls = noteClass(noteIdx, n);
          var ty = tabTopY + (n.string - 1) * tabGap;
          var fretLabel = String(n.fret);
          var tabG = el("g", { class: "lab-tabnum " + cls });
          tabG.appendChild(el("rect", {
            x: nx - 4 - fretLabel.length * 3.4,
            y: ty - 6.5,
            width: 8 + fretLabel.length * 6.8,
            height: 13,
            rx: 3
          }));
          tabG.appendChild(el("text", { x: nx, y: ty + 4 }, fretLabel));
          svg.appendChild(tabG);

          var lyricText = n.lyric || n.cueLyric || "";
          var noteNameY = tabTopY + 5 * tabGap + 15;
          svg.appendChild(el("text", {
            class: "song-lyric-note",
            x: nx,
            y: noteNameY
          }, C.pitchClassName(n.note) + (state.partId === "bass" ? (n.note.octave - 1) : n.note.octave)));
          if (lyricText) {
            /* Stagger onto a second line when the previous word would collide (fast eighth-note syllables) */
            var halfW = lyricText.length * 3.3;
            var lane = lastLyric && lastLyric.row === r && nx - halfW < lastLyric.right + 3 && lastLyric.lane === 0 ? 1 : 0;
            svg.appendChild(el("text", {
              class: "song-lyric-word",
              x: nx,
              y: noteNameY + 14 + lane * 12
            }, lyricText));
            lastLyric = { row: r, right: nx + halfW, lane: lane };
          }
        });

        appendPlayhead(svg, lay, rY, tabTopY - 6, tabTopY + 5 * tabGap + 28);
      }
    }

    function renderSongScore() {
      renderStaffSvg();
      renderTabSvg();
    }

    function songJudgeTimeSec() {
      var ctx = audio.ctx;
      if (!ctx || !state.playing) return null;
      var spb = 60 / state.bpm;
      var countInSec = audio.countInBeats * spb;
      var elapsed = ctx.currentTime - audio.startTime - countInSec;
      if (elapsed < 0) return null;
      var loopBeats = audio.loopEndBeat - audio.loopStartBeat;
      var loopDur = loopBeats * spb;
      while (elapsed >= loopDur) elapsed -= loopDur;
      return (audio.loopStartBeat * spb + elapsed) - INPUT_LATENCY;
    }

    function updateLiveScoreReadout() {
      var live = $("song-live-score");
      if (!live) return;
      if (!state.playing || !state.judge || TAB_PARTS[state.partId] === false) {
        live.textContent = "";
        return;
      }
      var st = state.judge.stats();
      var pct = st.total ? Math.round(100 * st.accuracy) : 0;
      live.textContent =
        "Live score: " + st.hits + "/" + st.total + " (" + pct + "%)" +
        (st.strays ? " · " + st.strays + " extra notes" : "");
    }

    function handlePitchFrame(frame) {
      if (!state.playing || state.recording || !state.judge) return;
      if (!TAB_PARTS[state.partId]) return;
      if (!pitchDetector) pitchDetector = C.createOnsetDetector({ stableMs: 90 });
      var ev = pitchDetector.push(frame, typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000);
      if (!ev || !ev.midi) return;
      var t = songJudgeTimeSec();
      if (t == null || t < 0) return;
      var res = state.judge.onset(ev.midi, t);
      if (res && res.type === "hit") updateLiveScoreReadout();
    }

    function stopSongMic() {
      if (mic.timer) clearInterval(mic.timer);
      mic.timer = null;
      if (mic.stream) mic.stream.getTracks().forEach(function (tr) { tr.stop(); });
      if (mic.ctx) mic.ctx.close();
      mic.on = false;
      mic.ctx = mic.stream = mic.analyser = null;
    }

    function songMicTick() {
      if (!mic.analyser || !mic.buf) return;
      mic.analyser.getFloatTimeDomainData(mic.buf);
      var t = typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
      var found = C.detectPitch(mic.buf, mic.ctx.sampleRate);
      var frame;
      if (found) {
        mic.last = found;
        mic.lastAt = t;
        frame = found;
      } else if (mic.last && t - mic.lastAt < 0.3) {
        frame = Object.assign({}, mic.last, { level: C.rms(mic.buf) });
      } else {
        mic.last = null;
        frame = { active: false };
      }
      handlePitchFrame(frame);
    }

    function startSongMic() {
      if (mic.on || state.ampRunning) return;
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
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
          pitchDetector = C.createOnsetDetector({ stableMs: 90 });
          mic.timer = setInterval(songMicTick, 50);
        })
        .catch(function () {});
    }

    function applyHighContrast(on) {
      state.highContrast = !!on;
      panel.classList.toggle("is-high-contrast", state.highContrast);
      try {
        localStorage.setItem(HC_KEY, state.highContrast ? "1" : "0");
      } catch (e) {}
      renderSongScore();
    }

    function initHighContrastToggle() {
      try {
        state.highContrast = localStorage.getItem(HC_KEY) === "1";
      } catch (e) {
        state.highContrast = false;
      }
      panel.classList.toggle("is-high-contrast", state.highContrast);
      var box = $("song-high-contrast");
      if (box) {
        box.checked = state.highContrast;
        box.addEventListener("change", function () {
          applyHighContrast(box.checked);
        });
      }
    }

    function feedAmpStatus(status) {
      state.ampRunning = !!(status && status.running);
      if (!state.playing || state.recording) return;
      if (state.ampRunning) stopSongMic();
      else if (state.playing) startSongMic();
      if (!state.ampRunning) return;
      var tuner = (status && status.tuner) || {};
      handlePitchFrame({
        active: !!tuner.active,
        midi: tuner.midi,
        cents: tuner.cents,
        hz: tuner.hz,
        level: status && status.meters ? Number(status.meters.in) || 0 : 0
      });
    }

    /* Render 16-step Drum Machine grid */
    function renderDrumGrid() {
      var container = $("song-drum-grid");
      if (!container) return;
      var pat = customDrumPatterns[state.drumPatternKey] || customDrumPatterns[defaultDrumPatternKey()];
      var titleEl = $("song-drum-pattern-name");
      if (titleEl) titleEl.textContent = pat.name;
      container.innerHTML = "";

      var rowOrder = [
        { key: "crash", label: "Crash" },
        { key: "ride",  label: "Ride" },
        { key: "hihat", label: "Hi-Hat" },
        { key: "snare", label: "Snare" },
        { key: "kick",  label: "Double Kick" }
      ];

      rowOrder.forEach(function (rInfo) {
        var lbl = document.createElement("span");
        lbl.className = "drum-row-label";
        lbl.textContent = rInfo.label;
        container.appendChild(lbl);

        var steps = pat.rows[rInfo.key] || [];
        for (var s = 0; s < 16; s++) {
          (function (rowKey, stepIndex) {
            var btn = document.createElement("button");
            btn.type = "button";
            var on = !!steps[stepIndex];
            btn.className =
              "drum-cell" +
              (stepIndex % 4 === 0 ? " is-beat" : "") +
              (on ? " is-on" : "") +
              (on && (rowKey === "snare" || rowKey === "crash") ? " is-accent" : "") +
              (state.currentStep === stepIndex ? " is-step" : "");
            btn.title = rInfo.label + " step " + (stepIndex + 1);
            btn.setAttribute("aria-label", rInfo.label + " step " + (stepIndex + 1));
            btn.addEventListener("click", function () {
              pat.rows[rowKey][stepIndex] = pat.rows[rowKey][stepIndex] ? 0 : 1;
              if (pat.rows[rowKey][stepIndex]) {
                playDrumHit(rowKey, 0, 0.9);
              }
              rebuildDrumHitTimeline();
              renderDrumGrid();
            });
            container.appendChild(btn);
          })(rInfo.key, s);
        }
      });
    }

    /* Render Lyrics + Notes Cards */
    function renderLyricSheet() {
      var wrap = $("song-lyrics-sheet");
      if (!wrap) return;
      wrap.innerHTML = "";
      var activeBar = state.cursorBeat != null ? Math.floor(state.cursorBeat / 4) : -1;

      SONG_DATA.parts.vocals.lyricSheet.forEach(function (block, idx) {
        var card = document.createElement("div");
        var inSection = activeBar >= idx * 4 && activeBar < (idx + 1) * 4;
        card.className = "lyric-section-card" + (inSection ? " is-active" : "");

        var head = document.createElement("div");
        head.className = "lyric-section-head";
        var title = document.createElement("span");
        title.className = "lyric-section-title";
        title.textContent = block.section;
        var chords = document.createElement("span");
        chords.className = "lyric-section-chords";
        chords.textContent = block.chords;
        head.appendChild(title);
        head.appendChild(chords);
        card.appendChild(head);

        block.lines.forEach(function (line) {
          var row = document.createElement("div");
          row.className = "lyric-line-row";
          var w = document.createElement("p");
          w.className = "lyric-words";
          w.textContent = "\u201C" + line.words + "\u201D";
          var n = document.createElement("p");
          n.className = "lyric-notes";
          n.textContent = "Notes: " + line.notes;
          row.appendChild(w);
          row.appendChild(n);
          card.appendChild(row);
        });

        wrap.appendChild(card);
      });
    }

    /* Render Multi-Track Stem Mixer & Recording Controls */
    function renderMixerRows() {
      var wrap = $("song-mixer-rows");
      if (!wrap) return;
      wrap.innerHTML = "";

      ["rhythm", "lead", "bass", "drums", "vocals"].forEach(function (stemId) {
        var st = state.stems[stemId];
        var take = state.takes[stemId];
        var row = document.createElement("div");
        row.className = "song-track-row" + (state.partId === stemId ? " is-focused" : "");

        var nameCol = document.createElement("div");
        nameCol.className = "song-track-name";
        var titleSpan = document.createElement("span");
        titleSpan.textContent = st.label;
        var stateSpan = document.createElement("span");
        stateSpan.className = "song-track-state" + (take ? " has-take" : "");
        if (state.recording && state.recPart === stemId) {
          stateSpan.textContent = "● Recording take now…";
        } else if (take) {
          stateSpan.textContent = "● Recorded Take (" + (take.duration ? take.duration + "s" : "ready") + ")";
        } else {
          stateSpan.textContent = stemId === "drums" ? "16-Step Metal Drum Synth" : "Built-in Guide Synth (no take yet)";
        }
        nameCol.appendChild(titleSpan);
        nameCol.appendChild(stateSpan);
        row.appendChild(nameCol);

        var btns = document.createElement("div");
        btns.className = "song-track-btns";

        if (st.recordable) {
          var recBtn = document.createElement("button");
          recBtn.type = "button";
          recBtn.className = state.recording && state.recPart === stemId ? "song-rec-btn is-recording" : "secondary";
          recBtn.textContent = state.recording && state.recPart === stemId ? "Stop Rec" : (take ? "Re-Record" : "● Record");
          recBtn.addEventListener("click", function () {
            if (state.recording && state.recPart === stemId) {
              stopTransport();
            } else {
              selectPart(stemId);
              startTransport(true, stemId);
            }
          });
          btns.appendChild(recBtn);
        }

        var muteBtn = document.createElement("button");
        muteBtn.type = "button";
        muteBtn.className = "secondary" + (st.muted ? " is-muted" : "");
        muteBtn.textContent = st.muted ? "Muted" : "Mute";
        muteBtn.addEventListener("click", function () {
          st.muted = !st.muted;
          refreshTakeGains();
          renderMixerRows();
        });
        btns.appendChild(muteBtn);

        var soloBtn = document.createElement("button");
        soloBtn.type = "button";
        soloBtn.className = "secondary" + (st.solo ? " is-muted" : "");
        soloBtn.textContent = st.solo ? "Solo ON" : "Solo";
        soloBtn.addEventListener("click", function () {
          st.solo = !st.solo;
          refreshTakeGains();
          renderMixerRows();
        });
        btns.appendChild(soloBtn);

        /* WAV Download: the raw take when there is one, otherwise this stem rendered on its own */
        var dl = document.createElement("button");
        dl.type = "button";
        dl.className = "secondary";
        dl.textContent = "WAV";
        dl.title = take ? "Download your recorded take" : "Render this stem (" + (stemId === "drums" ? "drum machine" : "guide synth") + ") to WAV";
        dl.addEventListener("click", function () {
          if (take && take.url) {
            var a = document.createElement("a");
            a.href = take.url;
            a.download = SONG_DATA.id + "-" + stemId + "-take.wav";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else {
            exportFullMixWav(stemId);
          }
        });
        btns.appendChild(dl);

        if (take) {

          var clearBtn = document.createElement("button");
          clearBtn.type = "button";
          clearBtn.className = "secondary";
          clearBtn.textContent = "Clear";
          clearBtn.addEventListener("click", function () {
            deleteTake(stemId);
          });
          btns.appendChild(clearBtn);
        }

        row.appendChild(btns);

        var volWrap = document.createElement("label");
        volWrap.className = "song-track-vol";
        volWrap.textContent = "Vol ";
        var slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "1";
        slider.step = "0.02";
        slider.value = String(st.vol);
        slider.addEventListener("input", function () {
          st.vol = parseFloat(slider.value);
          refreshTakeGains();
        });
        volWrap.appendChild(slider);
        row.appendChild(volWrap);

        var focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.className = "secondary";
        focusBtn.style.marginTop = "0";
        focusBtn.style.padding = "5px 9px";
        focusBtn.style.fontSize = "0.75rem";
        focusBtn.textContent = "View Tab";
        focusBtn.addEventListener("click", function () {
          selectPart(stemId);
        });
        row.appendChild(focusBtn);

        wrap.appendChild(row);
      });
    }

    function updateBanner() {
      var part = SONG_DATA.parts[state.partId];
      var tipEl = $("song-part-tip");
      var metaEl = $("song-part-meta");
      if (tipEl && part) tipEl.textContent = part.tip;
      if (metaEl && part) {
        metaEl.textContent =
          part.tone
            ? ("Tone: " + part.tone.name + (part.octaveDown ? " · Down-Octave (-1 Oct)" : ""))
            : "Synthesized Metal Drum Kit";
      }
      var recMain = $("song-record-btn");
      if (recMain) {
        if (state.recording) {
          recMain.textContent = "■ Stop Recording Take";
          recMain.classList.add("is-recording");
        } else {
          var pName = part ? part.title.replace(/^\d\)\s*/, "") : "Part";
          recMain.textContent = "● Record My " + pName + " Take";
          recMain.classList.remove("is-recording");
        }
      }
      var playBtn = $("song-play-btn");
      if (playBtn) {
        playBtn.textContent = state.playing && !state.recording ? "■ Stop Backing" : "▶ Play Backing & Guide";
      }
      var midiBtn = $("song-guitar-midi-btn");
      if (midiBtn) {
        var showMidi = !!GUITAR_MIDI_PARTS[state.partId];
        midiBtn.hidden = !showMidi;
        midiBtn.textContent = state.midiPlaying
          ? "■ Stop Guitar MIDI"
          : "▶ Play Guitar MIDI (follow tab)";
      }
    }

    function selectPart(partId) {
      if (!SONG_DATA.parts[partId]) return;
      state.partId = partId;
      document.querySelectorAll("#song-part-tabs [data-part]").forEach(function (btn) {
        btn.setAttribute("aria-selected", btn.dataset.part === partId ? "true" : "false");
      });
      /* Automatically toggle Down-Octave when switching to/from Bass part */
      setOctaveDown(!!SONG_DATA.parts[partId].octaveDown, true);
      updateBanner();
      renderSongScore();
      renderMixerRows();
    }

    function selectSection(sectionId) {
      state.sectionId = sectionId;
      var sec = currentSection();
      state.drumPatternKey = sec.drumPattern || defaultDrumPatternKey();
      document.querySelectorAll("#song-sections [data-section]").forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.dataset.section === sectionId ? "true" : "false");
      });
      renderDrumGrid();
      renderSongScore();
    }

    /* Encode Float32Array stereo/mono to 16-bit PCM WAV Blob for instant take saving */
    function encodeWavFromFloat32(samplesL, samplesR, sampleRate) {
      var numChannels = samplesR ? 2 : 1;
      var length = samplesL.length;
      var buffer = new ArrayBuffer(44 + length * numChannels * 2);
      var view = new DataView(buffer);
      function writeStr(offset, str) {
        for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      }
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + length * numChannels * 2, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, length * numChannels * 2, true);
      var offset = 44;
      for (var i = 0; i < length; i++) {
        var sL = Math.max(-1, Math.min(1, samplesL[i]));
        view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
        offset += 2;
        if (numChannels === 2) {
          var sR = Math.max(-1, Math.min(1, samplesR[i]));
          view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
          offset += 2;
        }
      }
      return new Blob([buffer], { type: "audio/wav" });
    }

    /* Recorded takes: decode to AudioBuffers so they play back in sync with the drums and other stems */
    var takeSources = [];
    function stemGainValue(stemId) {
      var st = state.stems[stemId];
      return st && stemAudible(stemId) ? st.vol : 0;
    }
    function loadTakeBuffer(partId) {
      var take = state.takes[partId];
      var ctx = ensureAudio();
      if (!take || !take.url || !ctx) return Promise.resolve(null);
      return fetch(take.url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (bytes) {
          return new Promise(function (resolve, reject) {
            ctx.decodeAudioData(bytes, resolve, reject);
          });
        })
        .then(function (buf) {
          state.takeBuffers[partId] = buf;
          return buf;
        })
        .catch(function () { return null; });
    }
    /* Where song beat `beat` sits inside a take: takes start at the count-in, `meta` says which bars were recorded. */
    function takeOffsetForBeat(take, beat) {
      var meta = (take && take.meta) || {};
      var recBpm = Number(meta.bpm) || SONG_DATA.bpm;
      var recSpb = 60 / recBpm;
      var startBeat = (Number(meta.start_bar) || 0) * 4;
      var countIn = meta.count_in_beats != null ? Number(meta.count_in_beats) : 4;
      return countIn * recSpb + (beat - startBeat) * recSpb + (Number(meta.latency_ms) || 0) / 1000;
    }
    function scheduleTakes(ctx, dest, songStartWhen, startBeat, endBeat, skipPart) {
      var spb = 60 / state.bpm;
      var started = [];
      ["rhythm", "lead", "bass", "vocals"].forEach(function (partId) {
        if (partId === skipPart) return;
        var buf = state.takeBuffers[partId];
        var take = state.takes[partId];
        if (!buf || !take) return;
        var g = stemGainValue(partId);
        if (g <= 0) return;
        var meta = take.meta || {};
        var takeStartBeat = (Number(meta.start_bar) || 0) * 4;
        var takeEndBeat = (Number(meta.end_bar) || SONG_DATA.bars) * 4;
        var from = Math.max(startBeat, takeStartBeat);
        var to = Math.min(endBeat, takeEndBeat);
        if (to <= from) return;
        var offset = takeOffsetForBeat(take, from);
        if (offset < 0 || offset >= buf.duration) return;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var gain = ctx.createGain();
        gain.gain.value = g;
        src.connect(gain);
        gain.connect(dest);
        var when = songStartWhen + (from - startBeat) * spb;
        src.start(when, offset, Math.min(buf.duration - offset, (to - from) * spb));
        started.push({ src: src, gain: gain, part: partId });
      });
      return started;
    }
    function stopTakeSources() {
      takeSources.forEach(function (t) {
        try { t.src.stop(); } catch (e) { /* already stopped */ }
      });
      takeSources = [];
    }
    function refreshTakeGains() {
      takeSources.forEach(function (t) { t.gain.gain.value = stemGainValue(t.part); });
    }

    /* Fetch recorded takes from server */
    function refreshTakes() {
      fetch("api/takes")
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (data) {
          if (data && data.takes) {
            Object.keys(data.takes).forEach(function (k) {
              state.takes[k] = data.takes[k];
              loadTakeBuffer(k);
            });
            renderMixerRows();
          }
        })
        .catch(function () {});
    }

    function deleteTake(partId) {
      delete state.takes[partId];
      delete state.takeBuffers[partId];
      renderMixerRows();
      fetch("api/takes/" + encodeURIComponent(partId), { method: "DELETE" }).catch(function () {});
      refreshTakeGains();
    }

    /* Schedule lookahead for Drums + All 4 Melodic Parts */
    function scheduleAudioWindow() {
      if (!state.playing || !audio.ctx) return;
      var ctx = audio.ctx;
      var spb = 60 / state.bpm;
      var stepDur = spb / 4; /* 16th note */
      var elapsed = ctx.currentTime - audio.startTime;
      var countInSec = audio.countInBeats * spb;

      if (elapsed < 0) return; /* transport starts a few ms in the future */
      /* Count-in clicks before bar 1 */
      if (elapsed < countInSec) {
        var cBeat = Math.floor(elapsed / spb);
        var rem = audio.countInBeats - cBeat;
        if (rem !== state.countInBeatsLeft) {
          state.countInBeatsLeft = rem;
          var statusEl = $("song-score-readout");
          if (statusEl) {
            statusEl.textContent = "Count-in: " + rem + "… Get ready on " + SONG_DATA.parts[state.partId].title + "!";
          }
        }
        return;
      }

      if (state.countInBeatsLeft > 0) {
        state.countInBeatsLeft = 0;
        var goEl = $("song-score-readout");
        if (goEl) {
          goEl.textContent = state.recording
            ? "● Recording your " + SONG_DATA.parts[state.recPart].title.replace(/^\d\)\s*/, "") + " take — play!"
            : "Playing " + currentSection().shortLabel + ".";
        }
      }
      var songSec = elapsed - countInSec;
      var loopBeats = audio.loopEndBeat - audio.loopStartBeat;
      var loopDur = loopBeats * spb;
      if (songSec >= loopDur) {
        if (state.recording) {
          /* Auto-finish take at the end of the selected section/song */
          stopTransport();
          return;
        }
        /* Loop playback */
        audio.startTime += loopDur;
        audio.scheduledStep = -1;
        audio.scheduledNotes = {};
        audio.scheduledDrumHits = {};
        audio.drumLoopEpoch += 1;
        songSec -= loopDur;
        takeSources = scheduleTakes(ctx, audio.master, audio.startTime + countInSec, audio.loopStartBeat, audio.loopEndBeat, null);
      }

      var currentBeat = audio.loopStartBeat + songSec / spb;
      state.cursorBeat = currentBeat;
      var totalSteps = Math.floor(( currentBeat - audio.loopStartBeat ) * 4);
      state.currentStep = ((totalSteps % 16) + 16) % 16;

      scheduleHardcodedDrums(songSec, countInSec, audio.loopStartBeat, audio.loopEndBeat);

      /* Schedule Guide Synth notes for Rhythm, Lead, Bass, and Vocals */
      ["rhythm", "lead", "bass", "vocals"].forEach(function (partId) {
        var notes = parsedParts[partId].notes;
        notes.forEach(function (n, idx) {
          if (n.rest) return;
          if (n.beat < audio.loopStartBeat - 1e-6 || n.beat >= audio.loopEndBeat - 1e-6) return;
          var key = partId + ":" + idx;
          if (audio.scheduledNotes[key]) return;
          var noteRelSec = (n.beat - audio.loopStartBeat) * spb;
          if (noteRelSec <= songSec + NOTE_LOOKAHEAD_SEC && noteRelSec >= songSec - NOTE_LATE_SEC) {
            audio.scheduledNotes[key] = true;
            var when = audio.startTime + countInSec + noteRelSec;
            var durSec = n.beats * spb * 0.92;
            playPartNote(partId, n.midi, when, durSec, state.recording && state.recPart === partId);
          }
        });
      });

      if (state.judge) {
        var missed = state.judge.sweep(currentBeat * spb);
        if (missed && missed.length) updateLiveScoreReadout();
      }
    }

    function stopGuitarMidiPlayback() {
      if (midiTransport.timer) clearInterval(midiTransport.timer);
      if (midiTransport.raf) cancelAnimationFrame(midiTransport.raf);
      midiTransport.timer = null;
      midiTransport.raf = null;
      midiTransport.scheduledKeys = {};
      midiTransport.noteEvents = [];
      state.midiPlaying = false;
      if (!state.playing) state.cursorBeat = null;
      var midiBtn = $("song-guitar-midi-btn");
      if (midiBtn) midiBtn.textContent = "▶ Play Guitar MIDI (follow tab)";
      var readout = $("song-score-readout");
      if (readout && !state.playing && !state.recording) {
        readout.textContent = state.scoreText;
      }
      renderSongScore();
      updateBanner();
    }

    function scheduleMidiGuitarWindow() {
      if (!state.midiPlaying || !audio.ctx || !midiTransport.noteEvents.length) return;
      var ctx = audio.ctx;
      var spb = 60 / state.bpm;
      var elapsed = ctx.currentTime - midiTransport.startTime;
      if (elapsed < 0) return;
      var loopBeats = midiTransport.loopEndBeat - midiTransport.loopStartBeat;
      var loopDur = loopBeats * spb;
      var songSec = elapsed;
      if (songSec >= loopDur) {
        midiTransport.startTime += loopDur;
        midiTransport.scheduledKeys = {};
        midiTransport.loopEpoch += 1;
        songSec -= loopDur;
      }
      state.cursorBeat = midiTransport.loopStartBeat + songSec / spb;

      midiTransport.noteEvents.forEach(function (ev, idx) {
        if (ev.beat < midiTransport.loopStartBeat - 1e-6 || ev.beat >= midiTransport.loopEndBeat - 1e-6) return;
        var relSec = (ev.beat - midiTransport.loopStartBeat) * spb;
        if (relSec < songSec - NOTE_LATE_SEC || relSec > songSec + NOTE_LOOKAHEAD_SEC) return;
        var key = midiTransport.loopEpoch + ":" + idx;
        if (midiTransport.scheduledKeys[key]) return;
        midiTransport.scheduledKeys[key] = true;
        var when = midiTransport.startTime + relSec;
        playPartNote(state.partId, ev.midi, when, (ev.durBeats || 0.25) * spb * 0.92, false);
      });

      renderSongScore();
    }

    function startGuitarMidiPlayback() {
      if (!GUITAR_MIDI_PARTS[state.partId]) return;
      if (state.midiPlaying) {
        stopGuitarMidiPlayback();
        return;
      }
      stopTransport();
      var ctx = ensureAudio();
      if (!ctx || !SongMidiApi) return;

      var sec = currentSection();
      midiTransport.loopStartBeat = sec.startBar * 4;
      midiTransport.loopEndBeat = sec.endBar * 4;
      midiTransport.scheduledKeys = {};
      midiTransport.loopEpoch = 0;
      midiTransport.startTime = ctx.currentTime + 0.05;

      function beginWithEvents(events) {
        midiTransport.noteEvents = events.filter(function (ev) {
          return ev.beat >= midiTransport.loopStartBeat - 1e-6 && ev.beat < midiTransport.loopEndBeat - 1e-6;
        });
        if (!midiTransport.noteEvents.length) {
          var readout = $("song-score-readout");
          if (readout) readout.textContent = "No guitar notes in this section to play.";
          return;
        }
        state.midiPlaying = true;
        state.scoreText = "Guitar MIDI — " + SONG_DATA.parts[state.partId].title + " (" + sec.shortLabel + ")";
        var readout = $("song-score-readout");
        if (readout) readout.textContent = state.scoreText + " — tab playhead follows MIDI.";
        updateBanner();
        midiTransport.timer = setInterval(scheduleMidiGuitarWindow, 25);
        scheduleMidiGuitarWindow();
        (function midiUiLoop() {
          if (!state.midiPlaying) return;
          renderLyricSheet();
          midiTransport.raf = requestAnimationFrame(midiUiLoop);
        })();
      }

      var midUrl =
        "/static/song/" + SONG_DATA.id + "-" + state.partId + ".mid";
      fetch(midUrl)
        .then(function (r) {
          if (!r.ok) throw new Error("missing midi");
          return r.arrayBuffer();
        })
        .then(function (buf) {
          var parsed = SongMidiApi.parseSmf(buf);
          beginWithEvents(parsed.notes);
        })
        .catch(function () {
          fetch("/static/song/generic-guitar.mid")
            .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(); })
            .then(function (buf) {
              var parsed = SongMidiApi.parseSmf(buf);
              beginWithEvents(parsed.notes);
            })
            .catch(function () {
              beginWithEvents(
                SongMidiApi.noteEventsFromParsedTab(
                  parsedParts[state.partId],
                  sec.startBar,
                  sec.endBar
                )
              );
            });
        });
    }

    function startTransport(isRecording, partToRecord) {
      var ctx = ensureAudio();
      if (!ctx) return;
      stopGuitarMidiPlayback();
      if (state.playing) stopTransport();

      var sec = currentSection();
      audio.loopStartBeat = sec.startBar * 4;
      audio.loopEndBeat = sec.endBar * 4;
      audio.countInBeats = isRecording ? 4 : 0;
      audio.startTime = ctx.currentTime + 0.05;
      audio.scheduledStep = -1;
      audio.scheduledNotes = {};
      audio.scheduledDrumHits = {};
      audio.drumLoopEpoch = 0;

      state.playing = true;
      state.recording = !!isRecording;
      state.recPart = isRecording ? (partToRecord || state.partId) : null;
      state.countInBeatsLeft = audio.countInBeats;
      if (!state.recording) {
        var playEl = $("song-score-readout");
        if (playEl) playEl.textContent = "Playing " + sec.shortLabel + " — loops until you press Stop.";
      }

      var targetNotes = parsedParts[state.partId].notes;
      pitchDetector = C.createOnsetDetector({ stableMs: 90 });
      state.judge = C.createTimedJudge(targetNotes, {
        secPerBeat: 60 / state.bpm,
        anyOctave: true
      });
      updateLiveScoreReadout();
      if (!isRecording && !state.ampRunning) startSongMic();

      if (state.recording) {
        var spb = 60 / state.bpm;
        for (var c = 0; c < 4; c++) {
          playDrumHit("hihat", audio.startTime + c * spb, 1.1);
        }
        /* Start server-side ALSA/Scarlett take capture */
        fetch("api/takes/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            part: state.recPart,
            start_bar: sec.startBar,
            end_bar: sec.endBar,
            bpm: state.bpm,
            count_in_beats: audio.countInBeats,
            /* capture starts ~now; bar 1 lands after the scheduling lead + what the browser adds before Sam hears it */
            latency_ms: Math.round((audio.startTime - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000)
          })
        })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (data) {
            if (data && data.amp_capturing) return;
            /* No live amp = nothing real to record. Never save a synth stand-in as Sam's take. */
            state.recording = false;
            stopTransport();
            var readout = $("song-score-readout");
            if (readout) {
              readout.textContent = "The amp isn't running, so there's no guitar to record. Open the Amp tab, press Start with your Scarlett Solo plugged in, then hit Record again.";
            }
          })
          .catch(function () {});
      }

      /* Previously recorded takes play in sync (the part being re-recorded is left out) */
      takeSources = scheduleTakes(
        ctx, audio.master, audio.startTime + audio.countInBeats * (60 / state.bpm),
        audio.loopStartBeat, audio.loopEndBeat, state.recording ? state.recPart : null
      );

      updateBanner();
      renderMixerRows();

      audio.timer = setInterval(scheduleAudioWindow, 25);
      scheduleAudioWindow();
      (function uiLoop() {
        if (!state.playing) return;
        renderSongScore();
        renderDrumGrid();
        renderLyricSheet();
        audio.raf = requestAnimationFrame(uiLoop);
      })();
    }

    function stopTransport() {
      var wasRecording = state.recording;
      var recordedPart = state.recPart || state.partId;
      var sec = currentSection();

      stopTakeSources();
      if (audio.timer) clearInterval(audio.timer);
      if (audio.raf) cancelAnimationFrame(audio.raf);
      audio.timer = null;
      audio.raf = null;

      state.playing = false;
      state.recording = false;
      state.recPart = null;
      state.cursorBeat = null;
      state.currentStep = -1;
      stopSongMic();
      pitchDetector = null;
      updateLiveScoreReadout();

      if (wasRecording && recordedPart && recordedPart !== "drums") {
        var statusEl = $("song-score-readout");
        if (statusEl) statusEl.textContent = "Saving recorded take for " + SONG_DATA.parts[recordedPart].title + "…";

        fetch("api/takes/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ part: recordedPart })
        })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (data) {
            if (data && data.saved_from_amp && data.takes && data.takes[recordedPart]) {
              state.takes[recordedPart] = data.takes[recordedPart];
              loadTakeBuffer(recordedPart);
              if (statusEl) {
                statusEl.textContent =
                  "Saved live Scarlett take for " + SONG_DATA.parts[recordedPart].title +
                  " (" + data.duration + "s)! Press Play Backing to hear it in the mix.";
              }
              renderMixerRows();
              return;
            }
            if (statusEl) {
              statusEl.textContent = "No take saved for " + SONG_DATA.parts[recordedPart].title +
                ": the amp didn't capture any guitar (is it started?).";
            }
            renderMixerRows();
          })
          .catch(function () {
            renderMixerRows();
          });
      } else {
        var readout = $("song-score-readout");
        if (readout) {
          readout.textContent = "Stopped — pick any part to practice or record.";
        }
      }

      updateBanner();
      renderSongScore();
      renderDrumGrid();
      renderLyricSheet();
      renderMixerRows();
    }

    /* Export Full Mix WAV: renders drums + Sam's recorded takes (+ guide synth only for parts with no take yet)
       offline at 44.1 kHz, honoring Mute / Solo / Volume, for the selected section or the whole song. */
    function exportFullMixWav(onlyStem) {
      onlyStem = typeof onlyStem === "string" ? onlyStem : null;
      var include = function (stemId) { return !onlyStem || onlyStem === stemId; };
      var live = ensureAudio();
      var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!live || !Offline) return;
      var readout = $("song-score-readout");
      var sec = currentSection();
      var spb = 60 / state.bpm;
      var startBeat = sec.startBar * 4;
      var endBeat = sec.endBar * 4;
      var tail = 1.5;
      var sr = 44100;
      var octx = new Offline(2, Math.ceil(sr * ((endBeat - startBeat) * spb + tail)), sr);
      var bus = octx.createGain();
      bus.gain.value = 0.9;
      var comp = octx.createDynamicsCompressor();
      bus.connect(comp);
      comp.connect(octx.destination);
      if (readout) readout.textContent = onlyStem ? "Rendering " + state.stems[onlyStem].label + " WAV…" : "Rendering full mix WAV…";
      var savedStems = null;
      if (onlyStem) {
        /* Render just this stem: temporarily solo it */
        savedStems = JSON.stringify(state.stems);
        Object.keys(state.stems).forEach(function (k) {
          state.stems[k].solo = k === onlyStem;
          state.stems[k].muted = false;
        });
      }

      renderTarget = { ctx: octx, dest: bus };
      try {
        var stepDur = spb / 4;
        for (var step = 0; step < (endBeat - startBeat) * 4; step++) {
          var absBeat = startBeat + step * 0.25;
          var pat = customDrumPatterns[sectionPatternForBar(Math.floor(absBeat / 4))] ||
            customDrumPatterns[defaultDrumPatternKey()];
          var s16 = step % 16;
          var when = step * stepDur;
          if (!include("drums")) break;
          if (pat.rows.kick[s16]) playDrumHit("kick", when, 1.0);
          if (pat.rows.snare[s16]) playDrumHit("snare", when, 1.0);
          if (pat.rows.hihat[s16]) playDrumHit("hihat", when, 0.85);
          if (pat.rows.crash[s16]) playDrumHit("crash", when, 0.9);
          if (pat.rows.ride && pat.rows.ride[s16]) playDrumHit("ride", when, 0.8);
        }
        ["rhythm", "lead", "bass", "vocals"].forEach(function (partId) {
          if (!include(partId) || state.takeBuffers[partId]) return; /* the real take wins */
          parsedParts[partId].notes.forEach(function (n) {
            if (n.rest || n.beat < startBeat - 1e-6 || n.beat >= endBeat - 1e-6) return;
            playPartNote(partId, n.midi, (n.beat - startBeat) * spb, n.beats * spb * 0.92, false);
          });
        });
        scheduleTakes(octx, bus, 0, startBeat, endBeat, null);
      } finally {
        renderTarget = null;
        if (savedStems) {
          var restored = JSON.parse(savedStems);
          Object.keys(restored).forEach(function (k) { state.stems[k] = restored[k]; });
        }
      }

      octx.startRendering().then(function (rendered) {
        var blob = encodeWavFromFloat32(rendered.getChannelData(0), rendered.getChannelData(1), rendered.sampleRate);
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = SONG_DATA.id + "-" + (sec.id === "all" ? "full" : sec.id) + "-" + (onlyStem || "mix") + ".wav";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        var takes = ["rhythm", "lead", "bass", "vocals"].filter(function (k) { return !!state.takeBuffers[k]; });
        if (readout && onlyStem) {
          readout.textContent = "Exported " + a.download + " (" + rendered.duration.toFixed(1) + "s" +
            (state.takeBuffers[onlyStem] ? ", your take)" : onlyStem === "drums" ? ", drum machine)" : ", guide synth: no take yet)");
        } else if (readout) {
          readout.textContent = "Exported " + a.download + " (" + rendered.duration.toFixed(1) + "s) — " +
            (takes.length ? "your takes: " + takes.join(", ") : "no takes recorded yet, guide synths only") + ".";
        }
      }).catch(function (err) {
        if (readout) readout.textContent = "Export failed: " + err.message;
      });
    }

    /* Wire DOM controls */
    document.querySelectorAll("#song-part-tabs [data-part]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectPart(btn.dataset.part);
      });
    });

    var songPicker = $("song-picker");
    if (songPicker && SongCatalog && SongCatalog.list) {
      SongCatalog.list().forEach(function (entry) {
        var opt = document.createElement("option");
        opt.value = entry.id;
        opt.textContent = entry.title + " (" + entry.songType + ")";
        songPicker.appendChild(opt);
      });
      songPicker.value = activeSongId;
      songPicker.addEventListener("change", function () {
        switchActiveSong(songPicker.value);
      });
    }

    var playBtn = $("song-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (state.playing && !state.recording) stopTransport();
        else startTransport(false);
      });
    }

    var guitarMidiBtn = $("song-guitar-midi-btn");
    if (guitarMidiBtn) {
      guitarMidiBtn.addEventListener("click", function () {
        startGuitarMidiPlayback();
      });
    }

    var recBtn = $("song-record-btn");
    if (recBtn) {
      recBtn.addEventListener("click", function () {
        if (state.recording) stopTransport();
        else startTransport(true, state.partId === "drums" ? "rhythm" : state.partId);
      });
    }

    var toneBtn = $("song-load-tone-btn");
    if (toneBtn) {
      toneBtn.addEventListener("click", function () {
        loadPartTone(state.partId);
      });
    }

    ["song-octave-btn", "octave-down-btn"].forEach(function (id) {
      var btn = $(id);
      if (!btn) return;
      btn.addEventListener("click", function () {
        setOctaveDown(btn.getAttribute("aria-pressed") !== "true", true);
      });
    });

    var bpmSlider = $("song-bpm");
    var bpmOut = $("song-bpm-out");
    if (bpmSlider) {
      bpmSlider.addEventListener("input", function () {
        state.bpm = parseInt(bpmSlider.value, 10) || SONG_DATA.bpm;
        if (bpmOut) bpmOut.textContent = state.bpm + " BPM";
      });
    }

    var drumSelect = $("song-drum-preset");
    if (drumSelect) {
      drumSelect.addEventListener("change", function () {
        state.drumPatternKey = drumSelect.value;
        renderDrumGrid();
      });
    }

    var exportBtn = $("song-export-mix");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () { exportFullMixWav(null); });
    }

    window.addEventListener("resize", function () {
      if (!panel.hidden) renderSongScore();
    });

    initHighContrastToggle();

    /* Initial render */
    refreshSongHeader();
    renderSectionButtons();
    renderDrumPresetSelect();
    selectPart("rhythm");
    selectSection("all");
    renderDrumGrid();
    renderLyricSheet();
    renderMixerRows();
    refreshTakes();

    return {
      selectPart: selectPart,
      selectSection: selectSection,
      setOctaveDown: setOctaveDown,
      renderSongScore: renderSongScore,
      startTransport: startTransport,
      stopTransport: stopTransport,
      feedAmpStatus: feedAmpStatus,
      switchActiveSong: switchActiveSong,
      wantsFastStatus: function () {
        return !panel.hidden && state.playing && !state.recording && TAB_PARTS[state.partId];
      },
      state: function () { return state; }
    };
  }

  function songTabVisible() {
    if (typeof document === "undefined") return false;
    var p = document.getElementById("song-panel");
    return p && !p.hidden;
  }

  function bootSongStudio() {
    try {
      return initBrowserStudio();
    } catch (err) {
      console.error("Song Studio init failed:", err);
      var readout = document.getElementById("song-score-readout");
      if (readout) {
        readout.textContent =
          "Song Studio failed to load (tab/notation will be blank). Open the browser console for details: " +
          (err && err.message ? err.message : String(err));
      }
      return null;
    }
  }

  var controller = null;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        controller = bootSongStudio();
      });
    } else {
      controller = bootSongStudio();
    }
  }

  function onAmpStatus(status) {
    if (!songTabVisible() || !controller) return;
    controller.feedAmpStatus(status);
  }

  function wantsFastStatusHook() {
    return controller && controller.wantsFastStatus();
  }

  return {
    get SONG_DATA() {
      return SONG_DATA;
    },
    SongCatalog: SongCatalog,
    activeSongId: function () { return activeSongId; },
    loadSongById: loadSongById,
    parsePartNotes: parsePartNotes,
    validateSong: validateSong,
    buildDrumHitTimeline: buildDrumHitTimeline,
    drumPatternKeyForBarIndex: drumPatternKeyForBarIndex,
    defaultDrumPatternKey: defaultDrumPatternKey,
    controller: function () { return controller; },
    isSongTabActive: songTabVisible,
    onAmpStatus: onAmpStatus,
    wantsFastStatus: wantsFastStatusHook
  };
});
