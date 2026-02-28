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

  return {
    root: rootResult.pc,
    quality: matchedKey,
    intervals: [...intervals],
    bass,
    displayName: input,
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
