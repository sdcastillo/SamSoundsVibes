/* Minimal Standard MIDI File (type 0) read/write + WebAudio note scheduler for Song Studio. */
(function (root) {
  "use strict";

  var TPQ = 480;

  function encodeVarLen(value) {
    var buffer = [];
    var v = value >>> 0;
    buffer.push(v & 0x7f);
    while (v > 0x7f) {
      v >>>= 7;
      buffer.unshift((v & 0x7f) | 0x80);
    }
    return buffer;
  }

  function writeStr(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function pushBytes(arr, chunk) {
    for (var i = 0; i < chunk.length; i++) arr.push(chunk[i]);
  }

  /** @param {{beat:number,midi:number,durBeats:number,velocity?:number}[]} noteEvents */
  function buildSmfFromNoteEvents(noteEvents, bpm) {
    bpm = bpm || 120;
    var micro = Math.round(60000000 / bpm);
    var track = [];
    function evt(delta, bytes) {
      pushBytes(track, encodeVarLen(delta));
      pushBytes(track, bytes);
    }
    var lastTick = 0;
    evt(0, [0xff, 0x51, 0x03, (micro >> 16) & 0xff, (micro >> 8) & 0xff, micro & 0xff]);
    evt(0, [0xc0, 0x1d]); /* acoustic guitar (nylon) */
    var sorted = noteEvents.slice().sort(function (a, b) {
      return a.beat - b.beat || a.midi - b.midi;
    });
    sorted.forEach(function (n) {
      var startTick = Math.round(n.beat * TPQ);
      var durTick = Math.max(1, Math.round((n.durBeats || 0.25) * TPQ));
      var vel = n.velocity == null ? 0x5a : n.velocity;
      evt(Math.max(0, startTick - lastTick), [0x90, n.midi & 0x7f, vel & 0x7f]);
      lastTick = startTick;
      evt(durTick, [0x80, n.midi & 0x7f, 0x40]);
      lastTick = startTick + durTick;
    });
    evt(0, [0xff, 0x2f, 0x00]);

    var header = []
      .concat(writeStr("MThd"), [0, 0, 0, 6, 0, 0, 0, 0, 0, 1])
      .concat([(TPQ >> 8) & 0xff, TPQ & 0xff]);
    var trkLen = track.length;
    var trackHead = writeStr("MTrk").concat([
      (trkLen >> 24) & 0xff,
      (trkLen >> 16) & 0xff,
      (trkLen >> 8) & 0xff,
      trkLen & 0xff
    ]);
    return new Uint8Array(header.concat(trackHead, track));
  }

  function readVarLen(data, pos) {
    var value = 0;
    while (pos.i < data.length) {
      var b = data[pos.i++];
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  }

  /** Parse type-0 SMF → note list in beats at file tempo. */
  function parseSmf(arrayBuffer) {
    var data = new Uint8Array(arrayBuffer);
    if (data.length < 14 || String.fromCharCode(data[0], data[1], data[2], data[3]) !== "MThd") {
      throw new Error("Not a MIDI file");
    }
    var numTracks = (data[10] << 8) | data[11];
    var tpq = (data[12] << 8) | data[13];
    if (!tpq) tpq = TPQ;
    var pos = { i: 14 };
    var bpm = 120;
    var notes = [];
    var active = {};

    function parseTrack(end) {
      var tick = 0;
      var running = 0;
      while (pos.i < end) {
        var delta = readVarLen(data, pos);
        tick += delta;
        if (pos.i >= end) break;
        var status = data[pos.i];
        if (status < 0x80) status = running;
        else {
          pos.i++;
          running = status;
        }
        var cmd = status & 0xf0;
        if (cmd === 0x90) {
          var note = data[pos.i++];
          var vel = data[pos.i++];
          if (vel > 0) active[note] = { tick: tick, vel: vel };
          else if (active[note]) {
            notes.push({
              beat: active[note].tick / tpq,
              midi: note,
              durBeats: (tick - active[note].tick) / tpq,
              velocity: active[note].vel
            });
            delete active[note];
          }
        } else if (cmd === 0x80) {
          var offNote = data[pos.i++];
          pos.i++;
          if (active[offNote]) {
            notes.push({
              beat: active[offNote].tick / tpq,
              midi: offNote,
              durBeats: (tick - active[offNote].tick) / tpq,
              velocity: active[offNote].vel
            });
            delete active[offNote];
          }
        } else if (status === 0xff) {
          var meta = data[pos.i++];
          var len = readVarLen(data, pos);
          if (meta === 0x51 && len === 3) {
            var micro = (data[pos.i] << 16) | (data[pos.i + 1] << 8) | data[pos.i + 2];
            bpm = 60000000 / micro;
          }
          pos.i += len;
        } else if (cmd === 0xc0 || cmd === 0xd0) {
          pos.i += 1;
        } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
          pos.i += 2;
        } else if (cmd === 0xf0) {
          var len = readVarLen(data, pos);
          pos.i += len;
        } else {
          pos.i++;
        }
      }
    }

    for (var t = 0; t < numTracks; t++) {
      if (String.fromCharCode(data[pos.i], data[pos.i + 1], data[pos.i + 2], data[pos.i + 3]) !== "MTrk") break;
      pos.i += 4;
      var len = (data[pos.i] << 24) | (data[pos.i + 1] << 16) | (data[pos.i + 2] << 8) | data[pos.i + 3];
      pos.i += 4;
      parseTrack(pos.i + len);
      pos.i += len;
    }
    notes.sort(function (a, b) { return a.beat - b.beat; });
    return { bpm: bpm, tpq: tpq, notes: notes };
  }

  function noteEventsFromParsedTab(parsed, startBar, endBar) {
    var out = [];
    parsed.notes.forEach(function (n) {
      if (n.rest) return;
      var bar = n.bar;
      if (bar < startBar || bar >= endBar) return;
      out.push({
        beat: n.beat,
        midi: n.midi,
        durBeats: n.beats,
        velocity: 0x5a
      });
    });
    return out;
  }

  var SongMidi = {
    TPQ: TPQ,
    buildSmfFromNoteEvents: buildSmfFromNoteEvents,
    parseSmf: parseSmf,
    noteEventsFromParsedTab: noteEventsFromParsedTab
  };
  root.SongMidi = SongMidi;
  if (typeof module === "object" && module.exports) {
    module.exports = { SongMidi: SongMidi };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
