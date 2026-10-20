/* Sunrise Redline — Song Studio data (A-minor melodic metal). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.SamSongData = root.SamSongData || {}; root.SamSongData["sunrise-redline"] = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {
    id: "sunrise-redline",
    title: "Sunrise Redline",
    songType: "melodic-metal",
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
        label: "3 · Chorus: Sunrise Redline (Bars 9–12)",
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
          irWanted: "Mesa_4x12_V30.wav",
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
          irWanted: "Mesa_4x12_V30.wav",
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
          irWanted: "Ampeg_8x10_SVT.wav",
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
            section: "Verse 1 (Bars 1–4)",
            chords: "E5 · G5 · A5 · B5",
            lines: [
              {
                words: "V-eights howl on crimson sand, salt spray flies past!",
                notes: "E4 E4 D4 G4 F#4 (E5) · G4 F#4 E4 D4 (G5)"
              },
              {
                words: "Chrome burns gold and red, sun sets a-head!",
                notes: "E4 G4 A4 B4 A4 (A5) · G4 F#4 E4 F#4 (B5)"
              }
            ]
          },
          {
            section: "Pre-Chorus (Bars 5–8)",
            chords: "C5 · D5 · Em · B5",
            lines: [
              {
                words: "Shift gears, feel the roar, turbos shake the shore",
                notes: "G4 G4 A4 G4 E4 (C5) · A4 A4 B4 A4 F#4 (D5)"
              },
              {
                words: "Headlights cut the foam — full speed for home!",
                notes: "B4 A4 G4 E4 D4 (Em) · F#4 G4 A4 B4 (B5)"
              }
            ]
          },
          {
            section: "Chorus (Bars 9–12)",
            chords: "Em · C · G · D",
            lines: [
              {
                words: "SUNRISE REDLINE roar! Flying down the shore!",
                notes: "E5 B4 A4 G4 E4 (Em) · G4 A4 G4 E4 D4 (C)"
              },
              {
                words: "Wheels ignite where breakers crash — outrun the night!",
                notes: "G4 A4 B4 D5 G4 (G) · A4 G4 F#4 E4 (D)"
              }
            ]
          },
          {
            section: "Guitar Solo & Outro — Twin Turbos in the Tide (Bars 13–16)",
            soloNote: "Lead guitar solo plays bars 13–16; the vocal line sits on top as a guide",
            chords: "Em · C · G · B5",
            lines: [
              {
                words: "Burn the horizon, chase the sinking sun",
                notes: "E5 B4 A4 G4 E4 (Em) · G4 A4 B4 D5 (C)"
              },
              {
                words: "Thunder in the tide — Redline sunset ride!",
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
        name: "Verse: Beach Gallop",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ride:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          kick:  [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1]
        }
      },
      prechorus: {
        name: "Pre-Chorus: Turbo Build",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
          ride:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
          kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1]
        }
      },
      chorus: {
        name: "Chorus: Half-Time Crash",
        rows: {
          crash: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          ride:  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
          hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
          kick:  [1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0]
        }
      },
      solo: {
        name: "Solo: Double-Kick Overdrive",
        rows: {
          crash: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
          ride:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          hihat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
          kick:  [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]
        }
      }
    },

    /* Full-song drum arrangement: 16th-note grids → WebAudio synth (playDrumHit → audio.master). No external drum files. */
    drumProgram: {
      engine: "sixteenth-synth",
      kitRows: ["crash", "ride", "hihat", "snare", "kick"],
      barPatternKeys: [
        "verse", "verse", "verse", "verse",
        "prechorus", "prechorus", "prechorus", "prechorus",
        "chorus", "chorus", "chorus", "chorus",
        "solo", "solo", "solo", "solo"
      ]
    }
  };
});
