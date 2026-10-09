# How this amp turns a guitar into sound

The Scarlett Solo samples the string. `guitar_amp_engine.py` changes those samples. The Logi headset turns the result back into moving air. This note is the path between those two waves, and where convolution and Fourier math actually sit in the code.

A sound in the room is air pressure changing over time. The interface measures that pressure 48,000 times a second and stores each measurement as a number. Those numbers are the signal. Every stage below is a rule for making a new list of numbers from the old one. At the end, the headset’s converter turns the numbers into voltage, the driver moves, and the air pressure in your ear is a new wave.

## A held note is a Fourier series

A string that rings on one pitch is close to periodic. A periodic wave can be written as a sum of sines: the fundamental, then twice that frequency, three times, and so on. That sum is a Fourier series. The fundamental is the note the tuner names. The higher terms are the harmonics, and their sizes are a big part of why a guitar does not sound like a flute playing the same pitch.

Drive rewrites that series. The engine multiplies the string by the drive knob, bends it with a soft absolute-value term, then passes it through `tanh` twice. `tanh` flattens the peaks. A flattened wave needs extra odd harmonics in its Fourier series, so the tone gets brighter and harsher as the knob goes up. The small absolute-value bend is asymmetric, so even harmonics show up too. Nothing in that stage looks at a spectrum. The new harmonics are just what that new shape is made of.

The tuner reads the string before this bend. It hears the series the string actually played.

## The chain, in order

Each block is 256 samples, about 5.3 milliseconds at 48 kHz.

1. Pick the guitar channel on the Solo. The instrument jack is usually the louder of the two inputs.
2. Copy that clean wave into the tuner.
3. Subtract a 64-sample moving average. That average is a tiny convolution, a low-pass. Subtracting it leaves a high-pass, so subsonic rumble drops out.
4. A noise gate follows the level and turns the wave down when the string is quiet.
5. The wah is a resonant band-pass. Its center frequency moves with the knob.
6. Drive and `tanh` clipping, as above.
7. Bass, mid, treble, and presence. Four biquads: a low shelf at 120 Hz, a peak at 800 Hz, and high shelves at 3.2 kHz and 4.8 kHz.
8. The cabinet. Convolution with one of the impulse responses from the POD Go backup, then a low cut and a high cut.
9. A short Haas delay spreads the wave left and right. A longer delay, with feedback, is the echo. A last `tanh` keeps the sum inside the range the converter can play.

Factory presets from the POD Go backup set these knobs. The backup stores the original block names and values. It does not contain Line 6’s amp circuits, so a Soldano preset uses Soldano’s drive and tone numbers on this chain, and a real cabinet recording from the same file.

## Convolution is the cabinet

An impulse response is the wave a cabinet and mic make when you feed them a single click. The files in `irs/` are those clicks: 48 kHz, 32-bit float, 2048 samples, about 43 ms. They were pulled out of `POD Go Backup 2023-Nov-08.pgb`.

Playing a guitar through that cabinet is convolution. Every sample of the distorted string is replaced by a copy of the click, scaled by that sample, and the copies are added where they overlap:

```text
y[n] = x[n] h[0] + x[n-1] h[1] + x[n-2] h[2] + ...
```

`x` is the amp. `h` is the cabinet. `y` is what the mic would have heard. A Marshall IR and a Mesa IR are different `h`, so the same distorted note comes out with a different body and top end. Cab mix is a blend of `y` back with the dry amp wave. The low cut and high cut after the convolution are one-pole filters, the same idea as turning down the rumble and the hiss on that mic.

Doing the sum above sample by sample, for a 2048-tap `h`, on every block, is more work than this callback can spend. The engine uses a fact about the Fourier transform instead.

## The Fourier transform, then back to a wave

A Fourier series fits a tone that repeats forever. A Fourier transform does the same job for a finite chunk: it writes the chunk as sinusoids with their own strengths and phases. The FFT is the fast version for a block whose length is a power of two. `numpy.fft.rfft` only keeps the positive frequencies, which is enough for a real guitar wave.

Convolution in time is multiplication in that frequency picture. The cabinet’s click is transformed once, when the preset is loaded, and stored. Each audio block is transformed, multiplied by that stored spectrum, and inverse-transformed with `irfft`. The inverse transform is the step that turns the sines back into a sound wave: a list of pressures again, in the original order.

One detail keeps the seams from clicking. Multiplying two FFTs convolves the block as if it wrapped around. The cabinet also rings for 2048 samples after the block ends. The FFT is sized to the next power of two that can hold the block plus that ring. The samples that belong to the future are saved as a tail and added onto the next block. That is overlap-add. The tail lives on the audio thread, so changing presets can swap the cabinet spectrum without clearing the buffer mid-block.

The same transform shows up in the tuner, turned around. The Wiener–Khinchin relation says the autocorrelation of a wave is the inverse Fourier transform of its power spectrum. `estimate_pitch` windows about a third of a second of the clean string, takes `rfft`, multiplies the spectrum by its conjugate, and `irfft`s that product. The result is how well the wave matches a delayed copy of itself. The McLeod pitch method normalizes those peaks and keeps the earliest strong one, so a strong second harmonic is not reported as a note an octave high. Frequency is the sample rate divided by that delay. Cents are how far that frequency sits from the nearest note in the equal-tempered series based on 440 Hz. The E A D G B E row lights up when the pitch is within about half a semitone of that open string.

## Filters that stay in time

The wah, the tone stack, and the cabinet’s low and high cuts never build an FFT. Each output sample is a weighted sum of a few recent input samples and a few recent output samples. That recurrence is a biquad, or a one-pole filter for the cuts. The Fourier transform of the filter’s own impulse response is its frequency response: the low shelf really does lift the lows, and the wah really is a moving peak. They are the same family of idea as the cabinet, with an impulse response so short that the direct sum is cheaper than an FFT.

The delay is a shift. The ring buffer holds the cabinet’s output and reads it back tens or hundreds of milliseconds later. Feedback adds that echo into later echoes. A delayed copy of a wave, mixed with the original, is a comb: the Fourier transform of that mix has notches at multiples of one over the delay time. The stereo width is a much shorter copy of the same trick, the Haas delay, with the louder copy swapped between left and right.

## Back into the room

`render` returns two channels of float samples. PipeWire takes that stream (`pw-cat`, 32-bit float, 48 kHz) and hands it to the system default sink. When that sink is the Logi USB headset, the headset’s converter builds a voltage from each sample, the drivers move, and the pressure in the earcups is the wave you hear. The tuner’s note, the cabinet’s click, and the clipped harmonic series are all inside that pressure. They got there by rewriting the samples, sometimes with an explicit Fourier transform, and then inverting it back into time.

## Practice mode sits beside that chain

The Practice tab does not send the backing track through the drive, the cabinet, or the delay. The browser plays the track on its own, and the guitar keeps the path above. Open the page on the same machine as the amp so both come out of the same headset. Guitar loudness is still the Volume knob. Backing loudness is the slider in the Practice tab.

The shipped loops are original synthesis — drums, bass, and the chords named in the catalog — dedicated to the public domain (CC0). They are not recordings of other people’s songs. Rebuild them, after you edit a progression, with:

```bash
python3 amp_ui/practice/generate_backing_tracks.py
```

### Using it

1. Start the amp UI and open the Practice tab. The tuner stays up. The amp keeps running if you flip back to the knobs.
2. Pick a loop. The key, tempo, and chord bars are under the transport. The lit bar follows the playhead. Tap a bar to jump there.
3. Hit Play. Loop is on until you turn it off.
4. Set Guitar (amp volume) and Backing track until the mix is one you can solo over.
5. Pick a scale. Orange dots are the root. Gold dots are the rest of the scale. Blue dots are the notes a fuller scale adds on top of its pentatonic box.
6. Open a lesson. Checkmarks stay in this browser (`localStorage`). Clear checkmarks wipes only the track you are on.

Each starter track has four lessons:

- **Learn the shape** — the five pentatonic boxes, one position at a time. Full neck clears the highlight.
- **Target the chord tones** — while the track plays, notes that belong to the current chord are bright. The line under the chords names which of those tones are in the scale you picked, and which chord tones the scale leaves out.
- **A phrase** — tab, in the scale, even eighths.
- **Phrasing** — a whole-step bend whose target is in the scale, plus a call-and-response or space tip for that progression.

### Adding a track

Edit `amp_ui/static/practice/tracks.json`. Drop the audio in `amp_ui/static/practice/audio/` and point `file` at it. Minimum fields:

```json
{
  "id": "b-minor-vamp",
  "title": "B Minor Vamp",
  "file": "audio/b-minor-vamp.wav",
  "key": "B minor",
  "tonic": "B",
  "mode": "minor",
  "bpm": 100,
  "timeSignature": "4/4",
  "feel": "rock",
  "progression": ["Bm", "G", "Bm", "A"]
}
```

`mode` is `minor`, `major`, `dorian`, or `mixolydian`. If you omit `scales`, the page suggests pentatonic, blues, and the diatonic scale that fits that mode, with a note about when each one clashes. If you omit `lessons`, it builds the four lesson types from the first scale and the progression. `feel` is only for the synthesizer (`shuffle`, `rock`, `pop`, `funk`). A file you already have can use any `feel`; the player does not read it.

To write the scales yourself, add a `scales` array. One entry should have `"home": true`. That scale has to contain every chord tone in the progression. `intervals` are semitones from `root`. `notes` must match those intervals (A blues is A C D Eb E G, not a respelling that hides the flat 5). `why` should say when the scale fits this progression and which note clashes, if one does.

### Adding a lesson

Put a `lessons` array on the track. If you include it, it replaces the automatic set, so include every lesson you want shown. A lesson is `id`, `title`, `summary`, `kind`, `scaleId`, and `steps`.

`kind` is `boxes`, `chord-tones`, `tab`, or `tip`. `scaleId` matches a scale `id` on that track.

A step can set `"box": 1` through `5`. The page fills the fret range from the scale, so you do not hardcode fret numbers. A tab step can use `notes` (`{"string": "E", "fret": 5}`, strings `e B G D A E`, high e lowercase) or a `tab` array of six strings. A bend step can include `"bend": {"string": "B", "fret": 8, "semitones": 2}`. The page names the start note and the target. Both have to be in the scale.

My file, on the same tab, plays a local audio file. You set the tonic and the mode. Suggestions and lessons are computed from that. Optional tempo and a space-separated progression turn on the chord bar and the live chord-tone highlight. The page does not guess the key: a loop’s notes often belong equally to the relative major, or to the IV.

Check the catalog after an edit:

```bash
node amp_ui/practice/test_theory.js
```

That checks spellings, that each home scale contains the progression, that tab notes and bend targets sit in the named scale, that every pentatonic box contains a root, and that the shipped wavs match the tempos in the JSON.
