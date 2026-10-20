#!/usr/bin/env node
"use strict";

var assert = require("assert");
var path = require("path");
var studio = require(path.join(__dirname, "..", "static", "song-studio.js"));

studio.loadSongById("sams-neo-classical");
var data = studio.SONG_DATA;
assert.strictEqual(data.id, "sams-neo-classical");
assert.strictEqual(data.songType, "neo-classical");
assert.strictEqual(data.bars, 12);
assert.strictEqual(data.bpm, 120);

var summary = studio.validateSong();
assert.strictEqual(summary.rhythm.bars, 12);
assert.strictEqual(summary.lead.bars, 12);
assert.strictEqual(summary.bass.bars, 12);
assert.strictEqual(summary.drums.bars, 12);
assert.strictEqual(summary.vocals.bars, 12);

var leadBars = data.parts.lead.tab.split(" | ");
assert.ok(/b\d/.test(leadBars[3]), "theme lead uses bend technique");
assert.ok(/s\d/.test(leadBars[8]), "solo lead uses slide technique");

var pats = data.drumPatterns;
assert.deepStrictEqual(
  ["theme", "variation", "solo"].map(function (k) { return pats[k].name; }),
  ["Theme: Classical March", "Variation: Arpeggio Pulse", "Solo: Driving Ride"]
);

console.log("sams-neo-classical: all checks passed");
