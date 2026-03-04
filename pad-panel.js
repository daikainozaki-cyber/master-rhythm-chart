// ========================================
// PAD-PANEL — MRC Pad Panel Integration
// Connects chart cursor/playback to pad-core rendering
// ========================================

const PadPanelState = {
  octaveShift: 0,
  selectedBoxIdx: null,
  lastBoxes: [],
  cycleIndices: {},
  collapsed: false,
  lastChordName: null,  // cache to avoid re-render when chord hasn't changed
};

// ======== INIT ========

function initPadPanel() {
  const panel = document.getElementById('pad-panel');
  if (!panel) return;

  // Octave controls
  document.getElementById('pad-oct-down')?.addEventListener('click', () => {
    if (PadPanelState.octaveShift > -1) {
      PadPanelState.octaveShift--;
      PadPanelState.selectedBoxIdx = null;
      PadPanelState.cycleIndices = {};
      updatePadPanel(true);
    }
  });
  document.getElementById('pad-oct-up')?.addEventListener('click', () => {
    if (PadPanelState.octaveShift < 3) {
      PadPanelState.octaveShift++;
      PadPanelState.selectedBoxIdx = null;
      PadPanelState.cycleIndices = {};
      updatePadPanel(true);
    }
  });

  // Toggle panel
  document.getElementById('pad-panel-toggle')?.addEventListener('click', () => {
    PadPanelState.collapsed = !PadPanelState.collapsed;
    panel.classList.toggle('collapsed', PadPanelState.collapsed);
    const ws = document.querySelector('.workspace');
    if (ws) ws.classList.toggle('pad-collapsed', PadPanelState.collapsed);
  });

  // Wrap voicing functions to trigger pad update
  wrapVoicingForPad();

  // Initial render
  updatePadPanel(true);
}

// ======== VOICING FUNCTION WRAPPING ========
// Add updatePadPanel() calls to existing voicing toggle functions
// without modifying builder.js

function wrapVoicingForPad() {
  const origFns = {
    toggleOmit5: typeof toggleOmit5 === 'function' ? toggleOmit5 : null,
    toggleRootless: typeof toggleRootless === 'function' ? toggleRootless : null,
    toggleOmit3: typeof toggleOmit3 === 'function' ? toggleOmit3 : null,
    setShell: typeof setShell === 'function' ? setShell : null,
    setShellExtension: typeof setShellExtension === 'function' ? setShellExtension : null,
    setInversion: typeof setInversion === 'function' ? setInversion : null,
    setDrop: typeof setDrop === 'function' ? setDrop : null,
  };

  if (origFns.toggleOmit5) {
    window.toggleOmit5 = function() { origFns.toggleOmit5(); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.toggleRootless) {
    window.toggleRootless = function() { origFns.toggleRootless(); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.toggleOmit3) {
    window.toggleOmit3 = function() { origFns.toggleOmit3(); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.setShell) {
    window.setShell = function(mode) { origFns.setShell(mode); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.setShellExtension) {
    window.setShellExtension = function(n) { origFns.setShellExtension(n); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.setInversion) {
    window.setInversion = function(inv) { origFns.setInversion(inv); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
  if (origFns.setDrop) {
    window.setDrop = function(drop) { origFns.setDrop(drop); PadPanelState.selectedBoxIdx = null; PadPanelState.cycleIndices = {}; updatePadPanel(true); };
  }
}

// ======== GET EFFECTIVE CHORD ========
// Find the chord "in effect" at the current cursor or play position

function getEffectiveChordAtCursor() {
  const { sections, cursor, playing, playSectionIndex, playMeasure, playBeat } = ChartState;
  let secIdx, mIdx, beat;

  if (playing) {
    secIdx = playSectionIndex;
    mIdx = playMeasure;
    beat = playBeat;
  } else {
    secIdx = cursor.sectionIndex;
    mIdx = cursor.measure;
    beat = cursor.beat;
  }

  const section = sections[secIdx];
  if (!section) return null;

  // Look for chord at or before current beat in current measure
  const measure = section.measures[mIdx];
  if (!measure) return null;

  let found = null;
  for (const chord of measure.chords) {
    if (chord.beat <= beat) {
      if (!found || chord.beat > found.beat) found = chord;
    }
  }
  if (found) return found.name;

  // Scan backward through previous measures in same section
  for (let m = mIdx - 1; m >= 0; m--) {
    const prev = section.measures[m];
    if (prev.chords.length > 0) {
      // Last chord in the measure
      let last = prev.chords[0];
      for (const c of prev.chords) {
        if (c.beat > last.beat) last = c;
      }
      return last.name;
    }
  }

  return null;
}

// ======== CHORD NAME → PAD STATE BRIDGE ========

function chordNameToPadState(chordName) {
  const parsed = parseChordName(chordName);
  if (!parsed) return null;

  const { root, intervals, bass } = parsed;

  // Apply voicing filters
  let pcs = [...intervals];
  if (VoicingState.omit5) pcs = pcs.filter(iv => iv % 12 !== 7);
  if (VoicingState.rootless) pcs = pcs.filter(iv => iv % 12 !== 0);
  if (VoicingState.omit3) pcs = pcs.filter(iv => iv % 12 !== 3 && iv % 12 !== 4);

  // Shell voicing
  if (VoicingState.shell) {
    const qualityPCS = intervals.map(iv => iv % 12);
    const shell = padGetShellIntervals(qualityPCS, VoicingState.shell, VoicingState.shellExtension, intervals);
    if (shell) pcs = shell;
  }

  if (pcs.length === 0) pcs = [...intervals]; // fallback

  // Compute voicing offsets
  const inv = Math.min(VoicingState.inversion, pcs.length - 1);
  const result = padCalcVoicingOffsets(pcs, inv, VoicingState.drop);
  let voiced = [...result.voiced];

  // Slash chord bass
  let targetPC = root;
  if (bass !== null) {
    const bc = padGetBassCase(bass, root, intervals);
    if (!bc.isChordTone) {
      voiced = padApplyOnChordBass(voiced, root, bass);
    }
    targetPC = bass;
  }

  const offsets = voiced.map(v => v - voiced[0]);
  const activePCS = new Set(intervals.map(iv => (iv + root) % 12));
  const qualityPCS = intervals.map(iv => iv % 12);

  return { root, bass, activePCS, offsets, qualityPCS, targetPC };
}

// ======== UPDATE PAD PANEL ========

function updatePadPanel(force) {
  if (PadPanelState.collapsed) return;

  const svg = document.getElementById('pad-svg');
  if (!svg) return;

  const chordName = getEffectiveChordAtCursor();

  // Skip re-render if chord hasn't changed (unless forced)
  if (!force && chordName === PadPanelState.lastChordName) return;
  PadPanelState.lastChordName = chordName;

  // Reset selection on chord change
  if (!force) {
    PadPanelState.selectedBoxIdx = null;
    PadPanelState.cycleIndices = {};
  }

  // Set viewBox and clear SVG
  const vb = padGridViewBox();
  svg.setAttribute('viewBox', `0 0 ${vb.w} ${vb.h}`);
  svg.innerHTML = '';

  // Update chord name display
  const nameEl = document.getElementById('pad-chord-name');
  if (nameEl) nameEl.textContent = chordName || '—';

  // Update octave label
  const octLabel = document.getElementById('pad-oct-label');
  if (octLabel) {
    const lo = padBaseMidi(PadPanelState.octaveShift);
    const hi = lo + (PAD.ROWS - 1) * PAD.ROW_INTERVAL + (PAD.COLS - 1);
    octLabel.textContent = padNoteName(lo) + '–' + padNoteName(hi);
  }
  const octDown = document.getElementById('pad-oct-down');
  const octUp = document.getElementById('pad-oct-up');
  if (octDown) octDown.disabled = PadPanelState.octaveShift <= -1;
  if (octUp) octUp.disabled = PadPanelState.octaveShift >= 3;

  if (!chordName) {
    // Empty state: render blank grid
    const emptyPCS = new Set();
    padRenderGrid(svg, emptyPCS, 0, null, null, PadPanelState.octaveShift, null);
    return;
  }

  const state = chordNameToPadState(chordName);
  if (!state) {
    const emptyPCS = new Set();
    padRenderGrid(svg, emptyPCS, 0, null, null, PadPanelState.octaveShift, null);
    return;
  }

  // Compute voicing boxes
  const maxRS = state.offsets.length <= 3 ? 4 : 5;
  const maxCS = state.offsets.length <= 3 ? 5 : 6;
  const boxes = padComputeBoxes(state.offsets, state.targetPC, PadPanelState.octaveShift, maxRS, maxCS);

  // Get selected box for dimming
  let selBox = null;
  if (PadPanelState.selectedBoxIdx !== null && boxes[PadPanelState.selectedBoxIdx]) {
    const bm = padBaseMidi(PadPanelState.octaveShift);
    const altIdx = (PadPanelState.cycleIndices[PadPanelState.selectedBoxIdx]) || 0;
    const b = boxes[PadPanelState.selectedBoxIdx];
    const safeIdx = altIdx < b.alternatives.length ? altIdx : 0;
    const vp = b.alternatives[safeIdx];
    selBox = {
      midiNotes: vp.positions.map(p => bm + p.row * PAD.ROW_INTERVAL + p.col).sort((a, b) => a - b)
    };
  }

  // Render pads
  padRenderGrid(svg, state.activePCS, state.root, state.bass, state.qualityPCS, PadPanelState.octaveShift, selBox);

  // Draw voicing boxes
  PadPanelState.lastBoxes = padDrawBoxes(
    svg, boxes, PadPanelState.selectedBoxIdx, PadPanelState.cycleIndices,
    PadPanelState.octaveShift, selectPadBox
  );
}

// ======== BOX SELECTION ========

function selectPadBox(idx) {
  const wasSelected = PadPanelState.selectedBoxIdx === idx;
  const box = PadPanelState.lastBoxes[idx];
  const hasCycle = box && box.alternatives && box.alternatives.length > 1;

  if (!wasSelected) {
    PadPanelState.selectedBoxIdx = idx;
  } else if (hasCycle) {
    const nextAlt = (box.currentAlt + 1) % box.alternatives.length;
    PadPanelState.cycleIndices[idx] = nextAlt;
  } else {
    PadPanelState.selectedBoxIdx = null;
  }
  updatePadPanel(true);
}
