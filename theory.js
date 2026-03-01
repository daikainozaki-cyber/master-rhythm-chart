// ========================================
// THEORY — Chord Name Parsing & MIDI Conversion
// ========================================

// Parse root note from start of string
// Returns { pc, len } or null
function parseRoot(str) {
  if (!str || str.length === 0) return null;
  const first = str[0].toUpperCase();
  if (first < 'A' || first > 'G') return null;

  let name = first;
  if (str.length > 1) {
    const second = str[1];
    if (second === '#' || second === '\u266F') name += '#';      // # or ♯
    else if (second === 'b' || second === '\u266D') name += 'b'; // b or ♭
  }

  const pc = ROOT_TO_PC[name];
  return pc !== undefined ? { pc, len: name.length } : null;
}

// Parse a chord name string into structured data
// Returns { root, quality, intervals, bass, displayName } or null
function parseChordName(input) {
  if (!input) return null;
  input = input.trim();
  if (!input) return null;

  // Normalize: uppercase first letter
  input = input[0].toUpperCase() + input.slice(1);

  // 1. Extract bass note (slash chord: /X at end)
  let bass = null;
  let mainPart = input;
  const slashIdx = input.lastIndexOf('/');
  if (slashIdx > 0) {
    const bassStr = input.slice(slashIdx + 1);
    const bassResult = parseRoot(bassStr);
    if (bassResult && bassResult.len === bassStr.length) {
      bass = bassResult.pc;
      mainPart = input.slice(0, slashIdx);
    }
  }

  // 2. Parse root note
  const rootResult = parseRoot(mainPart);
  if (!rootResult) return null;

  // 3. Extract quality string (everything after root)
  const qualityStr = mainPart.slice(rootResult.len);

  // 4. Match quality (longest match first)
  let matchedKey = null;
  for (const key of QUALITY_KEYS) {
    if (qualityStr === key) {
      matchedKey = key;
      break;
    }
  }
  if (matchedKey === null) return null;

  const intervals = QUALITY_INTERVALS[matchedKey];

  // Build canonical display name (resolve aliases)
  const rootName = mainPart.slice(0, rootResult.len);
  const displayQuality = (typeof QUALITY_DISPLAY !== 'undefined' && QUALITY_DISPLAY[matchedKey])
    ? QUALITY_DISPLAY[matchedKey] : matchedKey;
  let displayName = rootName + displayQuality;
  if (bass !== null) {
    const bassStr = input.slice(input.lastIndexOf('/') + 1);
    displayName += '/' + bassStr[0].toUpperCase() + bassStr.slice(1);
  }

  return {
    root: rootResult.pc,
    quality: matchedKey,
    intervals: [...intervals],
    bass,
    displayName,
  };
}

// Convert parsed chord to MIDI note array
// Root placed at MIDI 48 (C3), bass below if present
function chordToMidi(parsed) {
  if (!parsed) return [];
  const { root, intervals, bass } = parsed;
  const rootMidi = 48 + root;
  const notes = intervals.map(iv => rootMidi + iv);

  // Slash chord: place bass note below the voicing
  if (bass !== null) {
    let bassMidi = 36 + bass; // Start in C2 octave
    while (bassMidi >= notes[0]) bassMidi -= 12;
    if (bassMidi < 24) bassMidi += 12; // Floor at C1
    notes.unshift(bassMidi);
  }

  return notes;
}

// MIDI note number → frequency (A4 = 440Hz)
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ======== VOICE LEADING ========

let _vlPrev = null;

function resetVoiceLead() { _vlPrev = null; }

// Find MIDI note with given pitch class nearest to target
function nearestMidi(pc, target) {
  const oct = Math.floor(target / 12);
  const mid = oct * 12 + pc;
  let best = mid;
  if (Math.abs(mid - 12 - target) < Math.abs(best - target)) best = mid - 12;
  if (Math.abs(mid + 12 - target) < Math.abs(best - target)) best = mid + 12;
  return best;
}

// Voice-led voicing: compact cluster, voices near previous center
// Omits perfect 5th when chord has 5+ notes (tension chords)
function getVoiceLeadVoicing(parsed) {
  if (!parsed) return [];
  const { root, intervals, bass } = parsed;

  // Omit perfect 5th for 5+ note chords
  let ivs = [...intervals];
  if (ivs.length >= 5) {
    ivs = ivs.filter(iv => iv !== 7);
  }

  // All pitch classes from intervals
  const pcs = ivs.map(iv => (root + iv) % 12);

  // Center from previous voicing or A3 area (sweet spot for Rhodes/EP)
  let center;
  if (_vlPrev && _vlPrev.length > 0) {
    center = _vlPrev.reduce((s, m) => s + m, 0) / _vlPrev.length;
  } else {
    center = 57;
  }

  // Place each voice nearest to center — compact cluster
  let midi = pcs.map(pc => nearestMidi(pc, center));
  midi.sort((a, b) => a - b);

  // Slash chord: place bass note below the voicing
  if (bass !== null) {
    let bassMidi = nearestMidi(bass, center);
    while (bassMidi >= midi[0]) bassMidi -= 12;
    if (bassMidi < 36) bassMidi += 12;
    midi = [bassMidi, ...midi];
  }

  // Clamp to playable range
  midi = midi.filter(m => m >= 36 && m <= 78);

  _vlPrev = midi;
  return midi;
}

// Generate diatonic chords for a given key and scale type
// Returns array of { name, degree } (7 chords)
function getDiatonicChords(keyPc, scaleType, use7th) {
  const scale = SCALE_TYPES.find(s => s.id === scaleType);
  if (!scale) return [];
  const qualities = use7th ? scale.seventhQualities : scale.triadQualities;

  return scale.intervals.map((interval, i) => {
    const rootPc = (keyPc + interval) % 12;
    const rootName = NOTE_NAMES_SHARP[rootPc];
    const quality = qualities[i];
    return { name: rootName + quality, degree: i + 1 };
  });
}
