#!/usr/bin/env node
"use strict";

var assert = require("assert");
var path = require("path");
var studio = require(path.join(__dirname, "..", "static", "song-studio.js"));

var summary = studio.validateSong();
assert.strictEqual(summary.rhythm.bars, 16, "rhythm has 16 bars");
assert.strictEqual(summary.lead.bars, 16, "lead + solo has 16 bars");
assert.strictEqual(summary.bass.bars, 16, "bass has 16 bars");
assert.strictEqual(summary.drums.bars, 16, "drums has 16 bars");
assert.strictEqual(summary.vocals.bars, 16, "vocals has 16 bars");

assert.strictEqual(studio.SONG_DATA.parts.bass.octaveDown, true, "bass enables octave-down");
assert.strictEqual(studio.SONG_DATA.parts.rhythm.octaveDown, false, "rhythm keeps normal octave");
assert.strictEqual(studio.SONG_DATA.parts.lead.octaveDown, false, "lead keeps normal octave");

var vocals = studio.parsePartNotes("vocals");
vocals.notes.forEach(function (n, idx) {
  if (!n.rest) {
    assert.ok(n.lyric && n.lyric.length > 0, "vocal note " + idx + " has lyric word");
  }
});

var bass = studio.parsePartNotes("bass");
bass.notes.forEach(function (n) {
  if (!n.rest) {
    assert.strictEqual(n.soundingMidi, n.midi - 12, "bass soundingMidi is -1 octave");
  }
});

/* Sam's spec: vocal melody notes per bar, exactly as written */
var SPEC_VOCAL_NOTES = [
  "E4 E4 D4 G4 F#4", "G4 F#4 E4 D4", "E4 G4 A4 B4 A4", "G4 F#4 E4 F#4",
  "G4 G4 A4 G4 E4", "A4 A4 B4 A4 F#4", "B4 A4 G4 E4 D4", "F#4 G4 A4 B4",
  "E5 B4 A4 G4 E4", "G4 A4 G4 E4 D4", "G4 A4 B4 D5 G4", "A4 G4 F#4 E4",
  "E5 B4 A4 G4 E4", "G4 A4 B4 D5", "E5 D5 B4 A4 G4", "F#4 G4 F#4 E4"
];
var byBar = {};
vocals.notes.forEach(function (n) {
  if (n.rest) return;
  (byBar[n.bar] = byBar[n.bar] || []).push(n.noteLabel.replace("\u266F", "#"));
});
SPEC_VOCAL_NOTES.forEach(function (want, bar) {
  assert.strictEqual(byBar[bar].join(" "), want, "vocal bar " + (bar + 1) + " notes match spec");
  assert.strictEqual(studio.SONG_DATA.parts.vocals.lyricsByBar[bar].length, want.split(" ").length,
    "bar " + (bar + 1) + " has one syllable per melody note");
});

/* Lyric sheet uses Sam's exact lines */
var SPEC_LINES = [
  "V-eights howl on crimson sand, salt spray flies past!",
  "Chrome burns gold and red, sun sets a-head!",
  "Shift gears, feel the roar, turbos shake the shore",
  "Headlights cut the foam — full speed for home!",
  "SUNSET REDLINE roar! Flying down the shore!",
  "Wheels ignite where breakers crash — outrun the night!",
  "Burn the horizon, chase the sinking sun",
  "Thunder in the tide — Redline sunset ride!"
];
var sheetLines = [];
studio.SONG_DATA.parts.vocals.lyricSheet.forEach(function (block) {
  block.lines.forEach(function (line) { sheetLines.push(line.words); });
});
assert.deepStrictEqual(sheetLines, SPEC_LINES, "lyric sheet matches the spec word for word");

/* Lead: hook, arpeggio climb, counter-melody and solo opener as written */
var leadBars = studio.SONG_DATA.parts.lead.tab.split(" | ");
assert.ok(/^B5\w B8\w B7\w G7\w G9\w$/.test(leadBars[0]), "lead hook B5-B8-B7-G7-G9");
assert.strictEqual(leadBars[8], "e12q B12e B10e B8q G9q", "chorus counter-melody");
assert.strictEqual(leadBars[12], "G9s G11s G12s B12s e12e B15e e12e e15e e12q", "solo opener");
assert.ok(/e12h$/.test(leadBars[15]), "solo resolves on a sustained 12th-fret high E");
assert.strictEqual(studio.SONG_DATA.parts.lead.tone.overrides.delay_ms, 360, "lead delay is 360 ms");

/* Rhythm verse gallop */
assert.strictEqual(studio.SONG_DATA.parts.rhythm.tab.split(" | ")[0], "E0e E0e E3e E0e E5e E0e E7e E5e", "verse gallop");

/* Drum machine: four named grooves, 16 steps, crash + ride rows */
var pats = studio.SONG_DATA.drumPatterns;
assert.deepStrictEqual(
  ["verse", "prechorus", "chorus", "solo"].map(function (k) { return pats[k].name; }),
  ["Verse: Beach Gallop", "Pre-Chorus: Turbo Build", "Chorus: Half-Time Crash", "Solo: Double-Kick Overdrive"]
);
Object.keys(pats).forEach(function (k) {
  ["kick", "snare", "hihat", "crash", "ride"].forEach(function (row) {
    assert.strictEqual(pats[k].rows[row].length, 16, k + " " + row + " has 16 steps");
  });
});

/* Tones name real presets; IR files are only requested, never assumed */
assert.strictEqual(studio.SONG_DATA.parts.rhythm.tone.name, "Revv Gen Red");
assert.strictEqual(studio.SONG_DATA.parts.lead.tone.name, "MK IV lead 2");
assert.strictEqual(studio.SONG_DATA.parts.bass.tone.name, "BAS:SVT Nrm");
assert.strictEqual(studio.SONG_DATA.parts.bass.tone.overrides.octave_down, 1.0);

console.log("song-studio: all checks passed");
