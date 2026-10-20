#!/usr/bin/env node
"use strict";

const assert = require("assert");
const core = require("../static/staff-core.js");

function eq(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label || "");
}

eq(core.parseNote("E2").midi, 40, "low E");
eq(core.parseNote("C4").midi, 60, "middle C");
eq(core.parseNote("Bb3").midi, 58, "B flat");
eq(core.parseNote("F#4").midi, 66, "F sharp");
eq(core.noteName(core.noteFromMidi(61, true)), "D\u266D4", "flat spelling");
eq(core.noteName(core.noteFromMidi(61, false)), "C\u266F4", "sharp spelling");

eq(core.staffStep(core.parseNote("C4")), 0, "middle C step");
eq(core.staffStep(core.parseNote("E4")), 2, "bottom treble line");
eq(core.staffStep(core.parseNote("G2")), -10, "bottom bass line");

const lowE = core.writtenNote(core.parseNote("E2"), "guitar");
eq(core.noteName(lowE), "E3", "guitar writes low E as E3");
const lowStep = core.staffStep(lowE);
eq(lowStep, -5, "written E3 step");
eq(core.ledgerSteps(lowStep, "guitar"), [0, -2, -4], "low E hangs under three ledger lines");
eq(core.ledgerSteps(core.staffStep(core.writtenNote(core.parseNote("E4"), "guitar")), "guitar"), [], "open high e sits in the staff");
eq(core.ledgerSteps(core.staffStep(core.writtenNote(core.parseNote("E5"), "guitar")), "guitar"), [12, 14, 16], "12th fret high e");
eq(core.ledgerSteps(core.staffStep(core.parseNote("E2")), "concert"), [-12], "grand staff low E");
eq(core.ledgerSteps(0, "concert"), [0], "grand staff middle C");
eq(core.ledgerSteps(1, "concert"), [], "D4 needs no ledger on the grand staff");
eq(core.stemUp(4, "guitar"), true, "below middle line stems up");
eq(core.stemUp(8, "guitar"), false, "above middle line stems down");

eq(core.fretPositions(40), [{ string: 6, label: "low E", fret: 0 }], "low E has one spot");
eq(
  core.fretPositions(64).map((p) => p.string + ":" + p.fret),
  ["1:0", "2:5", "3:9"],
  "open high e also lives on B5 and G9"
);
eq(core.describePosition({ string: 5, fret: 3 }), "A string (5th), fret 3", "describe");
eq(core.describePosition({ string: 3, fret: 0 }), "open G string", "describe open");

core.LEVELS.forEach(function (level) {
  assert(level.notes.length >= 6, level.id + " has a pool");
  level.notes.forEach(function (name) {
    const n = core.parseNote(name);
    assert(n.midi >= 40 && n.midi <= 76, level.id + " " + name + " is on a 12-fret neck");
  });
});
eq(core.LEVELS[0].notes, ["E2", "A2", "D3", "G3", "B3", "E4"], "open strings");
assert(core.LEVELS[4].notes.indexOf("Gb2") >= 0 && core.LEVELS[4].notes.indexOf("F#2") >= 0, "both spellings");

core.SCALES.forEach(function (scale) {
  const notes = core.scaleNotes(scale);
  eq(notes[0].note.midi, notes[notes.length - 1].note.midi, scale.id + " returns home");
  notes.forEach(function (item) {
    assert(core.fretPositions(item.note.midi).length > 0, scale.id + " playable");
  });
});

core.SONGS.forEach(function (song) {
  const parsed = core.parseSong(song);
  assert(parsed.notes.length >= 20, song.id + " has a melody");
  const perBar = {};
  parsed.notes.forEach(function (item) {
    assert(core.fretPositions(item.note.midi, 5).length > 0, song.id + " stays in first position");
    perBar[item.bar] = (perBar[item.bar] || 0) + item.beats;
  });
  const bars = Object.keys(perBar).map(Number);
  bars.forEach(function (bar) {
    const expected = bar === 0 && song.pickup ? song.pickup : parsed.perBar;
    eq(perBar[bar], expected, song.id + " bar " + bar + " adds up");
  });
});
eq(core.parseSong(core.findById(core.SONGS, "mary")).notes[0].note.midi, 52, "written E4 sounds E3");

const paradise = core.parseSong(core.findById(core.SONGS, "paradise-road"));
eq(paradise.bars, 96, "Paradise Road full form");
eq(paradise.frets.length, paradise.notes.length, "every tab note keeps its fret");
eq(paradise.notes.slice(0, 4).map((n) => n.string + ":" + n.fret), ["5:3", "3:0", "2:1", "3:0"], "C picked from the A-string root");
eq(paradise.marks.chords.slice(0, 4).map((c) => c.text + "@" + c.beat), ["C@0", "G@2", "Am@4", "F@6"], "two beats per chord");
const roots = { C: 48, G: 43, Am: 45, F: 53 };
paradise.marks.chords.forEach(function (c) {
  const first = paradise.notes.filter((n) => Math.abs(n.beat - c.beat) < 1e-9)[0];
  eq(first.midi, roots[c.text], "Paradise Road " + c.text + " at beat " + c.beat + " starts on its root");
});
eq(paradise.marks.lyrics[0].text, "His heart has", "first lyric");
assert(paradise.marks.sections.some((s) => s.text === "Bridge *"), "bridge marked inferred");

assert(core.matches(40, 40, false));
assert(!core.matches(40, 52, false));
assert(core.matches(40, 52, true), "any octave");
eq(core.missHint(45, 43), "Go higher by two frets (a whole step).", "hint up");
eq(core.missHint(45, 46), "Go lower by one fret (a half step).", "hint down");
eq(core.missHint(52, 40), "Right letter, wrong octave \u2014 go up an octave.", "octave hint");

eq(core.hitPoints(1, 30).total, 10, "plain hit");
eq(core.hitPoints(1, 4).total, 15, "in-tune bonus");
eq(core.hitPoints(5, 30).total, 20, "x2 at streak 5");
eq(core.hitPoints(10, 0).total, 35, "x3 at streak 10 plus bonus");
eq(core.stars(0, 15), 3);
eq(core.stars(2, 15), 2);
eq(core.stars(6, 15), 1);

let seq = 0;
const fakeRand = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
let prev = null;
for (let i = 0; i < 200; i++) {
  const n = core.pickTarget(core.LEVELS[0].notes, {}, prev, fakeRand);
  assert(core.noteKey(n) !== prev, "no immediate repeat");
  prev = core.noteKey(n);
}
const weighted = { 40: { hits: 0, misses: 9 }, 45: { hits: 9, misses: 0 } };
let lowCount = 0;
for (let i = 0; i < 400; i++) {
  if (core.pickTarget(["E2", "A2"], weighted, null, fakeRand).midi === 40) lowCount++;
}
assert(lowCount > 250, "missed notes come up more often (" + lowCount + "/400)");
eq(core.weakestNotes(weighted).map((r) => r.midi), [40], "weakest notes");

(function onsetDetector() {
  const det = core.createOnsetDetector({ stableMs: 100 });
  const frame = (midi, level) => ({ active: true, midi: midi, cents: 0, level: level || 0.2 });
  eq(det.push(frame(40), 0), null, "needs to be stable first");
  eq(det.push(frame(40), 120).midi, 40, "fires once stable");
  eq(det.push(frame(40), 240), null, "held note does not repeat");
  eq(det.push(frame(45), 360), null, "new note waits for stability");
  eq(det.push(frame(45), 480).midi, 45, "new note fires");
  eq(det.push({ active: false }, 600), null, "silence");
  det.push(frame(45), 700);
  eq(det.push(frame(45), 820).midi, 45, "same note again after silence");
  det.push(frame(45, 0.1), 900);
  det.push(frame(45, 0.5), 1000);
  eq(det.push(frame(45, 0.45), 1120).midi, 45, "same note again after a pick attack");
  const tap = core.createOnsetDetector({ stableMs: 0 });
  eq(tap.push(frame(50), 0).midi, 50, "zero stability fires immediately");
})();

(function pitchDetector() {
  const rate = 48000;
  [40, 45, 50, 55, 59, 64, 69, 72, 76, 81].forEach(function (midi) {
    const hz = core.midiToHz(midi);
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) {
      const t = i / rate;
      buf[i] =
        0.1 *
        (Math.sin(2 * Math.PI * hz * t) +
          0.8 * Math.sin(4 * Math.PI * hz * t) +
          0.5 * Math.sin(6 * Math.PI * hz * t) +
          0.3 * Math.sin(8 * Math.PI * hz * t));
    }
    const found = core.detectPitch(buf, rate);
    assert(found, "pitch for midi " + midi);
    eq(found.midi, midi, "midi " + midi + " detected (" + found.hz.toFixed(1) + " Hz)");
    assert(Math.abs(found.cents) < 10, "cents near zero for " + midi);
  });
  eq(core.detectPitch(new Float32Array(2048), rate), null, "silence");
})();

(function tabs() {
  const tab = core.parseTab("A0e A3e D2q. rs G5s | e12w", 4);
  eq(tab.bars, 2, "bar line splits bars");
  eq(tab.barSums, [3, 4], "beats per bar");
  eq(tab.notes[0].midi, 45, "open A");
  eq(tab.notes[1].midi, 48, "A string 3rd fret is C");
  eq(tab.notes[2].beat, 1, "beat counts from the bar start");
  eq(tab.notes[3].rest, true, "rest");
  eq(tab.notes[4].string, 3, "G string");
  eq(tab.notes[5].midi, 76, "high e 12th fret");
  eq(tab.notes[5].beat, 4, "second bar starts on beat 4");
  assert.throws(() => core.parseTab("X3q"), /Bad tab token/);

  var tech = core.parseTab("B5h8e G8b10~q B1+G0q | rq", 4);
  eq(tech.notes[0].hammer.fret, 8, "hammer");
  eq(tech.notes[1].bend.fret, 10, "bend");
  assert(tech.notes[1].vibrato, "vibrato");
  eq(tech.notes[2].voices.length, 2, "double-stop");
  eq(core.tabTechniqueKinds(tech.notes[0]), ["hammer"], "hammer kind");
  eq(core.tabMatchMidis(tech.notes[1]).length, 2, "bend adds target midi");

  const song = core.parseSong(core.findById(core.SONGS, "birthday"));
  eq(song.notes[0].beat, 2, "pickup starts on beat 3 of bar 0");
  eq(song.notes[2].beat, 3, "first full bar starts at beat 3");
  eq(song.meter, [3, 4], "song meter");
  const ode = core.parseSong(core.findById(core.SONGS, "ode"));
  eq(ode.notes[4].beat, 4, "Ode bar 2 starts on beat 4");

  const frets = core.assignFrets(core.parseSong(core.findById(core.SONGS, "mary")).notes, [0, 4]);
  eq(frets.slice(0, 3), [{ string: 4, fret: 2 }, { string: 4, fret: 0 }, { string: 5, fret: 3 }], "Mary in first position");
  const box = core.scaleNotes(core.findById(core.SCALES, "a-minor-pent"));
  const boxFrets = core.assignFrets(box, core.findById(core.SCALES, "a-minor-pent").frets);
  assert(boxFrets.every((p) => p.fret >= 5 && p.fret <= 8), "A minor pentatonic stays in box 1");
  eq(core.assignFrets([{ rest: true, beat: 0, beats: 1 }]), [null], "rests get no fret");
})();

(function timedJudge() {
  const notes = core.parseTab("A0q A3q r A5q", 4).notes;
  const judge = core.createTimedJudge(notes, { secPerBeat: 0.5 });
  eq(judge.onset(45, 0.05).type, "hit", "on time");
  eq(judge.onset(45, 0.1).type, "stray", "each note scores once");
  eq(judge.onset(47, 0.55).type, "stray", "wrong pitch in the window");
  eq(judge.at(1.1), 2, "the rest is current at beat 2");
  eq(judge.next(0.6), 1, "next unplayed note");
  eq(judge.sweep(0.79), [], "still inside the late window");
  eq(judge.sweep(0.81), [1], "late window closes");
  eq(judge.onset(50, 1.35).type, "hit", "early within 0.2 s");
  eq(judge.stats().hits, 2, "two hits");
  eq(judge.stats().misses, 1, "one miss");
  eq(judge.stats().accuracy, 2 / 3, "accuracy");
  const loose = core.createTimedJudge(notes, { secPerBeat: 0.5, anyOctave: true });
  eq(loose.onset(57, 0).octave, true, "octave above counts when anyOctave");
  judge.reset();
  eq(judge.stats().hits, 0, "reset clears scores");
  eq(core.METERS.map((m) => m.id), ["2/4", "3/4", "4/4", "6/8"], "meters");
  const det = core.createOnsetDetector({ stableMs: 110 });
  det.push({ active: true, midi: 45, level: 0.2 }, 1000);
  eq(det.push({ active: true, midi: 45, level: 0.2 }, 1120).at, 1000, "onset time is when the note first appeared");
})();

console.log("staff-core: all checks passed");
