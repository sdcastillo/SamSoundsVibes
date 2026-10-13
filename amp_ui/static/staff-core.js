/* Staff Lab: notes, notation, guitar positions, lessons, scoring, and pitch detection.
   Safe to load from a script tag (window.StaffCore) or from Node (module.exports). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.StaffCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  /* Standard tuning, low to high. */
  var STRINGS = [
    { number: 6, label: "low E", short: "E", midi: 40 },
    { number: 5, label: "A", short: "A", midi: 45 },
    { number: 4, label: "D", short: "D", midi: 50 },
    { number: 3, label: "G", short: "G", midi: 55 },
    { number: 2, label: "B", short: "B", midi: 59 },
    { number: 1, label: "high e", short: "e", midi: 64 },
  ];
  var MAX_FRET = 12;

  var NOTATIONS = {
    guitar: {
      id: "guitar",
      label: "Guitar staff (treble, sounds an octave lower)",
      transpose: 12,
      lines: [2, 4, 6, 8, 10],
      minStep: -7,
      maxStep: 19,
    },
    concert: {
      id: "concert",
      label: "Grand staff (sounding pitch)",
      transpose: 0,
      lines: [-10, -8, -6, -4, -2, 2, 4, 6, 8, 10],
      minStep: -14,
      maxStep: 16,
    },
  };

  function makeNote(letter, accidental, octave) {
    var midi = (octave + 1) * 12 + LETTER_PC[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
    return { letter: letter, accidental: accidental, octave: octave, midi: midi };
  }

  function parseNote(text) {
    var m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(String(text || "").trim());
    if (!m) throw new Error("Bad note: " + text);
    return makeNote(m[1].toUpperCase(), m[2] || "", parseInt(m[3], 10));
  }

  function noteFromMidi(midi, preferFlat) {
    midi = Math.round(Number(midi));
    var name = (preferFlat ? FLAT_NAMES : SHARP_NAMES)[((midi % 12) + 12) % 12];
    var letter = name.charAt(0);
    var accidental = name.slice(1);
    var octave = Math.floor(midi / 12) - 1;
    return { letter: letter, accidental: accidental, octave: octave, midi: midi };
  }

  function accidentalGlyph(acc) {
    return acc === "#" ? "\u266F" : acc === "b" ? "\u266D" : "";
  }

  function pitchClassName(note) {
    return note.letter + accidentalGlyph(note.accidental);
  }

  function noteName(note) {
    return pitchClassName(note) + String(note.octave);
  }

  function staffStep(note) {
    return (note.octave - 4) * 7 + LETTER_STEP[note.letter];
  }

  function notation(id) {
    return NOTATIONS[id] || NOTATIONS.guitar;
  }

  /* Guitar music is written an octave above how it sounds; the spelling stays the same. */
  function writtenNote(note, notationId) {
    var shift = notation(notationId).transpose / 12;
    return {
      letter: note.letter,
      accidental: note.accidental,
      octave: note.octave + shift,
      midi: note.midi + shift * 12,
    };
  }

  function ledgerSteps(step, notationId) {
    var out = [];
    var s;
    if (notation(notationId).id === "concert") {
      if (step === 0) out.push(0);
      if (step >= 12) for (s = 12; s <= step; s += 2) out.push(s);
      if (step <= -12) for (s = -12; s >= step; s -= 2) out.push(s);
      return out;
    }
    if (step <= 0) for (s = 0; s >= step; s -= 2) out.push(s);
    if (step >= 12) for (s = 12; s <= step; s += 2) out.push(s);
    return out;
  }

  function stemUp(step, notationId) {
    if (notation(notationId).id === "concert" && step < 0) return step < -6;
    return step < 6;
  }

  function fretPositions(midi, maxFret) {
    var limit = maxFret == null ? MAX_FRET : maxFret;
    var out = [];
    STRINGS.forEach(function (s) {
      var fret = midi - s.midi;
      if (fret >= 0 && fret <= limit) out.push({ string: s.number, label: s.label, fret: fret });
    });
    out.sort(function (a, b) {
      return a.fret - b.fret || b.string - a.string;
    });
    return out;
  }

  function ordinal(n) {
    var tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return n + tail;
  }

  function describePosition(pos) {
    var s = STRINGS[6 - pos.string];
    if (pos.fret === 0) return "open " + s.label + " string";
    return s.label + " string (" + ordinal(pos.string) + "), fret " + pos.fret;
  }

  function naturalsBetween(lowMidi, highMidi) {
    var out = [];
    for (var m = lowMidi; m <= highMidi; m++) {
      var n = noteFromMidi(m, false);
      if (!n.accidental) out.push(noteName(n).replace(/\u266F|\u266D/g, ""));
    }
    return out;
  }

  function chromaticBetween(lowMidi, highMidi) {
    var out = [];
    for (var m = lowMidi; m <= highMidi; m++) {
      var sharp = noteFromMidi(m, false);
      out.push(sharp.letter + sharp.accidental + sharp.octave);
      if (sharp.accidental) {
        var flat = noteFromMidi(m, true);
        out.push(flat.letter + flat.accidental + flat.octave);
      }
    }
    return out;
  }

  /* Levels are listed by sounding pitch. */
  var LEVELS = [
    {
      id: "open",
      title: "1 · Open strings",
      notes: ["E2", "A2", "D3", "G3", "B3", "E4"],
      tip: "Eddie Ate Dynamite, Good Bye Eddie: the six open strings from low to high. No fretting needed.",
    },
    {
      id: "low",
      title: "2 · Low strings, first position",
      notes: naturalsBetween(40, 53),
      tip: "Notes below the staff use ledger lines. Low E (open 6th string) hangs under three of them.",
    },
    {
      id: "high",
      title: "3 · High strings, first position",
      notes: naturalsBetween(55, 67),
      tip: "Lines of the treble staff: Every Good Boy Does Fine. Spaces spell F-A-C-E.",
    },
    {
      id: "first",
      title: "4 · All naturals, first position",
      notes: naturalsBetween(40, 67),
      tip: "First position: index finger plays fret 1, middle fret 2, ring fret 3. Open strings fill the gaps.",
    },
    {
      id: "accidentals",
      title: "5 · Sharps and flats",
      notes: chromaticBetween(40, 68),
      tip: "A sharp raises a note one fret. A flat lowers it one fret. F\u266F and G\u266D are the same fret.",
    },
    {
      id: "neck",
      title: "6 · Up the neck (frets 5\u201312)",
      notes: naturalsBetween(45, 76),
      tip: "Fret 12 is the open string an octave up. Above the top line (F), each ledger line adds a third: A, C, E.",
    },
  ];

  function upAndDown(names) {
    return names.concat(names.slice(0, -1).reverse());
  }

  var SCALES = [
    {
      id: "c-major",
      title: "C major, first position",
      notes: upAndDown(["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4"]),
      tip: "Start on the A string, 3rd fret. Whole, whole, half, whole, whole, whole, half.",
    },
    {
      id: "g-major",
      title: "G major, first position",
      notes: upAndDown(["G2", "A2", "B2", "C3", "D3", "E3", "F#3", "G3"]),
      tip: "One sharp: F\u266F. Play it on the D string, 4th fret.",
    },
    {
      id: "d-major",
      title: "D major, open position",
      notes: upAndDown(["D3", "E3", "F#3", "G3", "A3", "B3", "C#4", "D4"]),
      tip: "Two sharps: F\u266F and C\u266F. Starts on the open D string.",
    },
    {
      id: "e-minor-pent",
      title: "E minor pentatonic, open",
      notes: upAndDown(["E2", "G2", "A2", "B2", "D3", "E3", "G3", "A3", "B3", "D4", "E4", "G4"]),
      tip: "Two notes per string, open strings and frets 2\u20133. The rock and blues workhorse.",
    },
    {
      id: "a-minor-pent",
      title: "A minor pentatonic, box 1 (5th fret)",
      notes: upAndDown(["A2", "C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4", "C5"]),
      frets: [5, 8],
      tip: "Index finger on fret 5, ring or pinky on frets 7\u20138. Same box as the Practice tab.",
    },
    {
      id: "spider",
      title: "Chromatic spider walk",
      notes: upAndDown(["E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2", "C3", "C#3", "D3"]),
      tip: "One finger per fret. Every step is one half step, so every note moves up the staff or gains a \u266F.",
    },
  ];

  /* Melodies in written guitar pitch, as a method book prints them; they sound an octave lower.
     Token: note + optional duration (w, h., h, q., q, e). Default is a quarter note. */
  var SONGS = [
    {
      id: "mary",
      title: "Mary Had a Little Lamb",
      by: "Traditional",
      meter: [4, 4],
      bpm: 100,
      written:
        "E4 D4 C4 D4 E4 E4 E4h D4 D4 D4h E4 G4 G4h E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4w",
      tip: "Three notes on the bottom of the staff: E (D string, 2nd fret), D (open D), C (A string, 3rd fret).",
    },
    {
      id: "twinkle",
      title: "Twinkle, Twinkle, Little Star",
      by: "Traditional",
      meter: [4, 4],
      bpm: 100,
      written:
        "C4 C4 G4 G4 A4 A4 G4h F4 F4 E4 E4 D4 D4 C4h G4 G4 F4 F4 E4 E4 D4h G4 G4 F4 F4 E4 E4 D4h C4 C4 G4 G4 A4 A4 G4h F4 F4 E4 E4 D4 D4 C4h",
      tip: "Written C below the staff is your A string, 3rd fret. Hollow noteheads are half notes: two beats.",
    },
    {
      id: "ode",
      title: "Ode to Joy",
      by: "Beethoven",
      meter: [4, 4],
      bpm: 96,
      written:
        "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4q. D4e D4h E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4q. C4e C4h",
      tip: "The dot adds half the note's value: a dotted quarter lasts a beat and a half.",
    },
    {
      id: "frere",
      title: "Fr\u00E8re Jacques",
      by: "Traditional",
      meter: [4, 4],
      bpm: 100,
      written:
        "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4h E4 F4 G4h G4e A4e G4e F4e E4 C4 G4e A4e G4e F4e E4 C4 C4 G3 C4h C4 G3 C4h",
      tip: "Eighth notes have a flag and take half a beat. Written G3 is your low E string, 3rd fret.",
    },
    {
      id: "aucl",
      title: "Au clair de la lune",
      by: "Traditional",
      meter: [4, 4],
      bpm: 92,
      written:
        "C4 C4 C4 D4 E4h D4h C4 E4 D4 D4 C4w C4 C4 C4 D4 E4h D4h C4 E4 D4 D4 C4w D4 D4 D4 D4 A3h A3h D4 C4 B3 A3 G3w C4 C4 C4 D4 E4h D4h C4 E4 D4 D4 C4w",
      tip: "The third line dips below the staff: written A3 is the open A string; G3 is the low E string, 3rd fret.",
    },
    {
      id: "jingle",
      title: "Jingle Bells (chorus)",
      by: "J. Pierpont",
      meter: [4, 4],
      bpm: 112,
      written:
        "E4 E4 E4h E4 E4 E4h E4 G4 C4q. D4e E4w F4 F4 F4q. F4e F4 E4 E4 E4e E4e E4 D4 D4 E4 D4h G4h E4 E4 E4h E4 E4 E4h E4 G4 C4q. D4e E4w F4 F4 F4 F4 F4 E4 E4 E4e E4e G4 G4 F4 D4 C4w",
      tip: "Watch the jump from G down to C: open G string, then A string 3rd fret.",
    },
    {
      id: "birthday",
      title: "Happy Birthday",
      by: "Hill sisters",
      meter: [3, 4],
      pickup: 1,
      bpm: 100,
      written: "G3e G3e A3 G3 C4 B3h G3e G3e A3 G3 D4 C4h G3e G3e G4 E4 C4 B3 A3h F4e F4e E4 C4 D4 C4h",
      tip: "3/4 time: three beats per bar. It starts on a one-beat pickup before the first bar line.",
    },
  ];

  var DUR_BEATS = { w: 4, "h.": 3, h: 2, "q.": 1.5, q: 1, "e.": 0.75, e: 0.5, s: 0.25 };
  var DUR_PATTERN = "(w|h\\.|h|q\\.|q|e\\.|e|s)";

  function parseToken(token) {
    var m = new RegExp("^([A-G])(#|b)?(\\d)" + DUR_PATTERN + "?$").exec(token);
    if (!m) throw new Error("Bad song token: " + token);
    var dur = m[4] || "q";
    var written = makeNote(m[1], m[2] || "", parseInt(m[3], 10));
    return {
      note: makeNote(written.letter, written.accidental, written.octave - 1),
      dur: dur,
      beats: DUR_BEATS[dur],
    };
  }

  function parseSong(song) {
    var perBar = song.meter[0] * (4 / song.meter[1]);
    var pos = song.pickup ? perBar - song.pickup : 0;
    var bar = 0;
    var notes = String(song.written)
      .split(/\s+/)
      .filter(Boolean)
      .map(function (token) {
        var item = parseToken(token);
        if (pos >= perBar - 1e-9) {
          bar += 1;
          pos = 0;
        }
        item.bar = bar;
        item.pos = pos;
        item.beat = bar * perBar + pos;
        item.midi = item.note.midi;
        pos += item.beats;
        return item;
      });
    return {
      id: song.id,
      title: song.title,
      notes: notes,
      bars: bar + 1,
      perBar: perBar,
      meter: song.meter.slice(),
      bpm: song.bpm,
    };
  }

  function scaleNotes(scale) {
    return scale.notes.map(function (name, i) {
      var note = parseNote(name);
      return { note: note, midi: note.midi, dur: "q", beats: 1, bar: Math.floor(i / 4), pos: i % 4, beat: i };
    });
  }

  /* Tab tokens: string letter (high e lowercase) + fret + optional duration, or r + duration
     for a rest. "|" is a bar line. Returns notes with sounding pitch and timing in beats. */
  var TAB_STRING = { e: 1, B: 2, G: 3, D: 4, A: 5, E: 6 };

  function parseTab(tab, perBar) {
    perBar = perBar || 4;
    var notes = [];
    var barSums = [0];
    var bar = 0;
    var tokenRe = new RegExp("^(?:([eBGDAE])(\\d{1,2})|r)" + DUR_PATTERN + "?$");
    String(tab || "")
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (token) {
        if (token === "|") {
          bar += 1;
          barSums.push(0);
          return;
        }
        var m = tokenRe.exec(token);
        if (!m) throw new Error("Bad tab token: " + token);
        var dur = m[3] || "q";
        var item = { dur: dur, beats: DUR_BEATS[dur], bar: bar, pos: barSums[bar] };
        item.beat = bar * perBar + item.pos;
        if (m[1]) {
          item.string = TAB_STRING[m[1]];
          item.fret = parseInt(m[2], 10);
          item.midi = STRINGS[6 - item.string].midi + item.fret;
          item.note = noteFromMidi(item.midi, false);
        } else {
          item.rest = true;
        }
        barSums[bar] += item.beats;
        notes.push(item);
      });
    return { notes: notes, bars: bar + 1, perBar: perBar, barSums: barSums };
  }

  /* Picks a string and fret for each note: stay near the hinted frets and move the hand as
     little as possible. Open strings are free to reach from anywhere. */
  function assignFrets(notes, hint) {
    var lo = hint && hint[0] != null ? hint[0] : 0;
    var hi = hint && hint[1] != null ? hint[1] : 4;
    var steps = [];
    notes.forEach(function (n, i) {
      if (n.rest || !(n.midi > 0)) return;
      var options = fretPositions(n.midi, 15);
      if (!options.length) options = [{ string: n.midi < 40 ? 6 : 1, fret: 0, outside: true }];
      steps.push({ index: i, options: options });
    });
    function place(p) {
      if (p.fret === 0) return lo <= 2 ? 0 : 4;
      return p.fret < lo ? (lo - p.fret) * 2 : p.fret > hi ? (p.fret - hi) * 2 : 0;
    }
    function move(a, b) {
      var frets = a.fret === 0 || b.fret === 0 ? 0.5 : Math.abs(a.fret - b.fret);
      return frets + 0.15 * Math.abs(a.string - b.string);
    }
    var prev = null;
    steps.forEach(function (step) {
      step.cost = step.options.map(function (opt, k) {
        var base = place(opt);
        if (!prev) return { total: base, from: -1 };
        var best = { total: Infinity, from: -1 };
        prev.options.forEach(function (popt, j) {
          var total = prev.cost[j].total + move(popt, opt) + base;
          if (total < best.total) best = { total: total, from: j };
        });
        return best;
      });
      prev = step;
    });
    var out = notes.map(function () {
      return null;
    });
    if (!steps.length) return out;
    var last = steps[steps.length - 1];
    var pick = 0;
    last.cost.forEach(function (c, k) {
      if (c.total < last.cost[pick].total) pick = k;
    });
    for (var s = steps.length - 1; s >= 0; s--) {
      var opt = steps[s].options[pick];
      out[steps[s].index] = { string: opt.string, fret: opt.fret };
      pick = steps[s].cost[pick].from;
    }
    return out;
  }

  /* Meters for the metronome. accents: 2 = downbeat, 1 = secondary pulse, 0 = plain click.
     unit is the note value that gets the click (4 = quarter, 8 = eighth). */
  var METERS = [
    { id: "2/4", beats: 2, unit: 4, accents: [2, 0] },
    { id: "3/4", beats: 3, unit: 4, accents: [2, 0, 0] },
    { id: "4/4", beats: 4, unit: 4, accents: [2, 0, 1, 0] },
    { id: "6/8", beats: 6, unit: 8, accents: [2, 0, 0, 1, 0, 0] },
  ];

  /* Scores notes played against a clock. Times are seconds; a note is due at beat * secPerBeat.
     A pluck counts if it lands from `early` before to `late` after the note and matches its
     pitch (any octave when anyOctave). Each note can be hit once. */
  function createTimedJudge(notes, opts) {
    opts = opts || {};
    var secPerBeat = opts.secPerBeat || 0.5;
    var early = opts.early == null ? 0.2 : opts.early;
    var late = opts.late == null ? 0.3 : opts.late;
    var anyOctave = !!opts.anyOctave;
    var playable = [];
    notes.forEach(function (n, i) {
      if (!n.rest && n.midi > 0) playable.push(i);
    });
    var result = {};
    var counts;
    function reset() {
      result = {};
      counts = { hits: 0, misses: 0, strays: 0, total: playable.length, octave: 0 };
    }
    reset();
    function due(i) {
      return notes[i].beat * secPerBeat;
    }
    return {
      onset: function (midi, t) {
        var best = null;
        var near = null;
        playable.forEach(function (i) {
          if (result[i]) return;
          var off = t - due(i);
          if (off < -early || off > late) return;
          if (!near || Math.abs(off) < Math.abs(near.offset)) near = { index: i, offset: off };
          if (!matches(notes[i].midi, midi, anyOctave)) return;
          if (!best || Math.abs(off) < Math.abs(best.offset)) best = { index: i, offset: off };
        });
        if (best) {
          result[best.index] = "hit";
          counts.hits += 1;
          if (notes[best.index].midi !== midi) counts.octave += 1;
          return { type: "hit", index: best.index, offset: best.offset, octave: notes[best.index].midi !== midi };
        }
        counts.strays += 1;
        return { type: "stray", index: near ? near.index : -1, offset: near ? near.offset : 0 };
      },
      sweep: function (t) {
        var missed = [];
        playable.forEach(function (i) {
          if (!result[i] && t - due(i) > late) {
            result[i] = "miss";
            counts.misses += 1;
            missed.push(i);
          }
        });
        return missed;
      },
      at: function (t) {
        var beat = t / secPerBeat;
        for (var i = 0; i < notes.length; i++) {
          if (beat >= notes[i].beat - 1e-9 && beat < notes[i].beat + notes[i].beats - 1e-9) return i;
        }
        return -1;
      },
      next: function (t) {
        for (var k = 0; k < playable.length; k++) {
          var i = playable[k];
          if (!result[i] && t - due(i) <= late) return i;
        }
        return -1;
      },
      status: function (i) {
        return result[i] || "";
      },
      stats: function () {
        return {
          hits: counts.hits,
          misses: counts.misses,
          strays: counts.strays,
          total: counts.total,
          octave: counts.octave,
          accuracy: counts.hits + counts.misses ? counts.hits / (counts.hits + counts.misses) : 0,
        };
      },
      reset: reset,
    };
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  function matches(targetMidi, playedMidi, anyOctave) {
    if (anyOctave) return ((targetMidi - playedMidi) % 12 + 12) % 12 === 0;
    return targetMidi === playedMidi;
  }

  function missHint(targetMidi, playedMidi) {
    var diff = targetMidi - playedMidi;
    if (diff === 0) return "";
    if (diff % 12 === 0) {
      var octaves = Math.abs(diff / 12);
      return "Right letter, wrong octave \u2014 go " + (diff > 0 ? "up" : "down") + " " + (octaves === 1 ? "an octave" : octaves + " octaves") + ".";
    }
    var n = Math.abs(diff);
    var size = n === 1 ? "one fret (a half step)" : n === 2 ? "two frets (a whole step)" : n + " frets";
    return "Go " + (diff > 0 ? "higher" : "lower") + " by " + size + ".";
  }

  function multiplier(streak) {
    return streak >= 10 ? 3 : streak >= 5 ? 2 : 1;
  }

  /* streak is the count including this hit. */
  function hitPoints(streak, cents) {
    var bonus = Math.abs(Number(cents) || 0) <= 10 ? 5 : 0;
    return { base: 10 * multiplier(streak), bonus: bonus, total: 10 * multiplier(streak) + bonus };
  }

  function stars(misses, total) {
    if (misses <= 0) return 3;
    if (misses <= Math.max(1, Math.round(total * 0.1))) return 2;
    return 1;
  }

  function noteKey(note) {
    return note.letter + note.accidental + note.octave;
  }

  /* Notes you miss more come up more often; never the same note twice in a row. */
  function pickTarget(names, stats, previousKey, rand) {
    rand = rand || Math.random;
    var pool = names.filter(function (n) {
      return n !== previousKey;
    });
    if (!pool.length) pool = names.slice();
    var weights = pool.map(function (n) {
      var st = (stats && stats[String(parseNote(n).midi)]) || { hits: 0, misses: 0 };
      var tries = st.hits + st.misses;
      return 1 + (tries ? (3 * st.misses) / tries : 0.5);
    });
    var total = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var r = rand() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return parseNote(pool[i]);
    }
    return parseNote(pool[pool.length - 1]);
  }

  function weakestNotes(stats, count) {
    return Object.keys(stats || {})
      .map(function (key) {
        var st = stats[key];
        var tries = st.hits + st.misses;
        return { midi: Number(key), tries: tries, rate: tries ? st.misses / tries : 0 };
      })
      .filter(function (row) {
        return row.tries >= 3 && row.rate > 0;
      })
      .sort(function (a, b) {
        return b.rate - a.rate || b.tries - a.tries;
      })
      .slice(0, count || 5);
  }

  /* Turns a stream of tuner frames into note events: one per pluck. A held note fires once;
     the same note fires again after silence or a fresh pick attack. */
  function createOnsetDetector(opts) {
    opts = opts || {};
    var stableMs = opts.stableMs == null ? 110 : opts.stableMs;
    var jump = opts.levelJump || 1.7;
    var minLevel = opts.minLevel == null ? 0.03 : opts.minLevel;
    var candidate = null;
    var since = 0;
    var last = null;
    var armed = true;
    var lastLevel = 0;
    return {
      push: function (frame, now) {
        var level = Number(frame && frame.level) || 0;
        if (!frame || !frame.active || !(Number(frame.midi) > 0)) {
          candidate = null;
          armed = true;
          lastLevel = level;
          return null;
        }
        var midi = Math.round(Number(frame.midi));
        if (lastLevel > 0 && level >= minLevel && level > lastLevel * jump) {
          armed = true;
          candidate = null;
        }
        lastLevel = level;
        if (candidate !== midi) {
          candidate = midi;
          since = now;
        }
        if (now - since < stableMs) return null;
        if (midi === last && !armed) return null;
        last = midi;
        armed = false;
        return {
          midi: midi,
          cents: Number(frame.cents) || 0,
          hz: Number(frame.hz) || 0,
          at: since,
        };
      },
      reset: function () {
        candidate = null;
        last = null;
        armed = true;
        lastLevel = 0;
      },
    };
  }

  function rms(buf) {
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / Math.max(1, buf.length));
  }

  /* McLeod pitch method, same thresholds as estimate_pitch() in guitar_amp_engine.py. */
  function detectPitch(buf, rate) {
    var n = buf.length;
    if (n < 512) return null;
    var mean = 0;
    var i;
    for (i = 0; i < n; i++) mean += buf[i];
    mean /= n;
    var x = new Float64Array(n);
    var energy = 0;
    for (i = 0; i < n; i++) {
      x[i] = buf[i] - mean;
      energy += x[i] * x[i];
    }
    var level = Math.sqrt(energy / n);
    if (level < 0.008) return null;
    for (i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    var minLag = Math.max(2, Math.floor(rate / 1100));
    var maxLag = Math.min(n - 2, Math.floor(rate / 70));
    if (maxLag <= minLag + 2) return null;
    var nsdf = new Float64Array(maxLag + 2);
    for (var lag = 0; lag <= maxLag + 1; lag++) {
      var acf = 0;
      var m = 0;
      for (i = 0; i + lag < n; i++) {
        acf += x[i] * x[i + lag];
        m += x[i] * x[i] + x[i + lag] * x[i + lag];
      }
      nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
    }
    var peaks = [];
    var best = 0;
    for (lag = minLag + 1; lag < maxLag; lag++) {
      var h = nsdf[lag];
      if (h >= 0.45 && h >= nsdf[lag - 1] && h > nsdf[lag + 1]) {
        peaks.push(lag);
        if (h > best) best = h;
      }
    }
    if (!peaks.length || best < 0.55) return null;
    var chosen = peaks[0];
    for (i = 0; i < peaks.length; i++) {
      if (nsdf[peaks[i]] >= best * 0.9) {
        chosen = peaks[i];
        break;
      }
    }
    var c = nsdf[chosen];
    var l = nsdf[chosen - 1];
    var r = nsdf[chosen + 1];
    var denom = l - 2 * c + r;
    var shift = Math.abs(denom) < 1e-9 ? 0 : (0.5 * (l - r)) / denom;
    if (shift < -0.5 || shift > 0.5) shift = 0;
    var hz = rate / (chosen + shift);
    var midiFloat = 69 + 12 * Math.log2(hz / 440);
    var midi = Math.round(midiFloat);
    var note = noteFromMidi(midi, false);
    return {
      active: true,
      hz: hz,
      midi: midi,
      cents: (midiFloat - midi) * 100,
      clarity: best,
      level: level,
      note: note.letter + note.accidental,
      octave: note.octave,
    };
  }

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  var TROPHIES = [
    { id: "first", title: "First note", how: "Play any lesson note correctly." },
    { id: "streak10", title: "On fire", how: "Streak of 10 in Note Quest." },
    { id: "streak25", title: "Unstoppable", how: "Streak of 25 in Note Quest." },
    { id: "intune10", title: "Sweet spot", how: "10 notes in a row within 10 cents." },
    { id: "speed150", title: "Speed reader", how: "Score 150+ in a 60-second challenge." },
    { id: "sharp20", title: "Sharp eye", how: "20 correct notes in the Sharps and flats level." },
    { id: "cleanclimb", title: "Clean climb", how: "Three stars on any scale." },
    { id: "firstsong", title: "First song", how: "Finish any song." },
    { id: "songbook", title: "Songbook", how: "Finish every song." },
    { id: "intime", title: "In the pocket", how: "Finish a song in time with the click." },
    { id: "riff90", title: "Locked to the band", how: "Score 90% or more on a riff or lead pass with a backing track." },
  ];

  return {
    STRINGS: STRINGS,
    MAX_FRET: MAX_FRET,
    NOTATIONS: NOTATIONS,
    LEVELS: LEVELS,
    SCALES: SCALES,
    SONGS: SONGS,
    TROPHIES: TROPHIES,
    DUR_BEATS: DUR_BEATS,
    parseNote: parseNote,
    noteFromMidi: noteFromMidi,
    noteName: noteName,
    noteKey: noteKey,
    pitchClassName: pitchClassName,
    accidentalGlyph: accidentalGlyph,
    staffStep: staffStep,
    notation: notation,
    writtenNote: writtenNote,
    ledgerSteps: ledgerSteps,
    stemUp: stemUp,
    fretPositions: fretPositions,
    describePosition: describePosition,
    ordinal: ordinal,
    parseSong: parseSong,
    scaleNotes: scaleNotes,
    parseTab: parseTab,
    assignFrets: assignFrets,
    METERS: METERS,
    createTimedJudge: createTimedJudge,
    findById: findById,
    matches: matches,
    missHint: missHint,
    multiplier: multiplier,
    hitPoints: hitPoints,
    stars: stars,
    pickTarget: pickTarget,
    weakestNotes: weakestNotes,
    createOnsetDetector: createOnsetDetector,
    detectPitch: detectPitch,
    rms: rms,
    midiToHz: midiToHz,
  };
});
