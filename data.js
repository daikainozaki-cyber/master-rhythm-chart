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
  '7(9,b13)':   [0, 4, 7, 10, 14, 20],
  '7(b9,#11)':  [0, 4, 7, 10, 13, 18],
  '7(#9,#11)':  [0, 4, 7, 10, 15, 18],
  '7(9,#11)':   [0, 4, 7, 10, 14, 18],
  '7(9,13)':    [0, 4, 7, 10, 14, 21],
  'maj7(#11)':  [0, 4, 7, 11, 18],
  '\u25B37(#11)': [0, 4, 7, 11, 18],
  // m7b5 + tensions
  'm7b5(b13)':  [0, 3, 6, 10, 20],
  'm7b5(11)':   [0, 3, 6, 10, 17],
  'm7b5(9)':    [0, 3, 6, 10, 14],
  // maj7 + tensions
  'maj7(13)':   [0, 4, 7, 11, 21],
  'maj7(9)':    [0, 4, 7, 11, 14],
  // m7 + tensions
  'm7(13)':     [0, 3, 7, 10, 21],
  'm7(11)':     [0, 3, 7, 10, 17],
  'm7(9)':      [0, 3, 7, 10, 14],
  // 7 + tension explicit form
  '7(13)':      [0, 4, 7, 10, 14, 21],
  '7(11)':      [0, 4, 7, 10, 14, 17],
  '7(9)':       [0, 4, 7, 10, 14],
  // Quartal (4th stacking)
  'quartal':    [0, 5, 10, 15],
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
  'maj':  [0, 4, 7],
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
  'q':    [0, 5, 10, 15],
  'h':    [0, 3, 6, 10],
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

// Alias → canonical display name (shortcuts that should show the real name)
const QUALITY_DISPLAY = {
  'h':   'm7b5',
  'q':   'quartal',
  '-':   'm',
  '+':   'aug',
  '\u00F8': 'm7b5',  // ø
  '\u00B0': 'dim',   // °
  'M7':  'maj7',
};

// ========================================
// BUILDER DATA — Chord Builder UI
// ========================================

// 4×3 grid — same layout as 64 Pad Explorer
const BUILDER_QUALITIES = [
  [{name:'', label:'Maj'}, {name:'m', label:'m'}, {name:'m7b5', label:'m7b5'}],
  [{name:'6', label:'6'}, {name:'m6', label:'m6'}, {name:'dim', label:'dim'}],
  [{name:'7', label:'7'}, {name:'m7', label:'m7'}, {name:'dim7', label:'dim7'}],
  [{name:'maj7', label:'\u25B37'}, {name:'mM7', label:'m\u25B37'}, {name:'aug', label:'aug'}],
];

// 3×4 grid — common tensions only
// suffix: string to append. replacesQuality: replaces quality name entirely
const BUILDER_TENSIONS = [
  [{label:'sus4', suffix:'sus4', replacesQuality:true},
   {label:'sus2', suffix:'sus2', replacesQuality:true},
   {label:'add9', suffix:'add9', replacesQuality:true},
   {label:'9', suffix:'9', replacesQuality:true}],
  [{label:'(b9)', suffix:'7(b9)'},
   {label:'(#9)', suffix:'7(#9)'},
   {label:'(#11)', suffix:'7(#11)'},
   {label:'(b13)', suffix:'7(b13)'}],
  [{label:'(9,13)', suffix:'7(9,13)'},
   {label:'(b9,b13)', suffix:'7(b9,b13)'},
   {label:'(#9,b13)', suffix:'7(#9,b13)'},
   {label:'(b9,#11)', suffix:'7(b9,#11)'}],
];

// Standard (theoretically available) tensions per base quality
// Used to visually distinguish standard vs non-standard in Builder
const STANDARD_TENSIONS = {
  '7':     ['(9)', '(b9)', '(#9)', '(#11)', '(b13)', '(13)'],
  'maj7':  ['(9)', '(#11)', '(13)'],
  'm7':    ['(9)', '(11)', '(13)'],
  'm7b5':  ['(9)', '(11)', '(b13)'],
  'mM7':   ['(9)', '(11)', '(13)'],
};

// ========================================
// SCALE DATA — Diatonic chord generation
// ========================================

const SCALE_TYPES = [
  {id: 'major', label: 'Major', intervals: [0,2,4,5,7,9,11],
   triadQualities: ['','m','m','','','m','dim'],
   seventhQualities: ['maj7','m7','m7','maj7','7','m7','m7b5']},
  {id: 'minor', label: 'Minor', intervals: [0,2,3,5,7,8,10],
   triadQualities: ['m','dim','','m','m','',''],
   seventhQualities: ['m7','m7b5','maj7','m7','m7','maj7','7']},
];
