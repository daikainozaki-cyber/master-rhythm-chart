// ========================================
// AUDIO ENGINE — Simple Oscillator Synth
// ========================================

let audioCtx = null;
let masterGain = null;
let reverbGain = null;
const voices = new Map(); // midi → { oscs, gain }

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.4;

  // Simple reverb (convolver with noise IR)
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 1.2);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  const reverb = audioCtx.createConvolver();
  reverb.buffer = buf;
  reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.12;
  reverb.connect(reverbGain);
  reverbGain.connect(audioCtx.destination);

  // Compressor
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.knee.value = 10;
  comp.connect(audioCtx.destination);

  masterGain.connect(comp);
  masterGain.connect(reverb);
}

function ensureAudio() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function noteOn(midi) {
  ensureAudio();
  if (voices.has(midi)) noteOff(midi);

  const freq = midiToFreq(midi);
  const now = audioCtx.currentTime;

  // Voice gain with attack envelope
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
  // Gentle decay to sustain
  gain.gain.setTargetAtTime(0.08, now + 0.015, 0.3);
  gain.connect(masterGain);

  // Triangle oscillator (fundamental)
  const osc1 = audioCtx.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.value = freq;
  osc1.connect(gain);
  osc1.start(now);

  // Sine oscillator (1 octave up, softer — EP character)
  const osc2 = audioCtx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;
  const g2 = audioCtx.createGain();
  g2.gain.value = 0.25;
  osc2.connect(g2);
  g2.connect(gain);
  osc2.start(now);

  voices.set(midi, { oscs: [osc1, osc2], gain, subGain: g2 });
}

function noteOff(midi) {
  const v = voices.get(midi);
  if (!v) return;
  const now = audioCtx.currentTime;
  // Release envelope
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setValueAtTime(v.gain.gain.value, now);
  v.gain.gain.linearRampToValueAtTime(0, now + 0.15);
  // Stop oscillators after release
  v.oscs.forEach(o => { try { o.stop(now + 0.2); } catch (_) {} });
  setTimeout(() => { try { v.gain.disconnect(); } catch (_) {} }, 300);
  voices.delete(midi);
}

function playChordAudio(midiNotes) {
  stopAllAudio();
  midiNotes.forEach(m => noteOn(m));
}

function stopAllAudio() {
  for (const midi of [...voices.keys()]) noteOff(midi);
}

// Short stab for input feedback (play then auto-release)
function playChordStab(midiNotes, durationMs) {
  playChordAudio(midiNotes);
  setTimeout(stopAllAudio, durationMs || 800);
}

// Resume audio context on first user interaction
document.addEventListener('mousedown', () => ensureAudio(), { once: true });
document.addEventListener('touchstart', () => ensureAudio(), { once: true });
document.addEventListener('keydown', () => ensureAudio(), { once: true });
