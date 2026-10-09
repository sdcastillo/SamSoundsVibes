#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const theory = require("../static/practice-theory.js");

function eq(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label || "");
}

function pcsOf(notes) {
  return notes.map(function (name) {
    return theory.parseNote(name).pc;
  });
}

eq(theory.spellScale("A", [0, 3, 5, 7, 10]), ["A", "C", "D", "E", "G"], "A minor pentatonic");
eq(theory.spellScale("A", [0, 3, 5, 6, 7, 10]), ["A", "C", "D", "Eb", "E", "G"], "A blues");
eq(theory.spellScale("A", [0, 2, 3, 5, 7, 8, 10]), ["A", "B", "C", "D", "E", "F", "G"], "A natural minor");
eq(theory.spellScale("A", [0, 2, 3, 5, 7, 9, 10]), ["A", "B", "C", "D", "E", "F#", "G"], "A dorian");
eq(theory.spellScale("E", [0, 3, 5, 7, 10]), ["E", "G", "A", "B", "D"], "E minor pentatonic");
eq(theory.spellScale("E", [0, 2, 3, 5, 7, 8, 10]), ["E", "F#", "G", "A", "B", "C", "D"], "E natural minor");
eq(theory.spellScale("E", [0, 3, 5, 6, 7, 10]), ["E", "G", "A", "Bb", "B", "D"], "E blues");
eq(theory.spellScale("E", [0, 2, 3, 5, 7, 9, 10]), ["E", "F#", "G", "A", "B", "C#", "D"], "E dorian");
eq(theory.spellScale("G", [0, 2, 4, 5, 7, 9, 11]), ["G", "A", "B", "C", "D", "E", "F#"], "G major");
eq(theory.spellScale("G", [0, 2, 4, 7, 9]), ["G", "A", "B", "D", "E"], "G major pentatonic");
eq(theory.spellScale("E", [0, 3, 5, 7, 10]), ["E", "G", "A", "B", "D"], "relative minor pent of G");
eq(theory.spellScale("G", [0, 2, 4, 5, 7, 9, 10]), ["G", "A", "B", "C", "D", "E", "F"], "G mixolydian");
eq(theory.spellScale("D", [0, 2, 3, 5, 7, 9, 10]), ["D", "E", "F", "G", "A", "B", "C"], "D dorian");
eq(theory.spellScale("D", [0, 3, 5, 7, 10]), ["D", "F", "G", "A", "C"], "D minor pentatonic");
eq(theory.spellScale("D", [0, 3, 5, 6, 7, 10]), ["D", "F", "G", "Ab", "A", "C"], "D blues");
eq(theory.spellScale("D", [0, 2, 3, 5, 7, 8, 10]), ["D", "E", "F", "G", "A", "Bb", "C"], "D natural minor");
eq(theory.spellScale("Bb", [0, 2, 4, 5, 7, 9, 11]), ["Bb", "C", "D", "Eb", "F", "G", "A"], "Bb major");
eq(theory.spellScale("F#", [0, 2, 3, 5, 7, 8, 10]), ["F#", "G#", "A", "B", "C#", "D", "E"], "F# minor");
eq(theory.spellScale("Eb", [0, 2, 4, 5, 7, 9, 11]), ["Eb", "F", "G", "Ab", "Bb", "C", "D"], "Eb major");

eq(theory.parseChord("Am7").intervals, [0, 3, 7, 10]);
eq(theory.spellScale("D", theory.parseChord("Dm7").intervals), ["D", "F", "A", "C"]);
eq(theory.spellScale("G", theory.parseChord("G7").intervals), ["G", "B", "D", "F"]);
eq(theory.spellScale("Bb", theory.parseChord("Bb").intervals), ["Bb", "D", "F"]);
eq(theory.spellScale("F#", theory.parseChord("F#m").intervals), ["F#", "A", "C#"]);
eq(theory.spellScale("E", theory.parseChord("Em").intervals), ["E", "G", "B"]);

function scaleFrom(root, intervals) {
  return { id: "s", name: root, root: root, intervals: intervals, notes: theory.spellScale(root, intervals) };
}

const aPent = scaleFrom("A", [0, 3, 5, 7, 10]);
const aMinor = scaleFrom("A", [0, 2, 3, 5, 7, 8, 10]);
const ePent = scaleFrom("E", [0, 3, 5, 7, 10]);
const eMinor = scaleFrom("E", [0, 2, 3, 5, 7, 8, 10]);
const gPent = scaleFrom("G", [0, 2, 4, 7, 9]);
const gMajor = scaleFrom("G", [0, 2, 4, 5, 7, 9, 11]);
const dPent = scaleFrom("D", [0, 3, 5, 7, 10]);
const dDorian = scaleFrom("D", [0, 2, 3, 5, 7, 9, 10]);

function names(report) {
  return report.inScale;
}

eq(names(theory.analyzeChord("Am7", aPent)), ["A", "C", "E", "G"]);
eq(theory.analyzeChord("Am7", aPent).missing, []);
eq(names(theory.analyzeChord("Dm7", aPent)), ["D", "A", "C"]);
eq(theory.analyzeChord("Dm7", aPent).missing, ["F"]);
eq(names(theory.analyzeChord("Em7", aPent)), ["E", "G", "D"]);
eq(theory.analyzeChord("Em7", aPent).missing, ["B"]);
eq(names(theory.analyzeChord("Dm7", aMinor)).sort(), ["A", "C", "D", "F"].sort());
eq(theory.analyzeChord("Em7", aMinor).missing, []);
eq(names(theory.analyzeChord("Em", ePent)), ["E", "G", "B"]);
eq(theory.analyzeChord("C", ePent).missing, ["C"]);
eq(names(theory.analyzeChord("C", eMinor)), ["C", "E", "G"]);
eq(theory.analyzeChord("D", ePent).missing, ["F#"]);
eq(theory.analyzeChord("D", eMinor).missing, []);
eq(names(theory.analyzeChord("G", gPent)), ["G", "B", "D"]);
eq(theory.analyzeChord("D", gPent).missing, ["F#"]);
eq(theory.analyzeChord("C", gPent).missing, ["C"]);
eq(theory.analyzeChord("D", gMajor).missing, []);
eq(theory.analyzeChord("C", gMajor).missing, []);
eq(names(theory.analyzeChord("G7", dDorian)), ["G", "B", "D", "F"]);
eq(theory.analyzeChord("G7", dPent).missing, ["B"]);
eq(theory.analyzeChord("Dm7", dDorian).missing, []);

["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].forEach(function (tonic) {
  [ [0, 3, 5, 7, 10], [0, 2, 4, 7, 9] ].forEach(function (intervals) {
    const scale = scaleFrom(tonic, intervals);
    const boxes = theory.boxesForScale(scale);
    assert.strictEqual(boxes.length, 5, tonic + " box count");
    const rootPc = theory.parseNote(tonic).pc;
    const seenRootOnLowE = {};
    boxes.forEach(function (box) {
      assert.ok(box.end >= box.start, tonic + " box order");
      assert.ok(box.end - box.start <= 8, tonic + " box width");
      const notes = theory.notesOnFretboard(scale, box.start, box.end);
      notes.forEach(function (note) {
        assert.ok(scale.intervals.indexOf(note.interval) >= 0, "foreign note");
      });
      const roots = notes.filter(function (note) { return note.root; });
      assert.ok(roots.length >= 1, tonic + " " + intervals.join(",") + " box " + box.box + " has no root (" + box.start + "-" + box.end + ")");
      roots.forEach(function (note) {
        assert.strictEqual(note.pc, rootPc);
        if (note.string === "E") seenRootOnLowE[note.fret] = true;
      });
    });
  });
});

function readWavMono(file) {
  const buf = fs.readFileSync(file);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 12;
  let channels = 1;
  let rate = 44100;
  let bits = 16;
  let dataStart = 0;
  let dataBytes = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  assert.strictEqual(bits, 16);
  const frames = Math.floor(dataBytes / (channels * 2));
  const samples = new Float64Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += view.getInt16(dataStart + (i * channels + c) * 2, true) / 32768;
    }
    samples[i] = sum / channels;
  }
  return { samples: samples, sr: rate, frames: frames };
}

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../static/practice/tracks.json"), "utf8"));
const audioDir = path.join(__dirname, "../static/practice/audio");

catalog.tracks.forEach(function (track) {
  const home = track.scales.filter(function (scale) { return scale.home; });
  assert.strictEqual(home.length, 1, track.id + " home scale");
  const homePcs = {};
  const root = theory.parseNote(home[0].root).pc;
  home[0].intervals.forEach(function (interval) {
    homePcs[(root + interval) % 12] = true;
  });
  track.progression.forEach(function (symbol) {
    const chord = theory.parseChord(symbol);
    assert.ok(chord, track.id + " chord " + symbol);
    chord.intervals.forEach(function (interval) {
      const pc = (chord.rootPc + (interval % 12)) % 12;
      assert.ok(homePcs[pc], track.id + " " + symbol + " tone outside home scale");
    });
  });
  track.scales.forEach(function (scale) {
    const spelled = theory.spellScale(scale.root, scale.intervals);
    eq(pcsOf(scale.notes), pcsOf(spelled), track.id + " " + scale.name + " spelling");
    eq(scale.notes, spelled, track.id + " " + scale.name + " note names");
  });
  const wav = path.join(audioDir, path.basename(track.file));
  assert.ok(fs.existsSync(wav), wav);
  const audio = readWavMono(wav);
  const expected = track.progression.length * 4 * 60 / track.bpm;
  assert.ok(Math.abs(audio.frames / audio.sr - expected) < 0.02, track.id + " duration");
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < audio.samples.length; i += 8) {
    const value = Math.abs(audio.samples[i]);
    if (value > peak) peak = value;
    sum += audio.samples[i] * audio.samples[i];
  }
  assert.ok(peak > 0.2 && peak <= 1, track.id + " peak " + peak);
  const rms = Math.sqrt(sum / (audio.samples.length / 8));
  assert.ok(rms > 0.02, track.id + " rms " + rms);
});

catalog.tracks.forEach(function (track) {
  const lessons = theory.resolveLessons(track, track.scales);
  assert.ok(lessons.length >= 1, track.id + " lessons");
  const ids = {};
  lessons.forEach(function (lesson) {
    assert.ok(lesson.steps.length, lesson.id);
    lesson.steps.forEach(function (step) {
      const key = lesson.id + ":" + step.id;
      assert.ok(!ids[key], "duplicate " + key);
      ids[key] = true;
      const scale = track.scales.filter(function (item) { return item.id === (step.scaleId || lesson.scaleId); })[0];
      assert.ok(scale, "missing scale for " + key);
      const allowed = {};
      theory.scalePitchClasses(scale).forEach(function (pc) { allowed[pc] = true; });
      const tab = step.tab || (step.notes ? theory.renderTab(step.notes) : null);
      if (tab) {
        theory.tabPitchClasses(tab).forEach(function (pc) {
          assert.ok(allowed[pc], key + " tab note outside " + scale.name);
        });
      }
      if (step.bend) {
        const from = theory.pitchClassAt(step.bend.string, step.bend.fret);
        const to = (from + step.bend.semitones) % 12;
        assert.ok(allowed[from], key + " bend source");
        assert.ok(allowed[to], key + " bend target");
      }
      if (step.box) {
        assert.ok(step.fretEnd >= step.fretStart, key + " frets");
        const roots = theory.notesOnFretboard(scale, step.fretStart, step.fretEnd).filter(function (note) {
          return note.root;
        });
        assert.ok(roots.length >= 1, key + " box has a root");
      }
    });
  });
});

const localScales = theory.suggestScales("F#", "minor");
eq(localScales[0].notes, ["F#", "A", "B", "C#", "E"]);
const localLessons = theory.buildLessons(localScales[0], ["F#m", "Bm", "C#m"]);
const lick = localLessons.filter(function (lesson) { return lesson.id === "lick"; })[0];
const lickPcs = theory.tabPitchClasses(theory.renderTab(lick.steps[0].notes));
const allowed = {};
theory.scalePitchClasses(localScales[0]).forEach(function (pc) { allowed[pc] = true; });
lickPcs.forEach(function (pc) { assert.ok(allowed[pc], "generated lick"); });
const bendLesson = localLessons.filter(function (lesson) { return lesson.id === "phrasing"; })[0];
const bendStep = bendLesson.steps.filter(function (step) { return step.bend; })[0];
assert.ok(bendStep, "generated bend");
assert.ok(allowed[theory.pitchClassAt(bendStep.bend.string, bendStep.bend.fret)]);

console.log("theory tests passed");
