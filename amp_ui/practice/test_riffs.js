#!/usr/bin/env node
"use strict";

/* Checks every riff and lead in riffs.json against its backing track: bar count and length,
   notes in the track's scales, a chord tone in every bar, and a real preset and IR. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const core = require("../static/staff-core.js");
const theory = require("../static/practice-theory.js");

const root = path.join(__dirname, "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "practice", "tracks.json"), "utf8"));
const riffs = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "practice", "riffs.json"), "utf8"));
const factory = JSON.parse(fs.readFileSync(path.join(root, "presets", "factory.json"), "utf8"));
const irs = new Set(fs.readdirSync(path.join(root, "irs")).filter((n) => n.endsWith(".wav")));
const ALLOWED = new Set(["drive", "bass", "mid", "treble", "presence", "delay_ms", "feedback", "mix", "wah_freq", "wah_q", "wah_mix", "ir_mix", "low_cut", "high_cut"]);
const TECH_LEADS = new Set(["a-minor-blues", "g-major", "d-dorian-funk"]);
const TECH_NEED = new Set(["hammer", "pull", "bend", "slide", "vibrato", "double"]);

let checked = 0;
assert.strictEqual(Object.keys(riffs.tracks).length, catalog.tracks.length, "one riffs entry per track");

catalog.tracks.forEach((track) => {
  const entry = riffs.tracks[track.id];
  assert.ok(entry, "riffs for " + track.id);
  const perBar = Number(String(track.timeSignature || "4/4").split("/")[0]);
  const scalePcs = new Set();
  track.scales.forEach((s) => theory.scalePitchClasses(s).forEach((pc) => scalePcs.add(pc)));

  const tone = entry.tone;
  const preset = factory.presets.find((p) => Number(p.slot) === tone.slot);
  assert.ok(preset, track.id + " preset slot " + tone.slot);
  assert.strictEqual(preset.name, tone.name, track.id + " preset name");
  if (tone.ir) assert.ok(irs.has(tone.ir), track.id + " IR " + tone.ir);
  const presetIr = tone.ir || preset.play.ir;
  if (presetIr) assert.ok(irs.has(presetIr), track.id + " preset IR " + presetIr);
  Object.keys(tone.overrides || {}).forEach((key) => assert.ok(ALLOWED.has(key), track.id + " override " + key));
  const delay = tone.overrides && tone.overrides.delay_ms;
  if (delay != null) {
    assert.ok(delay >= 50 && delay <= 800, track.id + " delay in range");
    const beatMs = 60000 / track.bpm;
    const synced = [1, 0.75, 2 / 3, 0.5, 1 / 3, 0.25, 1.5, 2].some((f) => Math.abs(beatMs * f - delay) <= 2);
    assert.ok(synced, track.id + " delay " + delay + " ms is a note value at " + track.bpm + " BPM");
  }
  assert.ok(tone.why && tone.why.length > 20, track.id + " explains the tone");
  const cabWords = { Marshall: /Marshall/, Mesa: /Mesa/, HG: /\bHG\d/, acoustic: /Dtar/ };
  Object.keys(cabWords).forEach((word) => {
    const loads = cabWords[word].test(presetIr || "");
    const says = word === "acoustic" ? /acoustic|dreadnought/i.test(tone.why) : new RegExp(word + "[^.]*\\b(cab|IR)\\b").test(tone.why);
    if (says) assert.ok(loads, track.id + " says a " + word + " cab but loads " + presetIr);
  });

  assert.deepStrictEqual(entry.phrases.map((p) => p.id), ["riff", "lead"], track.id + " has a riff and a lead");
  entry.phrases.forEach((phrase) => {
    const label = track.id + "/" + phrase.id;
    const parsed = core.parseTab(phrase.tab, perBar);
    assert.strictEqual(parsed.bars, track.progression.length, label + " bars match the progression");
    parsed.barSums.forEach((sum, i) => assert.ok(Math.abs(sum - perBar) < 1e-9, label + " bar " + (i + 1) + " has " + sum + " beats"));
    parsed.notes.forEach((n) => {
      if (n.rest) return;
      assert.ok(n.fret >= 0 && n.fret <= 15, label + " fret range");
      core.tabMatchMidis(n).forEach((midi) => {
        assert.ok(scalePcs.has(midi % 12), label + " bar " + (n.bar + 1) + ": " + core.noteName(core.noteFromMidi(midi, false)) + " is outside " + track.key);
      });
      if (n.bend) assert.ok(n.bend.fret > n.fret, label + " bend target above start");
      if (n.hammer) assert.ok(n.hammer.fret !== n.fret, label + " hammer target");
      if (n.pull) assert.ok(n.pull.fret !== n.fret, label + " pull target");
    });
    if (phrase.kind === "lead" && TECH_LEADS.has(track.id)) {
      const kinds = new Set();
      parsed.notes.forEach((n) => core.tabTechniqueKinds(n).forEach((k) => kinds.add(k)));
      TECH_NEED.forEach((need) => assert.ok(kinds.has(need), label + " uses " + need));
      assert.ok(Array.isArray(phrase.techniqueTips) && phrase.techniqueTips.length >= 4, label + " technique tips");
      phrase.techniqueTips.forEach((tip) => {
        assert.ok(tip.technique && tip.text && tip.text.length > 12, label + " tip " + (tip.technique || "?"));
      });
    }
    track.progression.forEach((symbol, bar) => {
      const chord = theory.parseChord(symbol);
      const pcs = new Set(chord.intervals.map((iv) => (chord.rootPc + iv) % 12));
      const inBar = parsed.notes.filter((n) => !n.rest && n.bar === bar);
      assert.ok(inBar.length, label + " bar " + (bar + 1) + " has notes");
      assert.ok(inBar.some((n) => pcs.has(n.midi % 12)), label + " bar " + (bar + 1) + " touches a " + symbol + " chord tone");
    });
    const first = parsed.notes.find((n) => !n.rest);
    const chord0 = theory.parseChord(track.progression[0]);
    if (phrase.kind === "riff") assert.strictEqual(first.midi % 12, chord0.rootPc, label + " starts on the root");
    checked += 1;
  });
});

console.log("riff checks passed: " + checked + " phrases on " + catalog.tracks.length + " tracks");
