// ========================================
// AUDIO ENGINE — WebAudioFont (migrated from 64 Pad Explorer)
// ========================================

let audioCtx = null;
let masterGain = null;
let masterComp = null;
let masterReverb = null;
let masterReverbGain = null;
let wafPlayer = null;

const PRESETS = {
  'Rhodes 1':  { global: '_tone_0040_FluidR3_GM_sf2_file', label: 'Rhodes 1' },
  'Rhodes 2':  { global: '_tone_0040_GeneralUserGS_sf2_file', label: 'Rhodes 2' },
  'FM EP 1':   { global: '_tone_0050_FluidR3_GM_sf2_file', label: 'FM EP 1' },
  'Organ':     { global: '_tone_0160_FluidR3_GM_sf2_file', label: 'Drawbar Organ' },
};

const AudioState = {
  presetKey: 'Rhodes 1',
  instrument: null,
  muted: false,
};

// --- Active voices ---
const activeVoices = new Map(); // midi → { envelope }

// ======== INITIALIZATION ========

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.6;

  // Compressor
  masterComp = audioCtx.createDynamicsCompressor();
  masterComp.threshold.value = -12;
  masterComp.ratio.value = 4;
  masterComp.knee.value = 12;
  masterComp.connect(audioCtx.destination);

  // Reverb (noise-based impulse response)
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 1.5);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
  }
  masterReverb = audioCtx.createConvolver();
  masterReverb.buffer = buf;
  masterReverbGain = audioCtx.createGain();
  masterReverbGain.gain.value = 0.08;
  masterReverb.connect(masterReverbGain);
  masterReverbGain.connect(masterComp);

  // Route: masterGain → comp + reverb
  masterGain.connect(masterComp);
  masterGain.connect(masterReverb);

  // WebAudioFont player
  wafPlayer = new WebAudioFontPlayer();

  // Decode all presets
  Object.values(PRESETS).forEach(p => {
    const data = window[p.global];
    if (data) wafPlayer.loader.decodeAfterLoading(audioCtx, data);
  });

  // Set initial instrument
  const initData = window[PRESETS[AudioState.presetKey].global];
  AudioState.instrument = initData || null;
}

function ensureAudio() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// ======== NOTE ON / OFF ========

function noteOn(midi, velocity) {
  ensureAudio();
  velocity = velocity || 0.7;

  // Kill same note if re-triggered
  const existing = activeVoices.get(midi);
  if (existing) {
    try { existing.envelope.cancel(); } catch (_) {}
    activeVoices.delete(midi);
  }

  if (!AudioState.instrument || !wafPlayer) return;

  const envelope = wafPlayer.queueWaveTable(
    audioCtx, masterGain, AudioState.instrument,
    0, midi, 99999, velocity
  );
  if (envelope) {
    activeVoices.set(midi, { envelope });
  }
}

function noteOff(midi) {
  const v = activeVoices.get(midi);
  if (!v) return;
  try { v.envelope.cancel(); } catch (_) {}
  activeVoices.delete(midi);
}

// ======== CHORD PLAYBACK ========

function playChordAudio(midiNotes) {
  stopAllAudio();
  if (AudioState.muted) return;
  midiNotes.forEach(m => noteOn(m));
}

function stopAllAudio() {
  for (const [midi, v] of [...activeVoices.entries()]) {
    try { v.envelope.cancel(); } catch (_) {}
  }
  activeVoices.clear();
}

function playChordStab(midiNotes, durationMs) {
  if (AudioState.muted) return;
  playChordAudio(midiNotes);
  setTimeout(stopAllAudio, durationMs || 800);
}

function toggleMute() {
  AudioState.muted = !AudioState.muted;
  const btn = document.getElementById('btn-mute');
  if (btn) {
    btn.textContent = AudioState.muted ? 'Muted' : 'Mute';
    btn.classList.toggle('active', AudioState.muted);
  }
  if (AudioState.muted) stopAllAudio();
}

// ======== CLICK / METRONOME ========

function playClick(accent) {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.type = 'sine';
  osc.frequency.value = accent ? 1200 : 800;
  gain.gain.setValueAtTime(accent ? 0.25 : 0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination); // bypass reverb for crisp click
  osc.start(now);
  osc.stop(now + 0.06);
}

// ======== PRESET / VOLUME / REVERB ========

function setPreset(name) {
  if (!PRESETS[name]) return;
  AudioState.presetKey = name;
  const data = window[PRESETS[name].global];
  if (data) {
    ensureAudio();
    wafPlayer.loader.decodeAfterLoading(audioCtx, data);
    AudioState.instrument = data;
  }
  saveSoundSettings();
}

function setVolume(val) {
  if (!masterGain) return;
  masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
}

function setReverb(val) {
  if (!masterReverbGain) return;
  masterReverbGain.gain.setValueAtTime(val, audioCtx.currentTime);
}

// ======== PERSISTENCE ========

function saveSoundSettings() {
  try {
    const s = { preset: AudioState.presetKey };
    const vol = document.getElementById('vol-slider');
    const rev = document.getElementById('rev-slider');
    if (vol) s.volume = vol.value;
    if (rev) s.reverb = rev.value;
    if (typeof ChartState !== 'undefined') s.clickPattern = ChartState.clickPattern;
    localStorage.setItem('rhythm-chart-sound', JSON.stringify(s));
  } catch (_) {}
}

function loadSoundSettings() {
  try {
    const raw = localStorage.getItem('rhythm-chart-sound');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.preset && PRESETS[s.preset]) setPreset(s.preset);
    const vol = document.getElementById('vol-slider');
    const rev = document.getElementById('rev-slider');
    if (vol && s.volume !== undefined) { vol.value = s.volume; setVolume(parseFloat(s.volume)); }
    if (rev && s.reverb !== undefined) { rev.value = s.reverb; setReverb(parseFloat(s.reverb)); }
    const sel = document.getElementById('preset-select');
    if (sel) sel.value = AudioState.presetKey;
    if (s.clickPattern && typeof ChartState !== 'undefined') {
      ChartState.clickPattern = s.clickPattern;
      const cs = document.getElementById('click-select');
      if (cs) cs.value = s.clickPattern;
    }
  } catch (_) {}
}

// ======== INIT ON INTERACTION ========

document.addEventListener('mousedown', () => ensureAudio(), { once: true });
document.addEventListener('touchstart', () => ensureAudio(), { once: true });
document.addEventListener('keydown', () => ensureAudio(), { once: true });
