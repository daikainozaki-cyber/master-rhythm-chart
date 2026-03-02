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
// BUILDER DATA — Chord Builder UI (PCS-based, synced with 64 Pad Explorer)
// ========================================

// 4×3 quality grid — matching 64 Pad Explorer
const BUILDER_QUALITIES = [
  [{name:'', label:'Maj', pcs:[0,4,7]}, {name:'m', label:'m', pcs:[0,3,7]}, {name:'m7(b5)', label:'m7\u207B\u2075', pcs:[0,3,6,10]}],
  [{name:'6', label:'6', pcs:[0,4,7,9]}, {name:'m6', label:'m6', pcs:[0,3,7,9]}, {name:'dim', label:'dim', pcs:[0,3,6]}],
  [{name:'7', label:'7', pcs:[0,4,7,10]}, {name:'m7', label:'m7', pcs:[0,3,7,10]}, {name:'dim7', label:'dim7', pcs:[0,3,6,9]}],
  [{name:'\u25B37', label:'\u25B37', pcs:[0,4,7,11]}, {name:'m\u25B37', label:'m\u25B37', pcs:[0,3,7,11]}, {name:'aug', label:'aug', pcs:[0,4,8]}],
];

// 8×8 sparse tension grid — operations-based (from 64 Pad Explorer)
// Each tension: {label, mods:{add:[], replace3:pc, sharp5:bool, flat5:bool, omit3:bool, omit5:bool}}
const TENSION_ROWS = [
  // Row 0
  [
    {label:'sus4', mods:{replace3:5}},
    {label:'aug', mods:{sharp5:true}},
    {label:'6', mods:{add:[9]}},
    {label:'9', mods:{add:[2]}},
    {label:'11', mods:{add:[2,5]}},
    {label:'13', mods:{add:[9]}},
    {label:'(9,13)', mods:{add:[2,9]}},
  ],
  // Row 1
  [
    {label:'add9', mods:{add:[2]}},
    {label:'b5', mods:{flat5:true}},
    {label:'6/9', mods:{add:[9,2]}},
    {label:'b9', mods:{add:[1]}},
    {label:'#11', mods:{add:[6]}},
    {label:'b13', mods:{add:[8]}},
  ],
  // Row 2
  [
    {label:'aug\n(9)', mods:{add:[2], sharp5:true}},
    {label:'6/9\n(#11)', mods:{add:[6,9,2]}},
    {label:'#9', mods:{add:[3]}},
    {label:'(9)\n(11)', mods:{add:[5,2]}},
    {label:'(11)\n(13)', mods:{add:[9,5]}},
  ],
  // Row 3
  [
    {label:'sus4\n(9)', mods:{replace3:5, add:[2]}},
    {label:'b5\n(b9)', mods:{add:[1], flat5:true}},
    null,
    null,
    {label:'(b11)\n(b13)', mods:{add:[8,4]}},
    null,
    null,
    null,
  ],
  // Row 4
  [
    {label:'sus4\n(b9)', mods:{replace3:5, add:[1]}},
    {label:'aug\n(b9)', mods:{sharp5:true, add:[1]}},
    null,
    {label:'(9)\n(#11)', mods:{add:[6,2]}},
    {label:'(#11)\n(b13)', mods:{add:[8,6]}},
    null,
    null,
    null,
  ],
  // Row 5
  [
    {label:'(#9)\n(#11)', mods:{add:[3,6]}},
    null,
    {label:'(9)\n(#11)\n(13)', mods:{add:[9,2,6]}},
    null,
    null,
    null,
    null,
    null,
  ],
  // Row 6
  [
    null,
    {label:'aug\n(#9)', mods:{add:[3], sharp5:true}},
    {label:'b5\n(#9)', mods:{add:[3], flat5:true}},
    {label:'(9)\n(b13)', mods:{add:[8,2]}},
    {label:'(b9)\n(13)', mods:{add:[1,9]}},
    null,
    null,
    null,
  ],
  // Row 7
  [
    null,
    null,
    null,
    {label:'(b9)\n(b13)', mods:{add:[8,1]}},
    {label:'(#9)\n(b13)', mods:{add:[3,8]}},
    null,
    null,
    null,
  ],
  // Row 8
  [
    null,
    null,
    null,
    {label:'(b9)\n(#9)\n(b13)', mods:{add:[8,1,3]}},
    null,
    null,
    null,
    null,
  ],
];

// ======== VOICING STATE ========
const VoicingState = {
  omit5: false,
  rootless: false,
  omit3: false,
  shell: null,           // null, '137', '173'
  inversion: 0,          // 0=root, 1=1st, 2=2nd, 3=3rd
  drop: null,            // null, 'drop2', 'drop3'
  shellExtension: 0,     // 0, 1, 2
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
