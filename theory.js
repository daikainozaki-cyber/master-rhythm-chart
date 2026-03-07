// ========================================
// THEORY — Chord Name Parsing & MIDI Conversion
// ========================================

// Adapters: delegate to pad-core (padParseRoot, padParseChordName)
function parseRoot(str) { return padParseRoot(str); }
function parseChordName(input) { return padParseChordName(input); }

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

// Voice-led voicing: bass fixed low, upper voices placed nearest to
// previous chord's center for compact cluster voicing
function getVoiceLeadVoicing(parsed) {
  if (!parsed) return [];
  const { root, intervals, bass } = parsed;

  let ivs = [...intervals];

  // Omit perfect 5th for 5+ note chords (tension chords)
  if (intervals.length >= 5) {
    ivs = ivs.filter(iv => iv !== 7);
  }

  // Upper voice pitch classes (exclude root — bass handles it)
  const upperIvs = ivs.filter(iv => iv !== 0);
  const upperPcs = upperIvs.map(iv => (root + iv) % 12);

  // If no upper voices (power chord etc), just return bass + root
  if (upperPcs.length === 0) {
    const bassPc = (bass !== null) ? bass : root;
    let bassMidi = 36 + bassPc;
    if (bassMidi < 36) bassMidi += 12;
    if (bassMidi > 48) bassMidi -= 12;
    return [bassMidi, 60 + root];
  }

  // Center from previous voicing, clamped to C4-G4 range
  let center;
  if (_vlPrev && _vlPrev.length > 0) {
    center = _vlPrev.reduce((s, m) => s + m, 0) / _vlPrev.length;
  } else {
    center = 63; // Eb4
  }
  if (center < 60) center = 60; // floor C4
  if (center > 67) center = 67; // ceil G4

  // Place each voice nearest to center independently
  let midi = upperPcs.map(pc => nearestMidi(pc, center));
  midi.sort((a, b) => a - b);

  // Save upper voicing for voice leading (without bass)
  _vlPrev = [...midi];

  // Bass note: slash chord uses explicit bass, otherwise root
  const bassPc = (bass !== null) ? bass : root;
  let bassMidi = 36 + bassPc; // C2 octave base
  while (bassMidi >= midi[0]) bassMidi -= 12;
  if (bassMidi < 36) bassMidi += 12; // floor C2

  midi = [bassMidi, ...midi];

  // Clamp to playable range
  midi = midi.filter(m => m >= 36 && m <= 84);

  return midi;
}

// ======== PCS-BASED BUILDER FUNCTIONS (synced with 64 Pad Explorer) ========
// FLAT_MAJOR_KEYS, padApplyTension — from pad-core

// Enharmonic-aware note name using current key context
function builderPcName(pc) {
  let refKey = ChartState.key;
  if (ChartState.scaleType === 'minor') {
    refKey = (ChartState.key + 3) % 12; // relative major
  }
  return FLAT_MAJOR_KEYS.has(refKey) ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
}

// Apply tension modifications to a base PCS (adapter → pad-core)
function applyTension(basePCS, mods) {
  return padApplyTension(basePCS, mods);
}

// Get active PCS from BuilderState
function getBuilderPCS() {
  if (BuilderState.root === null || !BuilderState.quality) return null;
  let pcs = [...BuilderState.quality.pcs];
  if (BuilderState.tension) pcs = applyTension(pcs, BuilderState.tension.mods);
  return pcs;
}

// Generate chord name string from BuilderState
function getBuilderChordName() {
  if (BuilderState.root === null) return '';
  let name = builderPcName(BuilderState.root);
  if (BuilderState.quality) name += BuilderState.quality.name;
  if (BuilderState.tension) {
    let tl = BuilderState.tension.label.replaceAll(')\n(', ',').replace(/\n/g, '');
    // In 7th chord context, b5 → #11 (tension notation)
    const has7th = BuilderState.quality && (
      BuilderState.quality.pcs.includes(10) || BuilderState.quality.pcs.includes(11) ||
      (BuilderState.quality.pcs.includes(9) && BuilderState.quality.pcs.includes(6))
    );
    if (has7th) {
      if (tl === 'b5') {
        tl = '#11';
      } else if (tl.startsWith('b5(') || tl.startsWith('b5,')) {
        const inner = tl.slice(2).replace(/[()]/g, '');
        const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
        parts.push('#11');
        const ORDER = {'b9':1,'#9':2,'9':3,'11':4,'#11':5,'b13':6,'13':7};
        parts.sort((a, b) => (ORDER[a] || 99) - (ORDER[b] || 99));
        tl = parts.join(',');
      }
    }
    // aug → (#5) on non-Maj qualities
    if (BuilderState.quality && BuilderState.quality.name !== '') {
      if (tl === 'aug') {
        tl = '(#5)';
      } else if (tl.startsWith('aug(')) {
        const inner = tl.slice(4, -1);
        const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
        parts.push('#5');
        const ORDER = {'#5':0,'b9':1,'#9':2,'9':3,'11':4,'#11':5,'b13':6,'13':7};
        parts.sort((a, b) => (ORDER[a] || 99) - (ORDER[b] || 99));
        tl = '(' + parts.join(',') + ')';
      }
    }
    const noWrap = tl.startsWith('(') || tl.startsWith('sus') || tl.startsWith('aug') ||
                   tl.startsWith('add') || tl.startsWith('b5') || tl.startsWith('6');
    if (noWrap) {
      name += tl;
    } else {
      name += '(' + tl + ')';
    }
  }
  if (BuilderState.bass !== null) {
    name += '/' + builderPcName(BuilderState.bass);
  }
  return name;
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
