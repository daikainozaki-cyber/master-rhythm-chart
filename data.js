// ========================================
// DATA & CONSTANTS — Rhythm Chart App
// ========================================

// NOTE_NAMES_SHARP, NOTE_NAMES_FLAT — from pad-core/data.js
// ROOT_TO_PC, QUALITY_INTERVALS, QUALITY_KEYS, QUALITY_DISPLAY — from pad-core/data.js (PAD_* prefix)

const ROOT_TO_PC = PAD_ROOT_TO_PC;
const QUALITY_INTERVALS = PAD_QUALITY_INTERVALS;
const QUALITY_KEYS = PAD_QUALITY_KEYS;
const QUALITY_DISPLAY = PAD_QUALITY_DISPLAY;

// Pitch class → display name (sharp preference by default)
function pcToName(pc) { return NOTE_NAMES_SHARP[pc]; }

// BUILDER_QUALITIES, TENSION_ROWS — from pad-core/data.js

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
