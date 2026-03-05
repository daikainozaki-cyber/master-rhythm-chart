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

  // 4b. Fallback: compound tension like "m7(9,11)" or "7(b9,#11)"
  if (matchedKey === null) {
    const parenMatch = qualityStr.match(/^(.*?)\(([^)]+)\)$/);
    if (parenMatch) {
      const baseQ = parenMatch[1];
      const tensionStr = parenMatch[2];
      if (QUALITY_INTERVALS[baseQ] !== undefined) {
        const TENSION_MAP = {
          '9': 14, 'b9': 13, '#9': 15,
          '11': 17, '#11': 18,
          '13': 21, 'b13': 20,
          '#5': 8, 'b5': 6,
        };
        const baseIntervals = [...QUALITY_INTERVALS[baseQ]];
        const tensions = tensionStr.split(',').map(s => s.trim());
        let valid = true;
        for (const t of tensions) {
          const iv = TENSION_MAP[t];
          if (iv === undefined) { valid = false; break; }
          if (t === 'b5' || t === '#5') {
            const idx = baseIntervals.indexOf(7);
            if (idx >= 0) baseIntervals[idx] = iv;
            else if (!baseIntervals.includes(iv)) baseIntervals.push(iv);
          } else {
            if (!baseIntervals.includes(iv)) baseIntervals.push(iv);
          }
        }
        if (valid) {
          baseIntervals.sort((a, b) => a - b);
          const rootName = mainPart.slice(0, rootResult.len);
          const displayQuality = (typeof QUALITY_DISPLAY !== 'undefined' && QUALITY_DISPLAY[baseQ])
            ? QUALITY_DISPLAY[baseQ] : baseQ;
          let displayName = rootName + displayQuality + '(' + tensions.join(',') + ')';
          if (bass !== null) {
            const bassStr2 = input.slice(input.lastIndexOf('/') + 1);
            displayName += '/' + bassStr2[0].toUpperCase() + bassStr2.slice(1);
          }
          return {
            root: rootResult.pc,
            quality: qualityStr,
            intervals: baseIntervals,
            bass,
            displayName,
          };
        }
      }
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
