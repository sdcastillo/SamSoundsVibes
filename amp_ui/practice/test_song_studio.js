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

console.log("song-studio: all checks passed");
