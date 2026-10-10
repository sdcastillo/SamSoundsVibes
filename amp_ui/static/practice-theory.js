/* Practice-mode music theory.
   Safe to load from a script tag or from Node (module.exports). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PracticeTheory = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  var STRING_ORDER = ["e", "B", "G", "D", "A", "E"];
  var STRING_OPEN = { e: 64, B: 59, G: 55, D: 50, A: 45, E: 40 };
  var STRING_LABEL = {
    e: "high e",
    B: "B",
    G: "G",
    D: "D",
    A: "A",
    E: "low E",
  };

  /* Offsets from the tonic's fret on the low E string. */
  var MINOR_BOX_OFFSETS = [
    { box: 1, from: 0, to: 3 },
    { box: 2, from: 2, to: 5 },
    { box: 3, from: 4, to: 8 },
    { box: 4, from: 7, to: 10 },
    { box: 5, from: -3, to: 0 },
  ];
  var MAJOR_BOX_OFFSETS = [
    { box: 1, from: -1, to: 2 },
    { box: 2, from: 1, to: 5 },
    { box: 3, from: 4, to: 7 },
    { box: 4, from: 6, to: 9 },
    { box: 5, from: 11, to: 14 },
  ];

  var TONIC_SPELLING = {
    major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
    minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
    dorian: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
    mixolydian: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  };

  var QUALITIES = [
    ["maj7", [0, 4, 7, 11]],
    ["min7", [0, 3, 7, 10]],
    ["m7", [0, 3, 7, 10]],
    ["m9", [0, 3, 7, 10, 14]],
    ["sus4", [0, 5, 7]],
    ["dim", [0, 3, 6]],
    ["aug", [0, 4, 8]],
    ["maj", [0, 4, 7]],
    ["min", [0, 3, 7]],
    ["m", [0, 3, 7]],
    ["9", [0, 4, 7, 10, 14]],
    ["7", [0, 4, 7, 10]],
    ["5", [0, 7]],
    ["", [0, 4, 7]],
  ];

  function parseNote(name) {
    var match = /^([A-Ga-g])([#b]|♯|♭)?$/.exec(String(name || "").trim());
    if (!match) return null;
    var letter = match[1].toUpperCase();
    var accidental = match[2] || "";
    if (accidental === "♯") accidental = "#";
    if (accidental === "♭") accidental = "b";
    var pc = NATURAL[letter];
    if (accidental === "#") pc += 1;
    if (accidental === "b") pc -= 1;
    pc = (pc + 12) % 12;
    return { letter: letter, accidental: accidental, pc: pc, name: letter + accidental };
  }

  function normalizeMode(mode) {
    var value = String(mode || "").trim().toLowerCase();
    if (value === "major" || value === "ionian") return "major";
    if (value === "minor" || value === "aeolian" || value === "natural minor") return "minor";
    if (value === "dorian") return "dorian";
    if (value === "mixolydian") return "mixolydian";
    return "";
  }

  function assetBaseFromScript(resolvedSrc) {
    var abs = String(resolvedSrc || "").split("#")[0].split("?")[0];
    if (!/practice\.js$/.test(abs)) return "/static/";
    return abs.replace(/practice\.js$/, "");
  }

  function keyLabel(tonic, mode) {
    var normalized = normalizeMode(mode);
    if (normalized === "major") return tonic + " major";
    if (normalized === "minor") return tonic + " minor";
    if (normalized === "dorian") return tonic + " Dorian";
    if (normalized === "mixolydian") return tonic + " Mixolydian";
    return tonic + (mode ? " " + mode : "");
  }

  function letterOffset(interval, intervals) {
    var has = {};
    intervals.forEach(function (value) {
      has[value] = true;
    });
    if (interval === 6) {
      // Lydian has a major 3rd and a perfect 5th, so the tritone is a raised 4th.
      // A blues scale has a perfect 4th and a perfect 5th, so the tritone is a flat 5.
      if (has[4] && has[7] && !has[5]) return 3;
      if (has[7]) return 4;
      if (has[5]) return 3;
      return 4;
    }
    var map = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };
    return map[interval];
  }

  function spellNote(letterIndex, pc) {
    var natural = NATURAL[LETTERS[letterIndex]];
    var delta = (pc - natural + 12) % 12;
    if (delta > 6) delta -= 12;
    var suffix = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" }[String(delta)];
    if (suffix === undefined) return SHARP_NAMES[((pc % 12) + 12) % 12];
    return LETTERS[letterIndex] + suffix;
  }

  function spellScale(tonic, intervals) {
    var parsed = parseNote(tonic);
    if (!parsed) return [];
    var sorted = intervals.slice().sort(function (a, b) {
      return a - b;
    });
    var letterIndex = LETTERS.indexOf(parsed.letter);
    return sorted.map(function (interval) {
      var pc = (parsed.pc + interval) % 12;
      var offset = letterOffset(interval, sorted);
      var letter = (letterIndex + offset) % 7;
      return spellNote(letter, pc);
    });
  }

  function parseChord(symbol) {
    var match = /^([A-G](?:#|b)?)(.*)$/.exec(String(symbol || "").trim());
    if (!match || !parseNote(match[1])) return null;
    var quality = match[2].trim();
    var intervals = null;
    for (var i = 0; i < QUALITIES.length; i += 1) {
      if (QUALITIES[i][0] === quality) {
        intervals = QUALITIES[i][1].slice();
        break;
      }
    }
    if (!intervals) return null;
    var root = parseNote(match[1]);
    return { symbol: String(symbol).trim(), rootName: root.name, rootPc: root.pc, intervals: intervals };
  }

  function scalePitchClasses(scale) {
    var root = parseNote(scale.root);
    if (!root) return [];
    return scale.intervals.map(function (interval) {
      return (root.pc + interval) % 12;
    });
  }

  function spellPcInScale(scale, pc) {
    var root = parseNote(scale.root);
    if (!root) return SHARP_NAMES[pc];
    var interval = (pc - root.pc + 12) % 12;
    var spelled = spellScale(scale.root, scale.intervals);
    var sorted = scale.intervals.slice().sort(function (a, b) {
      return a - b;
    });
    var index = sorted.indexOf(interval);
    if (index >= 0) return spelled[index];
    return SHARP_NAMES[pc];
  }

  function analyzeChord(symbol, scale) {
    var chord = parseChord(symbol);
    if (!chord || !scale) return null;
    var tones = spellScale(chord.rootName, chord.intervals);
    var scalePcs = {};
    scalePitchClasses(scale).forEach(function (pc) {
      scalePcs[pc] = true;
    });
    var inScale = [];
    var missing = [];
    chord.intervals.forEach(function (interval, index) {
      var pc = (chord.rootPc + (interval % 12)) % 12;
      if (scalePcs[pc]) inScale.push(tones[index]);
      else missing.push(tones[index]);
    });
    return { symbol: chord.symbol, tones: tones, inScale: inScale, missing: missing, pcs: chord.intervals.map(function (interval) {
      return (chord.rootPc + (interval % 12)) % 12;
    }) };
  }

  function suggestScales(tonic, mode) {
    var parsed = parseNote(tonic);
    var normalized = normalizeMode(mode);
    if (!parsed || !normalized) return [];
    var name = parsed.name;
    function item(id, label, intervals, why) {
      return {
        id: id,
        name: label,
        root: name,
        intervals: intervals.slice(),
        notes: spellScale(name, intervals),
        why: why,
      };
    }
    if (normalized === "minor") {
      return [
        item("minor-pentatonic", name + " minor pentatonic", [0, 3, 5, 7, 10],
          "Five notes that sit on a minor chord. This is the default rock and blues shape: the 2nd and the 6th are left out, so you can play it through most minor changes."),
        item("blues", name + " blues", [0, 3, 5, 6, 7, 10],
          "Minor pentatonic plus the flat 5. Use that note as a short bend or a passing tone into the 5th. It is a color, not a note to sit on over a minor v chord."),
        item("natural-minor", name + " natural minor (Aeolian)", [0, 2, 3, 5, 7, 8, 10],
          "The full minor scale. The flat 6 matches a minor iv chord. Over a major V, that flat 6 is a flat 9, so aim it at the iv and the bVI."),
        item("dorian", name + " Dorian", [0, 2, 3, 5, 7, 9, 10],
          "Natural minor with a raised 6th. It fits when the IV chord is major. It clashes with a minor iv, because the raised 6th and that chord's flat 3rd are the same pitch class fighting each other."),
      ];
    }
    if (normalized === "major") {
      var relativePc = (parsed.pc + 9) % 12;
      var relative = TONIC_SPELLING.minor[relativePc];
      var relativeItem = {
        id: "relative-minor-pentatonic",
        name: relative + " minor pentatonic",
        root: relative,
        intervals: [0, 3, 5, 7, 10],
        notes: spellScale(relative, [0, 3, 5, 7, 10]),
        why: "The same five notes as " + name + " major pentatonic, with " + relative + " treated as the root. Starting phrases there is the usual rock lead sound. The chords are still in " + name + " major.",
      };
      return [
        item("major", name + " major", [0, 2, 4, 5, 7, 9, 11],
          "The key's own scale. Every diatonic chord in a I–V–vi–IV progression is built from these notes."),
        item("major-pentatonic", name + " major pentatonic", [0, 2, 4, 7, 9],
          "Major without the 4th and the 7th. It sounds open. Over the V chord the 4th of the key is a suspended 4th, so treat it as a passing tone if you want the 3rd of that chord."),
        relativeItem,
        item("mixolydian", name + " Mixolydian", [0, 2, 4, 5, 7, 9, 10],
          "Major with a flat 7. It fits when the I chord is dominant, or the progression uses a bVII. The flat 7 clashes with a major V chord, whose 3rd is the major 7 of the key."),
      ];
    }
    if (normalized === "dorian") {
      return [
        item("dorian", name + " Dorian", [0, 2, 3, 5, 7, 9, 10],
          "Minor with a natural 6. That 6th is the 3rd of the major IV chord, which is the Dorian sound. This is the home scale when the vamp moves from minor i to major IV."),
        item("minor-pentatonic", name + " minor pentatonic", [0, 3, 5, 7, 10],
          "Dorian with the 2nd and the 6th left out. It never fights the i or the IV. Use it when you want a funk box and do not want to place the 6th."),
        item("blues", name + " blues", [0, 3, 5, 6, 7, 10],
          "Minor pentatonic plus the flat 5. Grace it into the 5th. Holding it over the major IV makes a flat 9, which is an outside color."),
        item("natural-minor", name + " natural minor (Aeolian)", [0, 2, 3, 5, 7, 8, 10],
          "Dorian's darker neighbor: a flat 6 instead of the natural 6. The flat 6 fights the major IV chord. Use it on the minor bars, and leave it before the IV arrives."),
      ];
    }
    return [
      item("mixolydian", name + " Mixolydian", [0, 2, 4, 5, 7, 9, 10],
        "The home scale when the I chord is dominant: major 3rd, flat 7. The flat 7 is a chord tone of the I7."),
      item("major-pentatonic", name + " major pentatonic", [0, 2, 4, 7, 9],
        "Mixolydian without the 4th and the flat 7. Safe and open. Add the flat 7 back when you want the dominant color."),
      item("blues", name + " blues", [0, 3, 5, 6, 7, 10],
        "The minor-pentatonic blues sound over a dominant chord. The flat 3 and flat 7 are the vocal notes. The major 3rd of the chord is not in this scale; bend the flat 3 toward it if you want that friction."),
      item("major", name + " major", [0, 2, 4, 5, 7, 9, 11],
        "The natural 7 replaces Mixolydian's flat 7. Use it when the chord is major 7. Over a dominant 7th, that natural 7 clashes with the flat 7 in the chord."),
    ];
  }

  function lowERootFret(rootPc) {
    return (rootPc - 4 + 12) % 12;
  }

  function skeletonKind(intervals) {
    var has = {};
    intervals.forEach(function (interval) {
      has[interval] = true;
    });
    var minor = [0, 3, 5, 7, 10].every(function (interval) {
      return has[interval];
    });
    var major = [0, 2, 4, 7, 9].every(function (interval) {
      return has[interval];
    });
    if (minor) return "minor";
    if (major) return "major";
    return "generic";
  }

  function skeletonIntervals(kind) {
    if (kind === "minor") return [0, 3, 5, 7, 10];
    if (kind === "major") return [0, 2, 4, 7, 9];
    return null;
  }

  function resolveWindow(rootFret, from, to) {
    var start = rootFret + from;
    var end = rootFret + to;
    if (start < 0) {
      start += 12;
      end += 12;
    }
    return { start: start, end: end };
  }

  function boxesForScale(scale) {
    var root = parseNote(scale.root);
    if (!root) return [];
    var kind = skeletonKind(scale.intervals);
    var rootFret = lowERootFret(root.pc);
    var offsets = kind === "major" ? MAJOR_BOX_OFFSETS : kind === "minor" ? MINOR_BOX_OFFSETS : null;
    var boxes = [];
    if (!offsets) {
      for (var i = 0; i < 5; i += 1) {
        var start = rootFret + i * 3;
        boxes.push({ box: i + 1, start: start, end: start + 3, kind: "generic" });
      }
      return boxes;
    }
    offsets.forEach(function (offset) {
      var window = resolveWindow(rootFret, offset.from, offset.to);
      boxes.push({ box: offset.box, start: window.start, end: window.end, kind: kind });
    });
    return boxes;
  }

  function extraIntervals(scale) {
    var kind = skeletonKind(scale.intervals);
    var skeleton = skeletonIntervals(kind);
    if (!skeleton) return [];
    var skip = {};
    skeleton.forEach(function (interval) {
      skip[interval] = true;
    });
    return scale.intervals.filter(function (interval) {
      return !skip[interval];
    });
  }

  function notesOnFretboard(scale, fretStart, fretEnd) {
    var root = parseNote(scale.root);
    if (!root) return [];
    var pcs = {};
    scale.intervals.forEach(function (interval) {
      pcs[(root.pc + interval) % 12] = interval;
    });
    var extras = {};
    extraIntervals(scale).forEach(function (interval) {
      extras[interval] = true;
    });
    var start = fretStart === undefined ? 0 : fretStart;
    var end = fretEnd === undefined ? 17 : fretEnd;
    var notes = [];
    STRING_ORDER.forEach(function (stringName) {
      var open = STRING_OPEN[stringName];
      for (var fret = start; fret <= end; fret += 1) {
        var pc = (open + fret) % 12;
        if (pcs[pc] === undefined) continue;
        notes.push({
          string: stringName,
          fret: fret,
          pc: pc,
          interval: pcs[pc],
          root: pc === root.pc,
          extra: !!extras[pcs[pc]],
          name: spellPcInScale(scale, pc),
        });
      }
    });
    return notes;
  }

  function rootsInBox(scale, box) {
    return notesOnFretboard(scale, box.start, box.end).filter(function (note) {
      return note.root;
    });
  }

  function describeRoots(scale, box) {
    var roots = rootsInBox(scale, box);
    if (!roots.length) return "No root falls in these frets. Use the box to connect the ones beside it.";
    var parts = roots.map(function (note) {
      if (note.fret === 0) return STRING_LABEL[note.string] + " string open";
      return STRING_LABEL[note.string] + " string fret " + note.fret;
    });
    return "Roots: " + parts.join(", ") + ".";
  }

  function pitchClassAt(stringName, fret) {
    var open = STRING_OPEN[stringName];
    if (open === undefined) return null;
    return (open + fret) % 12;
  }

  function bendSentence(bend, scale) {
    if (!bend || pitchClassAt(bend.string, bend.fret) === null) return "";
    var fromPc = pitchClassAt(bend.string, bend.fret);
    var semis = Number(bend.semitones);
    var toPc = (fromPc + semis) % 12;
    var fromName = spellPcInScale(scale, fromPc);
    var toName = spellPcInScale(scale, toPc);
    var distance = semis === 2 ? "a whole step" : semis === 1 ? "a half step" : semis + " semitones";
    return "Bend the " + STRING_LABEL[bend.string] + " string at fret " + bend.fret + " (" + fromName + ") up " + distance + " to " + toName + ".";
  }

  function wholeStepBend(scale, box) {
    var notes = notesOnFretboard(scale, box.start, box.end);
    var byString = {};
    notes.forEach(function (note) {
      if (!byString[note.string]) byString[note.string] = [];
      byString[note.string].push(note);
    });
    var root = parseNote(scale.root);
    var best = null;
    STRING_ORDER.forEach(function (stringName) {
      (byString[stringName] || []).forEach(function (note) {
        var targetPc = (note.pc + 2) % 12;
        var targetInScale = scalePitchClasses(scale).indexOf(targetPc) >= 0;
        if (!targetInScale) return;
        if (note.fret < 1) return;
        var candidate = { string: stringName, fret: note.fret, semitones: 2, toRoot: targetPc === root.pc };
        if (!best || (candidate.toRoot && !best.toRoot) || (candidate.toRoot === best.toRoot && candidate.fret < best.fret)) {
          best = candidate;
        }
      });
    });
    return best;
  }

  function renderTab(notes) {
    var columns = notes.map(function (note) {
      return STRING_ORDER.map(function (stringName) {
        return stringName === note.string ? String(note.fret) : "";
      });
    });
    return STRING_ORDER.map(function (stringName, row) {
      var body = columns.map(function (column) {
        var cell = column[row];
        if (!cell) return "---";
        return cell.length >= 3 ? cell : cell + "---".slice(cell.length);
      }).join("");
      return stringName + "|" + body + "|";
    });
  }

  function tabPitchClasses(lines) {
    var found = [];
    lines.forEach(function (line) {
      var match = /^\s*([eE]|[ABDG])\|(.*)$/.exec(String(line).trim());
      if (!match) return;
      var open = STRING_OPEN[match[1]];
      var frets = match[2].match(/\d+/g) || [];
      frets.forEach(function (fret) {
        found.push((open + parseInt(fret, 10)) % 12);
      });
    });
    return found;
  }

  function lickFromBox(scale, box) {
    var notes = notesOnFretboard(scale, box.start, box.end);
    var roots = notes.filter(function (note) {
      return note.root && note.string === "E";
    });
    var start = roots[0] || notes.filter(function (note) { return note.root; })[0];
    if (!start) return [];
    var ordered = notes.slice().sort(function (a, b) {
      return (STRING_OPEN[a.string] + a.fret) - (STRING_OPEN[b.string] + b.fret);
    });
    var startMidi = STRING_OPEN[start.string] + start.fret;
    var rising = ordered.filter(function (note) {
      return STRING_OPEN[note.string] + note.fret >= startMidi;
    });
    var phrase = [];
    var seen = {};
    rising.forEach(function (note) {
      var key = note.string + ":" + note.fret;
      if (seen[key] || phrase.length >= 6) return;
      seen[key] = true;
      phrase.push({ string: note.string, fret: note.fret });
    });
    if (!phrase.length || phrase[phrase.length - 1].string !== start.string || phrase[phrase.length - 1].fret !== start.fret) {
      phrase.push({ string: start.string, fret: start.fret });
    }
    return phrase;
  }

  function primaryScale(scales) {
    if (!scales || !scales.length) return null;
    for (var i = 0; i < scales.length; i += 1) {
      if (scales[i].home) return scales[i];
    }
    return scales[0];
  }

  function scaleById(scales, id) {
    if (!id) return null;
    for (var i = 0; i < scales.length; i += 1) {
      if (scales[i].id === id) return scales[i];
    }
    return null;
  }

  function hydrateLesson(lesson, scales) {
    var scale = scaleById(scales, lesson.scaleId) || primaryScale(scales);
    var steps = (lesson.steps || []).map(function (step) {
      var stepScale = scaleById(scales, step.scaleId) || scale;
      var next = {
        id: step.id,
        title: step.title || "Step",
        text: step.text || "",
        scaleId: stepScale ? stepScale.id : lesson.scaleId,
        tab: step.tab || null,
        notes: step.notes || null,
        bend: step.bend || null,
        box: step.box || null,
        fretStart: step.fretStart,
        fretEnd: step.fretEnd,
      };
      if (next.box && stepScale && (next.fretStart === undefined || next.fretEnd === undefined)) {
        var boxes = boxesForScale(stepScale);
        var found = null;
        boxes.forEach(function (box) {
          if (box.box === next.box) found = box;
        });
        if (found) {
          next.fretStart = found.start;
          next.fretEnd = found.end;
          if (!step.title) next.title = "Box " + found.box;
        }
      }
      return next;
    });
    return {
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary || "",
      kind: lesson.kind || "tip",
      scaleId: scale ? scale.id : lesson.scaleId,
      steps: steps,
    };
  }

  function buildLessons(scale, progression) {
    if (!scale) return [];
    var boxes = boxesForScale(scale);
    var boxSteps = boxes.map(function (box) {
      return {
        id: "box-" + box.box,
        title: "Box " + box.box,
        text: "Play only the lit frets, ascending and descending, until the shape is automatic. " + describeRoots(scale, box),
        box: box.box,
        fretStart: box.start,
        fretEnd: box.end,
        scaleId: scale.id,
      };
    });
    var chordSteps = [];
    if (progression && progression.length) {
      var first = analyzeChord(progression[0], scale);
      var detail = first
        ? " Over " + first.symbol + ", chord tones inside this scale: " + (first.inScale.join(", ") || "none") + "."
        : "";
      if (first && first.missing.length) {
        detail += " In the chord but not in this scale: " + first.missing.join(", ") + ".";
      }
      chordSteps.push({
        id: "follow",
        title: "Follow the changes",
        text: "Press play. Bright dots are chord tones of the current bar that also belong to this scale. Pale dots are in the scale only — travel on those, and end the phrase on a bright one." + detail,
        scaleId: scale.id,
      });
    }
    var lick = boxes.length ? lickFromBox(scale, boxes[0]) : [];
    var bend = boxes.length ? wholeStepBend(scale, boxes[0]) : null;
    var tips = [
      {
        id: "space",
        title: "Leave space",
        text: "Play a short phrase, then rest for as long as the phrase lasted. The rest is part of the solo. Ending on the root, or on a chord tone of the bar you are in, makes the line sound finished.",
        scaleId: scale.id,
      },
      {
        id: "vibrato",
        title: "Vibrato",
        text: "Land on a root or a chord tone, then rock the fingertip along the string so the pitch moves a little above the note and back to it. The center of the vibrato is the target pitch.",
        scaleId: scale.id,
      },
    ];
    if (bend) {
      tips.unshift({
        id: "bend",
        title: "A whole-step bend",
        text: bendSentence(bend, scale) + " Support the fretting finger with the fingers behind it. The target has to be in the scale, and this one is.",
        bend: { string: bend.string, fret: bend.fret, semitones: 2 },
        scaleId: scale.id,
        fretStart: boxes[0].start,
        fretEnd: boxes[0].end,
      });
    }
    return [
      {
        id: "shapes",
        title: "Learn the shape",
        summary: skeletonKind(scale.intervals) === "generic"
          ? "Five positions of this scale."
          : "The five pentatonic boxes. Added scale notes, if any, are marked in blue.",
        kind: "boxes",
        scaleId: scale.id,
        steps: boxSteps,
      },
      {
        id: "chord-tones",
        title: "Target the chord tones",
        summary: "Bright notes belong to the chord that is playing.",
        kind: "chord-tones",
        scaleId: scale.id,
        steps: chordSteps,
      },
      {
        id: "lick",
        title: "A phrase",
        summary: "Even eighth notes, in this scale.",
        kind: "tab",
        scaleId: scale.id,
        steps: lick.length ? [{
          id: "lick-1",
          title: "Walk up to the root",
          text: "Even eighth notes. Every note is in " + scale.name + ". It climbs through box 1 and ends on the root.",
          notes: lick,
          fretStart: boxes[0].start,
          fretEnd: boxes[0].end,
          scaleId: scale.id,
        }] : [],
      },
      {
        id: "phrasing",
        title: "Phrasing",
        summary: "Bends, vibrato, and when to be quiet.",
        kind: "tip",
        scaleId: scale.id,
        steps: tips,
      },
    ].filter(function (lesson) {
      return lesson.steps && lesson.steps.length;
    });
  }

  function resolveLessons(track, scales) {
    var progression = track && track.progression ? track.progression : [];
    if (track && track.lessons && track.lessons.length) {
      return track.lessons.map(function (lesson) {
        return hydrateLesson(lesson, scales);
      }).filter(function (lesson) {
        return lesson.steps && lesson.steps.length;
      });
    }
    return buildLessons(primaryScale(scales), progression);
  }

  return {
    LETTERS: LETTERS,
    STRING_ORDER: STRING_ORDER,
    STRING_OPEN: STRING_OPEN,
    STRING_LABEL: STRING_LABEL,
    assetBaseFromScript: assetBaseFromScript,
    parseNote: parseNote,
    normalizeMode: normalizeMode,
    keyLabel: keyLabel,
    spellScale: spellScale,
    parseChord: parseChord,
    analyzeChord: analyzeChord,
    suggestScales: suggestScales,
    boxesForScale: boxesForScale,
    notesOnFretboard: notesOnFretboard,
    rootsInBox: rootsInBox,
    describeRoots: describeRoots,
    extraIntervals: extraIntervals,
    skeletonKind: skeletonKind,
    pitchClassAt: pitchClassAt,
    bendSentence: bendSentence,
    wholeStepBend: wholeStepBend,
    renderTab: renderTab,
    tabPitchClasses: tabPitchClasses,
    lickFromBox: lickFromBox,
    buildLessons: buildLessons,
    resolveLessons: resolveLessons,
    primaryScale: primaryScale,
    scalePitchClasses: scalePitchClasses,
  };
});
