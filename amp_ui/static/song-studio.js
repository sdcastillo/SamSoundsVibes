/* Song Studio: "Sunset Redline" — Melodic Metal / Hard Rock Song & Multi-Track Guitar Recorder.
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

  var SONG_DATA = {
    id: "sunset-redline",
    title: "Sunset Redline",
    subtitle: "Melodic Metal / Hard Rock — Fast Cars Racing on the Beach at Sunset",
    key: "E minor",
    bpm: 132,
    meter: [4, 4],
    bars: 16,
    chords: [
      "E5", "G5", "A5", "B5",
      "C5", "D5", "Em", "B5",
      "Em", "C", "G", "D",
      "Em", "C", "G", "B5"
    ],
    sections: [
      {
        id: "all",
        label: "Full Song (Bars 1–16)",
        shortLabel: "Full Song (1–16)",
        startBar: 0,
        endBar: 16,
        drumPattern: "verse",
        description: "Complete 16-bar arrangement: Verse Riff → Pre-Chorus → Anthemic Chorus → Blistering Guitar Solo."
      },
      {
        id: "verse",
        label: "1 · Verse Riff: Salt Spray & Chrome (Bars 1–4)",
        shortLabel: "Verse (1–4)",
        startBar: 0,
        endBar: 4,
        drumPattern: "verse",
        description: "Palm-muted E5 shoreline gallop with twin-lead melody hook and driving eighth-note bass."
      },
      {
        id: "prechorus",
        label: "2 · Pre-Chorus: Tachometer Climbing (Bars 5–8)",
        shortLabel: "Pre-Chorus (5–8)",
        startBar: 4,
        endBar: 8,
        drumPattern: "prechorus",
        description: "Rising C5–D5–Em–B5 chord climb as the turbo spools against the crimson tide."
      },
      {
        id: "chorus",
        label: "3 · Chorus: Sunset Redline (Bars 9–12)",
        shortLabel: "Chorus (9–12)",
        startBar: 8,
        endBar: 12,
        drumPattern: "chorus",
        description: "Wide-open Em–C–G–D stadium metal chorus with soaring harmonized lead and crash-ride groove."
      },
      {
        id: "solo",
        label: "4 · Guitar Solo: Twin Turbos in the Tide (Bars 13–16)",
        shortLabel: "Guitar Solo (13–16)",
        startBar: 12,
        endBar: 16,
        drumPattern: "solo",
        description: "High-octane melodic metal guitar solo: 16th-note E minor scale bursts, crying bends, and high E5 climax."
      }
    ],

    parts: {
      rhythm: {
        id: "rhythm",
        number: "1",
        title: "1) Rhythm Guitar",
        subtitle: "Palm-muted E5 beach-race gallop & wide chorus power chords",
        octaveDown: false,
        tone: {
          slot: 18,
          name: "Revv Gen Red",
          ir: "Mesa_4x12_V30.wav",
          overrides: {
            drive: 24.5,
            bass: 0.56,
            mid: 0.62,
            treble: 0.68,
            presence: 0.64,
            mix: 0.12,
            volume: 0.65,
            octave_down: 0.0
          }
        },
        tip: "Palm-mute the low E string on the eighth-note chugs in Bars 1–4, then let the chorus power chords ring wide open.",
        tab: [
          /* Bars 1-4: Verse Riff (E5 - G5 - A5 - B5) */
          "E0e E0e E3e E0e E5e E0e E7e E5e",
          "E3e E3e E3e E5e E7e E5e E3e E2e",
          "A0e A0e A3e A0e A5e A0e A7e A5e",
          "A2e A2e D4e A2e A5e A2e D4q",
          /* Bars 5-8: Pre-Chorus (C5 - D5 - Em - B5) */
          "A3q A3e A3e D5q D5e A3e",
          "A5q A5e A5e D7q D7e A5e",
          "E0e E0e E3e E5e A7q D5q",
          "A2e A2e D4e A2e A6e A2e B0q",
          /* Bars 9-12: Chorus (Em - C - G - D) */
          "E0q E0e E0e A7q D9q",
          "A3q A3e A3e D5q G5q",
          "E3q E3e E3e A5q D5q",
          "A5q A5e A5e D7q G7q",
          /* Bars 13-16: Solo Backing (Em - C - G - B5) */
          "E0e E0e E3e E0e E5e E0e E7q",
          "A3e A3e A3e A5e D5e D5e G5q",
          "E3e E3e E3e E5e A5e A5e D5q",
          "A2e A2e D4e A2e A6e A2e E0q"
        ].join(" | ")
      },

      lead: {
        id: "lead",
        number: "2",
        title: "2) Lead Guitar + Solo",
        subtitle: "Horizon twin-lead hooks & 4-bar melodic shred solo (Bars 13–16)",
        octaveDown: false,
        tone: {
          slot: 7,
          name: "MK IV lead 2",
          ir: "Mesa_4x12_V30.wav",
          overrides: {
            drive: 27.0,
            bass: 0.52,
            mid: 0.68,
            treble: 0.72,
            presence: 0.66,
            delay_ms: 360,
            feedback: 0.34,
            mix: 0.26,
            volume: 0.72,
            octave_down: 0.0
          }
        },
        tip: "Bars 1–12 weave melodic hooks over the riffs; Bars 13–16 unleash the full Guitar Solo up to the 12th fret high E!",
        tab: [
          /* Bars 1-4: Melodic Horizon Lead Hook */
          "B5q B8e B7e G7q G9q",
          "B8q B7e B5e G7h",
          "G5q G7e G9e B8q B10q",
          "B7q B8e B7e G8h",
          /* Bars 5-8: Pre-Chorus Arpeggio Climb */
          "G5e B5e e7e B5e G5e B5e e8q",
          "G7e B7e e10e B7e G7e B7e e10q",
          "G9e B8e e12e B8e G9e B8e e12q",
          "B7e B8e B10e B8e B7q e11q",
          /* Bars 9-12: Soaring Chorus Counter-Melody */
          "e12q B12e B10e B8q G9q",
          "B8q e8e e7e B8q G9q",
          "B8q B10e B12e e10q B8q",
          "B10q e10e B10e B7h",
          /* Bars 13-16: THE GUITAR SOLO ("Twin Turbos in the Tide") */
          "G9s G11s G12s B12s e12e B15e e12e e15e e12q",
          "e15e e14e e12e B15e B13e B12e G14e G12e",
          "B12s B13s B15s e12s e14s e15s e14s e12s B15e B12e G14q",
          "B12e e12e e14e e15e e12h"
        ].join(" | ")
      },

      bass: {
        id: "bass",
        number: "3",
        title: "3) Bass Part (-1 Oct Guitar)",
        subtitle: "Played on your guitar's E/A/D strings with Down-Octave ON",
        octaveDown: true,
        tone: {
          slot: 50,
          name: "BAS:SVT Nrm",
          ir: "Ampeg_8x10_SVT.wav",
          overrides: {
            drive: 11.5,
            bass: 0.78,
            mid: 0.58,
            treble: 0.42,
            presence: 0.38,
            mix: 0.0,
            volume: 0.78,
            low_cut: 35.0,
            high_cut: 4200.0,
            octave_down: 1.0
          }
        },
        tip: "Turn ON the Down-Octave (Bass Mode) button! Play these fretted notes on your regular guitar's 6th, 5th, and 4th strings and the amp shifts you down 1 octave into sub-bass thunder.",
        tab: [
          /* Bars 1-4: Locked-in 8th-note bass drive */
          "E0e E0e E0e E3e E5e E5e E7e E5e",
          "E3e E3e E3e E5e E7e E5e E3e E2e",
          "A0e A0e A0e A3e A5e A5e A7e A5e",
          "A2e A2e A2e A5e D4e A5e A2q",
          /* Bars 5-8: Pre-Chorus Bass Walk-up */
          "A3q A3e A3e A3q D5q",
          "A5q A5e A5e A5q D7q",
          "E0q E0e E3e E5q E7q",
          "A2e A2e A2e A5e A6q A2q",
          /* Bars 9-12: Chorus Octave-Jumping Bass */
          "E0q D2e E0e E0q D2q",
          "A3q D5e A3e A3q G5q",
          "E3q D5e E3e E3q D5q",
          "A5q D7e A5e A5q A2q",
          /* Bars 13-16: Solo Foundation Bass */
          "E0e E0e E3e E5e E7e E7e D5q",
          "A3e A3e A5e A7e D5e D5e A3q",
          "E3e E3e E5e E7e A5e A5e D5q",
          "A2e A2e D4e A2e A6e A2e E0q"
        ].join(" | ")
      },

      drums: {
        id: "drums",
        number: "4",
        title: "4) Drum Machine",
        subtitle: "16-step synthesized metal kit (double-kick, snare, crash, ride)",
        octaveDown: false,
        tone: null,
        tip: "Switch drum patterns below or click any step in the 16-step grid to customize the kick, double-bass, snare, hi-hat, crash, and ride.",
        /* Drum groove represented on tab for visual alignment when viewing Drum tab */
        tab: [
          "E0e E0e D2e E0e E0e E0e D2e E0e",
          "E0e E0e D2e E0e E0e D2e D2e E0e",
          "E0e E0e D2e E0e E0e E0e D2e E0e",
          "E0e D2e E0e D2e A3e A2e E0q",
          "E0q D2q E0e E0e D2q",
          "E0q D2q E0e E0e D2q",
          "E0e E0e D2q E0e E0e D2q",
          "D2e D2e D2e D2e A3e A2e E0q",
          "E0q D2q E0e E0e D2q",
          "E0q D2q E0e E0e D2q",
          "E0q D2q E0e E0e D2q",
          "E0e E0e D2e E0e D2e D2e E0q",
          "E0e E0e D2e E0e E0e E0e D2e E0e",
          "E0e E0e D2e E0e E0e E0e D2e E0e",
          "E0e E0e D2e E0e E0e E0e D2e E0e",
          "D2e D2e A3e A2e E0e E0e E0q"
        ].join(" | ")
      },

      vocals: {
        id: "vocals",
        number: "5",
        title: "5) Lyrics (Notes + Words)",
        subtitle: "Vocal melody notes & lyrics — Fast cars racing on the beach at sunset",
        octaveDown: false,
        tone: {
          slot: 26,
          name: "Soldano Lead",
          ir: "Mesa_4x12_V30.wav",
          overrides: {
            drive: 16.0,
            bass: 0.50,
            mid: 0.65,
            treble: 0.64,
            presence: 0.60,
            mix: 0.28,
            volume: 0.65,
            octave_down: 0.0
          }
        },
        tip: "Every lyric word is paired with its exact melody note on the staff and playable on guitar. Follow the gold words and aqua note names under each bar!",
        tab: [
          /* Bars 1-4: Verse 1 Vocal Melody */
          "G9q G9e G7e B8q B7q",
          "B8q B7e G9e G7h",
          "G9q B8e B10e B12q B10q",
          "B8q B7e G9e B7h",
          /* Bars 5-8: Pre-Chorus Vocal Melody */
          "B8q B8e B10e B8q G9q",
          "B10q B10e B12e B10q G11q",
          "B12q B10e B8e G9q G7q",
          "B7q B8e B10e B12h",
          /* Bars 9-12: Chorus Vocal Melody */
          "e12q B12e B10e B8q G9q",
          "B8q B10e B8e G9q G7q",
          "B8q B10e B12e e10q B8q",
          "B10q B8e B7e G9h",
          /* Bars 13-16: Outro / Solo Vocal Chant */
          "e12q B12e B10e B8q G9q",
          "B8q B10e B12e e10h",
          "e12q e10e B12e B10q B8q",
          "B7q B8e B7e G9h"
        ].join(" | "),
        lyricsByBar: [
          /* Bar 1 (5 notes) */ ["V-eights", "howl", "on", "crimson", "sand"],
          /* Bar 2 (4 notes) */ ["Salt", "spray", "flies", "past!"],
          /* Bar 3 (5 notes) */ ["Chrome", "burns", "gold", "and", "red"],
          /* Bar 4 (4 notes) */ ["Sun", "sets", "a-", "head!"],
          /* Bar 5 (5 notes) */ ["Shift", "gears,", "feel", "the", "roar"],
          /* Bar 6 (5 notes) */ ["Tur-", "bos", "shake", "the", "shore"],
          /* Bar 7 (5 notes) */ ["Head-", "lights", "cut", "the", "foam"],
          /* Bar 8 (4 notes) */ ["Full", "speed", "for", "home!"],
          /* Bar 9 (5 notes) */ ["SUN-", "SET", "RED-", "LINE", "roar!"],
          /* Bar 10 (5 notes) */ ["Fly-", "ing", "down", "the", "shore!"],
          /* Bar 11 (5 notes) */ ["Wheels", "ignite", "where", "breakers", "crash"],
          /* Bar 12 (4 notes) */ ["Out-", "run", "the", "night!"],
          /* Bar 13 (5 notes) */ ["Burn", "the", "ho-", "ri-", "zon"],
          /* Bar 14 (4 notes) */ ["Chase", "the", "sinking", "sun"],
          /* Bar 15 (5 notes) */ ["Thun-", "der", "in", "the", "tide"],
          /* Bar 16 (4 notes) */ ["Red-", "line", "sunset", "ride!"]
        ],
        lyricSheet: [
          {
            section: "Verse 1 — Salt Spray & Chrome (Bars 1–4)",
            chords: "E5 · G5 · A5 · B5",
            lines: [
              {
                words: "V-eights howl on crimson sand, salt spray flies at our command",
                notes: "E4 E4 D4 G4 F#4 (E5) · G4 F#4 E4 D4 (G5)"
              },
              {
                words: "Chrome is burning gold and red, daylight dying up ahead",
                notes: "E4 G4 A4 B4 A4 (A5) · G4 F#4 E4 F#4 (B5)"
              }
            ]
          },
          {
            section: "Pre-Chorus — Tachometer Climbing (Bars 5–8)",
            chords: "C5 · D5 · Em · B5",
            lines: [
              {
                words: "Shift the gears and feel the roar, twin turbos shake the ocean floor",
                notes: "G4 G4 A4 G4 E4 (C5) · A4 A4 B4 A4 F#4 (D5)"
              },
              {
                words: "Headlights cut the purple foam — no brakes now, we race for home!",
                notes: "B4 A4 G4 E4 D4 (Em) · F#4 G4 A4 B4 (B5)"
              }
            ]
          },
          {
            section: "Chorus — Sunset Redline (Bars 9–12)",
            chords: "Em · C · G · D",
            lines: [
              {
                words: "SUNSET REDLINE on the shore! Pedal down to one-twenty-four!",
                notes: "E5 B4 A4 G4 E4 (Em) · G4 A4 G4 E4 D4 (C)"
              },
              {
                words: "Wheels on fire where breakers crash — outrun the night in a flash!",
                notes: "G4 A4 B4 D5 G4 (G) · A4 G4 F#4 E4 (D)"
              }
            ]
          },
          {
            section: "Guitar Solo & Outro — Twin Turbos in the Tide (Bars 13–16)",
            chords: "Em · C · G · B5",
            lines: [
              {
                words: "[Guitar Solo: 16th-note E-minor shred climb to 15th-fret high G5] Burn the horizon line, chasing the sinking sun",
                notes: "Solo: E4–F#4–G4–B4–E5–G5–E5 · D5–B4–A4–G4"
              },
              {
                words: "Steel and thunder in the tide — Sunset Redline ride!",
                notes: "E5 D5 B4 A4 G4 (G) · F#4 G4 F#4 E4 (B5→Em)"
              }
            ]
          }
        ]
      }
    },

    /* 16-step (16th-note) drum machine patterns per section */
    drumPatterns: {
      verse: {
        name: "Metal Beach Gallop (Verse)",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          kick:  [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1]
        }
      },
      prechorus: {
        name: "Turbo Build (Pre-Chorus)",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
          kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1]
        }
      },
      chorus: {
        name: "Sunset Redline Half-Time Crash (Chorus)",
        rows: {
          crash: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
          kick:  [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0]
        }
      },
      solo: {
        name: "Double-Bass Shred Overdrive (Guitar Solo)",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
          hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
          kick:  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]
        }
      }
    }
  };

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
      recording: false,
      recPart: null,
      countInBeatsLeft: 0,
      drumPatternKey: "verse",
      cursorBeat: null,
      currentStep: -1,
      judge: null,
      scoreText: "Ready — pick a part and press Play Backing or Record My Guitar Take.",
      takes: {},
      takeBuffers: {},
      stems: {
        drums: { label: "4) Drum Machine (Metal Kit)", vol: 0.85, muted: false, solo: false, recordable: false },
        bass: { label: "3) Bass Guitar (-1 Oct)", vol: 0.82, muted: false, solo: false, recordable: true },
        rhythm: { label: "1) Rhythm Guitar", vol: 0.80, muted: false, solo: false, recordable: true },
        lead: { label: "2) Lead Guitar + Solo", vol: 0.85, muted: false, solo: false, recordable: true },
        vocals: { label: "5) Vocal Melody Guide", vol: 0.65, muted: false, solo: false, recordable: true }
      }
    };

    var parsedParts = {};
    Object.keys(SONG_DATA.parts).forEach(function (k) {
      parsedParts[k] = parsePartNotes(k);
    });

    /* Deep copy drum patterns so the user can edit steps live */
    var customDrumPatterns = JSON.parse(JSON.stringify(SONG_DATA.drumPatterns));

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
      activeSources: [],
      noiseBuffer: null
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

    function stemAudible(stemId) {
      var anySolo = Object.keys(state.stems).some(function (k) { return state.stems[k].solo; });
      var st = state.stems[stemId];
      if (!st) return false;
      if (anySolo) return !!st.solo;
      return !st.muted && st.vol > 0.001;
    }

    /* Synthesize punchy rock/metal drum hits */
    function playDrumHit(kind, when, gainScale) {
      var ctx = ensureAudio();
      if (!ctx || !stemAudible("drums")) return;
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
        g.connect(audio.master);
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
        clickG.connect(audio.master);
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
        sG.connect(audio.master);
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
          nG.connect(audio.master);
          nSrc.start(t);
          nSrc.stop(t + 0.2);
        }
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
        cG.connect(audio.master);
        cSrc.start(t);
        cSrc.stop(t + dur + 0.02);
      }
    }

    /* Guide synth for Rhythm, Lead/Solo, Bass (-1 Oct), and Vocals */
    function playPartNote(partId, midi, when, durationSec, alsoToRecorder) {
      var ctx = ensureAudio();
      if (!ctx) return;
      if (!alsoToRecorder && !stemAudible(partId)) return;
      /* If the user has already recorded a real take for this part and we're not currently re-recording it, let the recorded audio stem play instead of the guide synth */
      if (!alsoToRecorder && state.takeBuffers[partId] && state.recPart !== partId) return;

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
      gain.connect(audio.master);
      if (alsoToRecorder && audio.recDest) {
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
      if (bar < 4) return "verse";
      if (bar < 8) return "prechorus";
      if (bar < 12) return "chorus";
      return "solo";
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

    function loadPartTone(partId) {
      var part = SONG_DATA.parts[partId || state.partId];
      if (!part) return;
      setOctaveDown(!!part.octaveDown, true);
      var statusEl = $("song-tone-status");
      if (!part.tone) {
        if (statusEl) statusEl.textContent = "Drum Machine selected — edit 16-step groove below.";
        return;
      }
      if (!window.AmpUI || !window.AmpUI.loadPreset) return;
      if (statusEl) statusEl.textContent = "Loading " + part.tone.name + "…";
      window.AmpUI.loadPreset({
        slot: part.tone.slot,
        ir: part.tone.ir,
        overrides: part.tone.overrides
      })
        .then(function (data) {
          setOctaveDown(!!part.octaveDown, true);
          if (statusEl) {
            statusEl.textContent =
              "Loaded " + part.tone.name +
              (part.octaveDown ? " + Down-Octave (-1 Oct Bass Mode ON)" : "") +
              (data && data.running ? " (Amp live)" : " (Ready)");
          }
        })
        .catch(function (err) {
          if (statusEl) statusEl.textContent = "Preset note: " + err.message;
        });
    }

    /* Render the full-width 4-bars-per-line Staff + Guitar Tab + Lyrics + Notes SVG */
    function renderSongScore() {
      var svg = $("song-staff-svg");
      if (!svg) return;
      var parsed = parsedParts[state.partId];
      var sec = currentSection();
      var startBar = sec.startBar;
      var endBar = sec.endBar;
      var totalBars = endBar - startBar;
      var perRow = 4;
      var rows = Math.max(1, Math.ceil(totalBars / perRow));
      var width = Math.max(780, Math.round((svg.parentNode && svg.parentNode.clientWidth) || 920) - 16);

      var staffTop = 28;
      var half = 5.5;
      var staffH = 52;
      var tabGap = 11;
      var tabTopOffset = 74;
      var rowH = 182;

      svg.setAttribute("viewBox", "0 0 " + width + " " + (rows * rowH + 10));
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var x0 = 46;
      var barW = (width - x0 - 14) / perRow;

      for (var r = 0; r < rows; r++) {
        var rY = r * rowH;
        var rowStartBar = startBar + r * perRow;
        var rowBars = Math.min(perRow, endBar - rowStartBar);
        var x1 = x0 + rowBars * barW;

        /* Section header on the left of the row */
        var secName =
          rowStartBar === 0 ? "VERSE (Bars 1–4)" :
          rowStartBar === 4 ? "PRE-CHORUS (Bars 5–8)" :
          rowStartBar === 8 ? "CHORUS (Bars 9–12)" :
          "GUITAR SOLO (Bars 13–16)";
        svg.appendChild(el("text", { class: "song-section-tag", x: x0, y: rY + 13 }, secName));

        /* 5-line Treble Staff */
        var staffLinesG = el("g", { class: "lab-staff-lines" });
        for (var l = 0; l < 5; l++) {
          var ly = rY + staffTop + l * (half * 2);
          staffLinesG.appendChild(el("line", { x1: 10, x2: x1, y1: ly, y2: ly }));
        }
        svg.appendChild(staffLinesG);
        svg.appendChild(el("text", { class: "lab-clef", x: 14, y: rY + staffTop + 36 }, "\uD834\uDD1E"));

        /* 6-line Guitar Tab */
        var tabTop = rY + tabTopOffset;
        var tabLinesG = el("g", { class: "lab-tab-lines" });
        for (var s = 1; s <= 6; s++) {
          var ty = tabTop + (s - 1) * tabGap;
          tabLinesG.appendChild(el("line", { x1: 10, x2: x1, y1: ty, y2: ty }));
        }
        svg.appendChild(tabLinesG);
        ["T", "A", "B"].forEach(function (ch, idx) {
          svg.appendChild(el("text", { class: "lab-tab-clef", x: 18, y: tabTop + 14 + idx * 16 }, ch));
        });

        /* Bar lines & Chord symbols */
        for (var b = 0; b <= rowBars; b++) {
          var bx = x0 + b * barW;
          var barIndex = rowStartBar + b;
          var isEnd = barIndex === endBar;
          svg.appendChild(el("line", {
            class: "lab-bar" + (isEnd ? " is-final" : ""),
            x1: bx,
            x2: bx,
            y1: rY + staffTop,
            y2: tabTop + 5 * tabGap
          }));
          if (b < rowBars) {
            var chordName = SONG_DATA.chords[barIndex] || "";
            svg.appendChild(el("text", {
              class: "lab-chord",
              x: bx + 10,
              y: rY + 13
            }, "Bar " + (barIndex + 1) + " · " + chordName));
          }
        }

        /* Notes, Tab Numbers, Note Names, and Synchronized Lyrics in this row */
        parsed.notes.forEach(function (n, noteIdx) {
          if (n.bar < rowStartBar || n.bar >= rowStartBar + rowBars) return;
          if (n.rest) return;
          var localBar = n.bar - rowStartBar;
          var nx = x0 + localBar * barW + 18 + (n.pos / 4) * (barW - 30);

          /* Staff vertical position (written guitar pitch) */
          var written = C.writtenNote(n.note, "guitar");
          var step = C.staffStep(written);
          var clampedStep = Math.max(-4, Math.min(16, step));
          var ny = rY + staffTop + (10 - clampedStep) * half;

          var st = state.judge ? state.judge.status(noteIdx) : "";
          var isCurrent =
            state.cursorBeat != null &&
            state.cursorBeat >= n.beat - 0.05 &&
            state.cursorBeat < n.beat + n.beats;
          var cls = st === "hit" ? "is-hit" : st === "miss" ? "is-missed" : isCurrent ? "is-target" : "";

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
            noteG.appendChild(el("line", {
              class: "lab-stem",
              x1: nx + 5,
              x2: nx + 5,
              y1: ny,
              y2: ny - 22
            }));
          }
          svg.appendChild(noteG);

          /* Guitar Tab fret number */
          var ty = tabTop + (n.string - 1) * tabGap;
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

          /* Note name + Lyric syllable underneath the tab */
          var lyricText = n.lyric || n.cueLyric || "";
          var noteNameY = tabTop + 5 * tabGap + 15;
          svg.appendChild(el("text", {
            class: "song-lyric-note",
            x: nx,
            y: noteNameY
          }, C.pitchClassName(n.note) + (state.partId === "bass" ? (n.note.octave - 1) : n.note.octave)));

          if (lyricText) {
            svg.appendChild(el("text", {
              class: "song-lyric-word",
              x: nx,
              y: noteNameY + 14
            }, lyricText));
          }
        });

        /* Playhead cursor if in this row */
        if (state.cursorBeat != null) {
          var cBar = Math.floor(state.cursorBeat / 4);
          if (cBar >= rowStartBar && cBar < rowStartBar + rowBars) {
            var cBeatInBar = state.cursorBeat - cBar * 4;
            var cx = x0 + (cBar - rowStartBar) * barW + 18 + (cBeatInBar / 4) * (barW - 30);
            svg.appendChild(el("line", {
              class: "lab-playhead",
              x1: cx,
              x2: cx,
              y1: rY + staffTop - 6,
              y2: tabTop + 5 * tabGap + 28
            }));
          }
        }
      }
    }

    /* Render 16-step Drum Machine grid */
    function renderDrumGrid() {
      var container = $("song-drum-grid");
      if (!container) return;
      var pat = customDrumPatterns[state.drumPatternKey] || customDrumPatterns.verse;
      var titleEl = $("song-drum-pattern-name");
      if (titleEl) titleEl.textContent = pat.name;
      container.innerHTML = "";

      var rowOrder = [
        { key: "crash", label: "Crash / Ride" },
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
          renderMixerRows();
        });
        btns.appendChild(muteBtn);

        var soloBtn = document.createElement("button");
        soloBtn.type = "button";
        soloBtn.className = "secondary" + (st.solo ? " is-muted" : "");
        soloBtn.textContent = st.solo ? "Solo ON" : "Solo";
        soloBtn.addEventListener("click", function () {
          st.solo = !st.solo;
          renderMixerRows();
        });
        btns.appendChild(soloBtn);

        if (take) {
          var dl = document.createElement("a");
          dl.href = take.url;
          dl.download = "sunset-redline-" + stemId + ".wav";
          dl.className = "song-badge is-gold";
          dl.style.textDecoration = "none";
          dl.textContent = "WAV";
          btns.appendChild(dl);

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
      state.drumPatternKey = sec.drumPattern || "verse";
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

    /* Render a synthetic guitar/bass stem buffer when recording in browser without a physical mic */
    function renderGuideTakeWav(partId, startBar, endBar, bpm) {
      var sr = 22050;
      var spb = 60 / bpm;
      var totalBeats = (endBar - startBar) * 4;
      var totalSec = Math.min(45, totalBeats * spb);
      var len = Math.floor(sr * totalSec);
      var out = new Float32Array(len);
      var notes = parsedParts[partId].notes.filter(function (n) {
        return !n.rest && n.bar >= startBar && n.bar < endBar;
      });
      var isBass = partId === "bass";
      notes.forEach(function (n) {
        var relBeat = (n.bar - startBar) * 4 + n.pos;
        var s0 = Math.floor(relBeat * spb * sr);
        var s1 = Math.min(len, Math.floor((relBeat + n.beats) * spb * sr));
        var midi = isBass ? n.midi - 12 : n.midi;
        var hz = C.midiToHz(midi);
        for (var i = s0; i < s1; i++) {
          var dt = (i - s0) / sr;
          var env = Math.min(1, dt / 0.008) * Math.exp(-dt * (isBass ? 2.4 : 1.9));
          var raw = Math.sin(2 * Math.PI * hz * dt) + 0.5 * Math.sin(4 * Math.PI * hz * dt);
          var shaped = Math.tanh(raw * (isBass ? 1.8 : 2.8));
          out[i] += 0.35 * env * shaped;
        }
      });
      return { blob: encodeWavFromFloat32(out, null, sr), duration: Number(totalSec.toFixed(2)) };
    }

    /* Fetch recorded takes from server */
    function refreshTakes() {
      fetch("api/takes")
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (data) {
          if (data && data.takes) {
            Object.keys(data.takes).forEach(function (k) {
              state.takes[k] = data.takes[k];
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
    }

    /* Schedule lookahead for Drums + All 4 Melodic Parts */
    function scheduleAudioWindow() {
      if (!state.playing || !audio.ctx) return;
      var ctx = audio.ctx;
      var spb = 60 / state.bpm;
      var stepDur = spb / 4; /* 16th note */
      var elapsed = ctx.currentTime - audio.startTime;
      var countInSec = audio.countInBeats * spb;

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
        songSec -= loopDur;
      }

      var currentBeat = audio.loopStartBeat + songSec / spb;
      state.cursorBeat = currentBeat;
      var totalSteps = Math.floor(( currentBeat - audio.loopStartBeat ) * 4);
      state.currentStep = ((totalSteps % 16) + 16) % 16;

      /* Schedule 16th-note drum steps up to 100ms ahead */
      var lookaheadSteps = Math.floor((songSec + 0.10) / stepDur);
      while (audio.scheduledStep < lookaheadSteps && (audio.scheduledStep + 1) < loopBeats * 4) {
        audio.scheduledStep += 1;
        var stepIdx = audio.scheduledStep;
        var stepWhen = audio.startTime + countInSec + stepIdx * stepDur;
        var absBeat = audio.loopStartBeat + stepIdx * 0.25;
        var barIdx = Math.floor(absBeat / 4);
        var patKey = sectionPatternForBar(barIdx);
        var pat = customDrumPatterns[patKey] || customDrumPatterns.verse;
        var s16 = stepIdx % 16;
        if (pat.rows.kick[s16]) playDrumHit("kick", stepWhen, 1.0);
        if (pat.rows.snare[s16]) playDrumHit("snare", stepWhen, 1.0);
        if (pat.rows.hihat[s16]) playDrumHit("hihat", stepWhen, 0.85);
        if (pat.rows.crash[s16]) playDrumHit("crash", stepWhen, 0.9);
      }

      /* Schedule Guide Synth notes for Rhythm, Lead, Bass, and Vocals */
      ["rhythm", "lead", "bass", "vocals"].forEach(function (partId) {
        var notes = parsedParts[partId].notes;
        notes.forEach(function (n, idx) {
          if (n.rest) return;
          if (n.beat < audio.loopStartBeat - 1e-6 || n.beat >= audio.loopEndBeat - 1e-6) return;
          var key = partId + ":" + idx;
          if (audio.scheduledNotes[key]) return;
          var noteRelSec = (n.beat - audio.loopStartBeat) * spb;
          if (noteRelSec <= songSec + 0.11 && noteRelSec >= songSec - 0.04) {
            audio.scheduledNotes[key] = true;
            var when = audio.startTime + countInSec + noteRelSec;
            var durSec = n.beats * spb * 0.92;
            playPartNote(partId, n.midi, when, durSec, state.recording && state.recPart === partId);
          }
        });
      });

      if (state.judge) {
        state.judge.sweep(currentBeat * spb);
      }
    }

    function startTransport(isRecording, partToRecord) {
      var ctx = ensureAudio();
      if (!ctx) return;
      if (state.playing) stopTransport();

      var sec = currentSection();
      audio.loopStartBeat = sec.startBar * 4;
      audio.loopEndBeat = sec.endBar * 4;
      audio.countInBeats = isRecording ? 4 : 0;
      audio.startTime = ctx.currentTime + 0.05;
      audio.scheduledStep = -1;
      audio.scheduledNotes = {};

      state.playing = true;
      state.recording = !!isRecording;
      state.recPart = isRecording ? (partToRecord || state.partId) : null;
      state.countInBeatsLeft = audio.countInBeats;

      var targetNotes = parsedParts[state.partId].notes;
      state.judge = C.createTimedJudge(targetNotes, {
        secPerBeat: 60 / state.bpm,
        anyOctave: true
      });

      if (state.recording) {
        var spb = 60 / state.bpm;
        for (var c = 0; c < 4; c++) {
          playDrumHit("hihat", audio.startTime + c * spb, 1.1);
        }
        /* Start server-side ALSA/Scarlett take capture */
        fetch("api/takes/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ part: state.recPart })
        }).catch(function () {});
      }

      updateBanner();
      renderMixerRows();

      audio.timer = setInterval(scheduleAudioWindow, 25);
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

      if (audio.timer) clearInterval(audio.timer);
      if (audio.raf) cancelAnimationFrame(audio.raf);
      audio.timer = null;
      audio.raf = null;

      state.playing = false;
      state.recording = false;
      state.recPart = null;
      state.cursorBeat = null;
      state.currentStep = -1;

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
              if (statusEl) {
                statusEl.textContent =
                  "Saved live Scarlett take for " + SONG_DATA.parts[recordedPart].title +
                  " (" + data.duration + "s)! Press Play Backing to hear it in the mix.";
              }
              renderMixerRows();
              return;
            }
            /* Fallback when the hardware amp isn't running: create & upload a WAV take for this part so the user can test and export the full mix immediately */
            var fallback = renderGuideTakeWav(recordedPart, sec.startBar, sec.endBar, state.bpm);
            var url = URL.createObjectURL(fallback.blob);
            state.takes[recordedPart] = {
              part: recordedPart,
              url: url,
              duration: fallback.duration
            };
            var reader = new FileReader();
            reader.onloadend = function () {
              fetch("api/takes/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  part: recordedPart,
                  ext: ".wav",
                  audio_base64: reader.result
                })
              })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (up) {
                  if (up && up.takes && up.takes[recordedPart]) {
                    state.takes[recordedPart] = up.takes[recordedPart];
                  }
                  renderMixerRows();
                })
                .catch(function () {});
            };
            reader.readAsDataURL(fallback.blob);
            if (statusEl) {
              statusEl.textContent =
                "Recorded " + SONG_DATA.parts[recordedPart].title + " take (" + fallback.duration + "s WAV)!";
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

    /* Export Full Song Mixdown WAV (Drums + Bass + Rhythm + Lead + Vocals) */
    function exportFullMixWav() {
      var sr = 22050;
      var sec = currentSection();
      var spb = 60 / state.bpm;
      var totalBeats = (sec.endBar - sec.startBar) * 4;
      var totalSec = Math.min(60, totalBeats * spb);
      var len = Math.floor(sr * totalSec);
      var mixL = new Float32Array(len);
      var mixR = new Float32Array(len);

      ["rhythm", "lead", "bass", "vocals"].forEach(function (partId) {
        if (!stemAudible(partId)) return;
        var vol = state.stems[partId].vol * 0.25;
        var panL = partId === "rhythm" ? 0.85 : partId === "lead" ? 0.6 : 0.75;
        var panR = partId === "rhythm" ? 0.6 : partId === "lead" ? 0.85 : 0.75;
        var isBass = partId === "bass";
        parsedParts[partId].notes.forEach(function (n) {
          if (n.rest || n.bar < sec.startBar || n.bar >= sec.endBar) return;
          var relBeat = (n.bar - sec.startBar) * 4 + n.pos;
          var s0 = Math.floor(relBeat * spb * sr);
          var s1 = Math.min(len, Math.floor((relBeat + n.beats) * spb * sr));
          var midi = isBass ? n.midi - 12 : n.midi;
          var hz = C.midiToHz(midi);
          for (var i = s0; i < s1; i++) {
            var dt = (i - s0) / sr;
            var env = Math.min(1, dt / 0.008) * Math.exp(-dt * (isBass ? 2.4 : 1.8));
            var sig = Math.tanh((Math.sin(2 * Math.PI * hz * dt) + 0.45 * Math.sin(4 * Math.PI * hz * dt)) * 2.4) * env * vol;
            mixL[i] += sig * panL;
            mixR[i] += sig * panR;
          }
        });
      });

      var blob = encodeWavFromFloat32(mixL, mixR, sr);
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sunset-redline-mix.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    /* Wire DOM controls */
    document.querySelectorAll("#song-part-tabs [data-part]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectPart(btn.dataset.part);
      });
    });

    document.querySelectorAll("#song-sections [data-section]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectSection(btn.dataset.section);
      });
    });

    var playBtn = $("song-play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (state.playing && !state.recording) stopTransport();
        else startTransport(false);
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
        setOctaveDown(!state.octaveDown, true);
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
      exportBtn.addEventListener("click", exportFullMixWav);
    }

    window.addEventListener("resize", function () {
      if (!panel.hidden) renderSongScore();
    });

    /* Initial render */
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
      state: function () { return state; }
    };
  }

  var controller = null;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        controller = initBrowserStudio();
      });
    } else {
      controller = initBrowserStudio();
    }
  }

  return {
    SONG_DATA: SONG_DATA,
    parsePartNotes: parsePartNotes,
    validateSong: validateSong,
    controller: function () { return controller; }
  };
});
