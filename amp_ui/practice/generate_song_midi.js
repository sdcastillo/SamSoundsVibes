#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var SongMidi = require(path.join(__dirname, "..", "static", "song-midi.js")).SongMidi;
var studio = require(path.join(__dirname, "..", "static", "song-studio.js"));

var outDir = path.join(__dirname, "..", "static", "song");
fs.mkdirSync(outDir, { recursive: true });

var bpm = studio.SONG_DATA.bpm;
var generic = [
  { beat: 0, midi: 64, durBeats: 0.5, velocity: 0x50 },
  { beat: 0.5, midi: 67, durBeats: 0.5, velocity: 0x50 },
  { beat: 1, midi: 71, durBeats: 0.5, velocity: 0x50 },
  { beat: 1.5, midi: 74, durBeats: 0.5, velocity: 0x50 },
  { beat: 2, midi: 76, durBeats: 1, velocity: 0x55 },
  { beat: 3, midi: 74, durBeats: 0.5, velocity: 0x50 },
  { beat: 3.5, midi: 71, durBeats: 0.5, velocity: 0x50 },
  { beat: 4, midi: 67, durBeats: 1, velocity: 0x50 }
];
fs.writeFileSync(
  path.join(outDir, "generic-guitar.mid"),
  Buffer.from(SongMidi.buildSmfFromNoteEvents(generic, bpm))
);

["rhythm", "lead", "bass"].forEach(function (partId) {
  var parsed = studio.parsePartNotes(partId);
  var events = SongMidi.noteEventsFromParsedTab(parsed, 0, studio.SONG_DATA.bars);
  var name = "sunrise-redline-" + partId + ".mid";
  fs.writeFileSync(path.join(outDir, name), Buffer.from(SongMidi.buildSmfFromNoteEvents(events, bpm)));
  console.log("Wrote", name, "(" + events.length + " notes)");
});

console.log("Wrote generic-guitar.mid");
