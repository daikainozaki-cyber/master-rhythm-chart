// ========================================
// DATA & CONSTANTS — Rhythm Chart App
// ========================================

const NOTE_NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_NAMES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

// Root note name → pitch class (0-11)
const ROOT_TO_PC = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

// Pitch class → display name (sharp preference by default)
function pcToName(pc) { return NOTE_NAMES_SHARP[pc]; }

// Quality string → intervals (semitones from root)
// Sorted by key length desc for longest-match parsing
const QUALITY_INTERVALS = {
  // Multi-tension combinations
  '7(b9,b13)':  [0, 4, 7, 10, 13, 20],
  '7(#9,b13)':  [0, 4, 7, 10, 15, 20],
  '7(b9,#11)':  [0, 4, 7, 10, 13, 18],
  '7(#9,#11)':  [0, 4, 7, 10, 15, 18],
  '7(9,#11)':   [0, 4, 7, 10, 14, 18],
  '7(9,13)':    [0, 4, 7, 10, 14, 21],
  'maj7(#11)':  [0, 4, 7, 11, 18],
  '\u25B37(#11)': [0, 4, 7, 11, 18],
  // 4-5 char qualities
  '7sus4':  [0, 5, 7, 10],
  'm7b5':   [0, 3, 6, 10],
  'm7-5':   [0, 3, 6, 10],
  'madd9':  [0, 3, 7, 14],
  'add9':   [0, 4, 7, 14],
  'aug7':   [0, 4, 8, 10],
  '7alt':   [0, 4, 6, 10, 13, 15],
  'dim7':   [0, 3, 6, 9],
  'maj9':   [0, 4, 7, 11, 14],
  'maj7':   [0, 4, 7, 11],
  'min9':   [0, 3, 7, 10, 14],
  'min7':   [0, 3, 7, 10],
  'sus4':   [0, 5, 7],
  'sus2':   [0, 2, 7],
  // Parenthesized tensions
  'm7(b5)': [0, 3, 6, 10],
  '7(b9)':  [0, 4, 7, 10, 13],
  '7(#9)':  [0, 4, 7, 10, 15],
  '7(#11)': [0, 4, 7, 10, 18],
  '7(b13)': [0, 4, 7, 10, 20],
  '7(#5)':  [0, 4, 8, 10],
  '7(b5)':  [0, 4, 6, 10],
  // Unicode / special symbols
  'm\u25B37': [0, 3, 7, 11],  // m△7
  '\u25B39':  [0, 4, 7, 11, 14], // △9
  '\u25B37':  [0, 4, 7, 11],  // △7
  '\u00F87':  [0, 3, 6, 10],  // ø7
  '\u00B07':  [0, 3, 6, 9],   // °7
  // Short forms
  'mM7':  [0, 3, 7, 11],
  '6/9':  [0, 4, 7, 9, 14],
  '7#9':  [0, 4, 7, 10, 15],
  '7b9':  [0, 4, 7, 10, 13],
  '7#5':  [0, 4, 8, 10],
  '7b5':  [0, 4, 6, 10],
  'M9':   [0, 4, 7, 11, 14],
  'M7':   [0, 4, 7, 11],
  // 3 char
  'dim':  [0, 3, 6],
  'aug':  [0, 4, 8],
  // 2 char
  'm9':   [0, 3, 7, 10, 14],
  'm7':   [0, 3, 7, 10],
  'm6':   [0, 3, 7, 9],
  '13':   [0, 4, 7, 10, 14, 21],
  '11':   [0, 4, 7, 10, 14, 17],
  // 1 char
  '9':    [0, 4, 7, 10, 14],
  '7':    [0, 4, 7, 10],
  '6':    [0, 4, 7, 9],
  '\u00F8': [0, 3, 6, 10],    // ø
  '\u00B0': [0, 3, 6],        // °
  '+':    [0, 4, 8],
  '-':    [0, 3, 7],          // minus = minor
  'm':    [0, 3, 7],
  // Empty = major triad
  '':     [0, 4, 7],
};

// Pre-sorted keys for matching (longest first)
const QUALITY_KEYS = Object.keys(QUALITY_INTERVALS).sort((a, b) => b.length - a.length);
