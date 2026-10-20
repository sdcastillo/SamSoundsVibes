/* Sam's Neo-Classical — harmonic minor themes + high-gain lead (Song Studio). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SamSongData = root.SamSongData || {};
    root.SamSongData["sams-neo-classical"] = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {
    id: "sams-neo-classical",
    title: "Sam's Neo-Classical",
    songType: "neo-classical",
    subtitle: "A Harmonic Minor — classical arpeggios & high-gain shred lead",
    key: "A harmonic minor",
    bpm: 120,
    meter: [4, 4],
    bars: 12,
    chords: [
      "Am", "C", "Dm", "E",
      "Am", "F", "E", "Am",
      "F", "Dm", "E", "Am"
    ],
    sections: [
      {
        id: "all",
        label: "Full Song (Bars 1–12)",
        shortLabel: "Full Song (1–12)",
        startBar: 0,
        endBar: 12,
        drumPattern: "theme",
        description: "Complete neo-classical piece: Theme → Variation → Lead Solo."
      },
      {
        id: "theme",
        label: "1 · Theme: Harmonic Minor Statement (Bars 1–4)",
        shortLabel: "Theme (1–4)",
        startBar: 0,
        endBar: 4,
        drumPattern: "theme",
        description: "Classical picking on Am–C–Dm–E with raised 7th (G#) in the lead hook."
      },
      {
        id: "variation",
        label: "2 · Variation: Arpeggio Cascade (Bars 5–8)",
        shortLabel: "Variation (5–8)",
        startBar: 4,
        endBar: 8,
        drumPattern: "variation",
        description: "Wider intervallic arpeggios and syncopated rhythm stabs."
      },
      {
        id: "solo",
        label: "3 · Solo: High-Gain Lead (Bars 9–12)",
        shortLabel: "Solo (9–12)",
        startBar: 8,
        endBar: 12,
        drumPattern: "solo",
        description: "Melodic minor shred with bends, slides, and 16th-note bursts."
      }
    ],

    parts: {
      rhythm: {
        id: "rhythm",
        number: "1",
        title: "1) Rhythm Guitar",
        subtitle: "Classical-style arpeggios & power-chord accents",
        octaveDown: false,
        tone: {
          slot: 18,
          name: "Revv Gen Red",
          irWanted: "Mesa_4x12_V30.wav",
          overrides: {
            drive: 18.0,
            bass: 0.54,
            mid: 0.60,
            treble: 0.62,
            presence: 0.58,
            mix: 0.08,
            volume: 0.62,
            octave_down: 0.0
          }
        },
        tip: "Alternate-pick the arpeggio figures in Bars 1–4; dig into the E-major (V) bar with a slight accent.",
        tab: [
          "A0e E1e A2e E3e E2e A2e D2e E0e",
          "A0e D2e E2e A2e D2e E2e A2e E0e",
          "A0e D2e D3e A2e E2e A2e D2e E0e",
          "E0e E4e B1e E2e E0e E1e A0e E0e",
          "A0e A3e A5e D2e A2e E2e A2e E0e",
          "A0e E1e E4e B1e E2e B1e E4e E0e",
          "A0e E1e A1e D2e A2e E2e A2e E0e",
          "A0q E0q A0q E0q",
          "A0e E1e A2e G2e E2e G2e A2e E0e",
          "A0e D2e D3e A2e E2e A2e D2e E0e",
          "A0e E1e E4e B1e E2e B1e E4e E0e",
          "A0q E0q A0q E0q"
        ].join(" | ")
      },

      lead: {
        id: "lead",
        number: "2",
        title: "2) Lead Guitar + Solo",
        subtitle: "Harmonic-minor melody, bends & slides (Bars 9–12 shred)",
        octaveDown: false,
        tone: {
          slot: 7,
          name: "MK IV lead 2",
          irWanted: "Mesa_4x12_V30.wav",
          overrides: {
            drive: 28.0,
            bass: 0.50,
            mid: 0.70,
            treble: 0.74,
            presence: 0.68,
            delay_ms: 280,
            feedback: 0.30,
            mix: 0.22,
            volume: 0.74,
            octave_down: 0.0
          }
        },
        tip: "Bars 1–8 sing the theme an octave up; Bars 9–12 use bN and sN techniques for neo-classical voice-leading.",
        tab: [
          "e8e G9e A10e B10e B10e A10e G9e e8e",
          "B8e B10e D11e e12e e12e D11e B10e B8e",
          "G9e A10e B11e e12e e12e B11e A10e G9e",
          "e12b14s12e e13e e12e B10e B10e e8e e8e e8e",
          "B10e B12e D13e e14e e14e D13e B12e B10e",
          "G11e A12e B13e e15e e15e B13e A12e G11e",
          "e14b16s14e B15e G14e e12e e12e G14e B15e e14e",
          "e12q B10q e8q B8q",
          "G9s11e G12e B12b15e e15e e17e e15e e12e e12e",
          "e17e e16e e14e B15e B13e B12e G14e G12e",
          "B12s13e B15e e12e e14b16e e15e e14e e12e B15e",
          "e15b17s17e e17e e15e e13e e13e e12e e12e e12e"
        ].join(" | ")
      },

      bass: {
        id: "bass",
        number: "3",
        title: "3) Bass Part (-1 Oct Guitar)",
        subtitle: "Root-focused classical line on E/A/D strings",
        octaveDown: true,
        tone: {
          slot: 50,
          name: "BAS:SVT Nrm",
          irWanted: "Ampeg_8x10_SVT.wav",
          overrides: {
            drive: 10.0,
            bass: 0.76,
            mid: 0.56,
            treble: 0.40,
            presence: 0.36,
            mix: 0.0,
            volume: 0.76,
            low_cut: 35.0,
            high_cut: 4200.0,
            octave_down: 1.0
          }
        },
        tip: "Down-Octave ON — follow the roots A–C–D–E through the harmonic minor cadences.",
        tab: [
          "A0e A0e E1e A0e E1e A0e E1e A0e",
          "A0e D2e D3e A0e E1e A0e E1e A0e",
          "A0e E1e E4e A0e E1e A0e E1e A0e",
          "A0q E0q A0q E0q",
          "A0e A3e A5e A0e E1e A0e E1e A0e",
          "A0e E1e E4e A0e E1e A0e E1e A0e",
          "A0e E1e A1e A0e E1e A0e E1e A0e",
          "A0q E0q A0q E0q",
          "A0e E1e A2e A0e E1e A0e E1e A0e",
          "A0e D2e D3e A0e E1e A0e E1e A0e",
          "A0e E1e E4e A0e E1e A0e E1e A0e",
          "A0q E0q A0q E0q"
        ].join(" | ")
      },

      drums: {
        id: "drums",
        number: "4",
        title: "4) Drum Machine",
        subtitle: "Light neo-classical kit (single kick, orchestral snare feel)",
        octaveDown: false,
        tone: null,
        tip: "Theme uses half-time kick; Variation adds 16th hats; Solo opens the ride.",
        tab: [
          "E0e D2e E0e D2e E0e D2e E0e D2e",
          "E0e D2e E0e D2e E0e D2e E0e D2e",
          "E0e D2e E0e D2e E0e D2e E0e D2e",
          "E0e D2e A3e A2e E0e D2e E0e D2e",
          "E0e E0e D2e E0e E0e D2e E0e E0e",
          "E0e E0e D2e E0e E0e D2e E0e E0e",
          "E0e E0e D2e E0e E0e D2e E0e E0e",
          "E0e D2e A3e A2e E0e D2e E0e D2e",
          "E0e D2e E0e D2e E0e D2e E0e D2e",
          "E0e D2e E0e D2e E0e D2e E0e D2e",
          "E0e D2e E0e D2e A3e A2e E0e D2e",
          "E0e D2e A3e A2e E0e D2e E0e D2e"
        ].join(" | ")
      },

      vocals: {
        id: "vocals",
        number: "5",
        title: "5) Vocal Guide (minimal)",
        subtitle: "Wordless melody — optional guide only",
        octaveDown: false,
        tone: {
          slot: 26,
          name: "Soldano Lead",
          overrides: {
            drive: 12.0,
            bass: 0.48,
            mid: 0.62,
            treble: 0.60,
            presence: 0.58,
            mix: 0.20,
            volume: 0.58,
            octave_down: 0.0
          }
        },
        tip: "Hum or lightly sing the guide; lyrics are optional syllables for timing only.",
        tab: [
          "e5e e5e e8e e10e e12e e10e e8e e5e",
          "B7e G7e e7e e7e G7e B7e e7e e7e",
          "e5e B7e e8e e8e B7e e5e e5e e5e",
          "e7q e7q e7q e7q",
          "G7e B7e e8e e8e B7e G7e e7e e7e",
          "B7e e5e e5e e5e e5e e5e B7e B7e",
          "G7e e5e e8e e8e e5e G7e G7e G7e",
          "e5q e5q e5q e5q",
          "e8e B7e G7e e7e e7e G7e B7e e8e",
          "B7e e5e e5e e5e e5e e5e B7e B7e",
          "G7e e5e e5e e5e e5e e5e G7e G7e",
          "e5q e5q e5q e5q"
        ].join(" | "),
        lyricsByBar: [
          ["Ah", "-", "mi-", "nor"],
          ["Theme", "in", "gold"],
          ["Har-", "mon-", "ic"],
          ["rise"],
          ["Va-", "ri-", "a-", "tion"],
          ["flows", "like", "silk"],
          ["Clas-", "si-", "cal"],
          ["fire"],
          ["Shred", "the", "night"],
          ["with", "steel"],
          ["Neo-", "clas-", "si-", "cal"],
          ["Sam!"]
        ],
        lyricSheet: [
          {
            section: "Theme (Bars 1–4)",
            chords: "Am · C · Dm · E",
            lines: [
              {
                words: "Ah-minor theme in gold — harmonic rise",
                notes: "A4 C5 E5 A5 · G4 F4 E4 · A4 B4 C5 · E5"
              }
            ]
          },
          {
            section: "Variation (Bars 5–8)",
            chords: "Am · F · E · Am",
            lines: [
              {
                words: "Variation flows like silk — classical fire",
                notes: "C5 D5 E5 · B4 A4 · G4 E4 C5 · A4"
              }
            ]
          },
          {
            section: "Solo (Bars 9–12)",
            chords: "Am · G · F · E",
            lines: [
              {
                words: "Shred the night with steel — Neo-classical Sam!",
                notes: "E5 D5 C5 · B4 A4 · G4 E4 · A4"
              }
            ]
          }
        ]
      }
    },

    drumPatterns: {
      theme: {
        name: "Theme: Classical March",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ride: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]
        }
      },
      variation: {
        name: "Variation: Arpeggio Pulse",
        rows: {
          crash: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          ride: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
          kick: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0]
        }
      },
      solo: {
        name: "Solo: Driving Ride",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
          ride: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1]
        }
      }
    },

    drumProgram: {
      engine: "sixteenth-synth",
      kitRows: ["crash", "ride", "hihat", "snare", "kick"],
      barPatternKeys: [
        "theme", "theme", "theme", "theme",
        "variation", "variation", "variation", "variation",
        "solo", "solo", "solo", "solo"
      ]
    }
  };
});
