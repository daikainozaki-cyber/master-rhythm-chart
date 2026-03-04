// ========================================
// BUILDER — Chord Builder (PCS-based, synced with 64 Pad Explorer)
// ========================================

// ======== STATE ========

const BuilderState = {
  root: null,        // 0-11 pitch class
  quality: null,     // {name, label, pcs}
  tension: null,     // {label, mods}
  bass: null,        // 0-11 pitch class (slash chord)
  bassInputMode: false,
  step: 0,           // 0=idle, 1=root selected, 2=quality selected
  _syncing: false,   // prevent circular sync (builder → placeChord → syncBuilderToChord)
};

const MemoryState = {
  slots: Array(16).fill(null),  // [{name, midiNotes}, ...]
};

// ======== INITIALIZATION ========

function initBuilder() {
  buildPianoKeyboard('piano-root', selectBuilderRoot);
  initQualityGrid();
  initTensionGrid();
  buildPianoKeyboard('onchord-keyboard', selectBass);
  initVoicingButtons();
  initBuilderToggle();
  initKeySelect();
  initScaleToggle();
  buildDiatonicBar();
  initMemorySlots();
  loadMemorySlots();
  initIncremental();
  initChordDisplayActions();
  initSwipe();
  updateBuilderUI();
  updateDiatonicBar();
}

// ======== BUILDER PANEL TOGGLE ========

function initBuilderToggle() {
  const toggleBtn = document.getElementById('btn-builder-toggle');
  const panel = document.getElementById('builder-panel');
  if (!toggleBtn || !panel) return;

  panel.style.display = '';
  toggleBtn.textContent = '\u25BC Builder';

  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? '' : 'none';
    toggleBtn.textContent = (isHidden ? '\u25BC' : '\u25B6') + ' Builder';
  });
}

// ======== PIANO KEYBOARD ========

function buildPianoKeyboard(containerId, onSelect) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';

  const whites = [{pc:0,name:'C'},{pc:2,name:'D'},{pc:4,name:'E'},{pc:5,name:'F'},{pc:7,name:'G'},{pc:9,name:'A'},{pc:11,name:'B'}];
  const whiteDiv = document.createElement('div');
  whiteDiv.className = 'piano-white';
  whites.forEach(w => {
    const key = document.createElement('div');
    key.className = 'piano-white-key';
    key.dataset.pc = w.pc;
    key.textContent = w.name;
    key.onclick = () => onSelect(w.pc);
    whiteDiv.appendChild(key);
  });
  wrap.appendChild(whiteDiv);

  const blackDiv = document.createElement('div');
  blackDiv.className = 'piano-black-keys';
  const blacks = [
    {pc:1, name:'C#', pos:0},
    {pc:3, name:'D#', pos:1},
    {pc:6, name:'F#', pos:3},
    {pc:8, name:'G#', pos:4},
    {pc:10, name:'A#', pos:5},
  ];
  blacks.forEach(b => {
    const key = document.createElement('div');
    key.className = 'piano-black-key';
    key.dataset.pc = b.pc;
    key.textContent = b.name;
    key.style.position = 'absolute';
    key.style.left = `calc(${(b.pos + 1) / 7 * 100}% - 18px)`;
    key.onclick = (e) => { e.stopPropagation(); onSelect(b.pc); };
    blackDiv.appendChild(key);
  });
  wrap.appendChild(blackDiv);
}

function highlightPianoKey(containerId, pc) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.piano-white-key, .piano-black-key').forEach(k => {
    k.classList.toggle('selected', parseInt(k.dataset.pc) === pc);
  });
}

function clearPianoSelection(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.querySelectorAll('.selected').forEach(k => k.classList.remove('selected'));
}

// ======== ROOT SELECTION ========

function selectBuilderRoot(pc) {
  if (BuilderState.bassInputMode) {
    BuilderState.bass = pc;
    BuilderState.bassInputMode = false;
    const slashBtn = document.getElementById('btn-slash');
    if (slashBtn) slashBtn.classList.remove('active');
    commitBuilderChord();
    return;
  }

  BuilderState.root = pc;
  BuilderState.quality = null;
  BuilderState.tension = null;
  BuilderState.bass = null;
  BuilderState.step = 1;
  highlightPianoKey('piano-root', pc);
  clearQualitySelection();
  clearTensionSelection();
  setBuilderStep(1);
  updateBuilderUI();
}

// ======== QUALITY GRID ========

function initQualityGrid() {
  const grid = document.getElementById('quality-grid');
  if (!grid) return;
  grid.innerHTML = '';
  BUILDER_QUALITIES.forEach((row) => {
    row.forEach((q) => {
      const btn = document.createElement('button');
      btn.className = 'quality-btn' + (!q ? ' empty' : '');
      if (q) {
        btn.textContent = q.label;
        btn.onclick = () => selectBuilderQuality(q);
      }
      grid.appendChild(btn);
    });
  });
}

function selectBuilderQuality(q) {
  if (BuilderState.root === null) return;
  BuilderState.quality = q;
  BuilderState.tension = null;
  BuilderState.step = 2;

  highlightQuality(q);
  updateControlsForQuality(q);
  clearTensionSelection();

  // Immediately place chord (rhythm chart app behavior)
  commitBuilderChord();
  setBuilderStep(2);
  updateBuilderUI();
}

function highlightQuality(q) {
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === q.label);
  });
}

function clearQualitySelection() {
  document.querySelectorAll('.quality-btn.selected').forEach(b => b.classList.remove('selected'));
}

// ======== TENSION GRID ========

function initTensionGrid() {
  const grid = document.getElementById('tension-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const maxCols = Math.max(...TENSION_ROWS.map(r => r.length));
  grid.style.gridTemplateColumns = `repeat(${maxCols}, 1fr)`;

  TENSION_ROWS.forEach((row) => {
    for (let i = 0; i < maxCols; i++) {
      const t = row[i] || null;
      const btn = document.createElement('button');
      btn.className = 'tension-btn' + (!t ? ' empty' : '');
      btn._tension = t || null;
      if (t) {
        btn.textContent = t.label;
        btn.onclick = function() { selectBuilderTension(t, this); };
      }
      grid.appendChild(btn);
    }
  });
}

function selectBuilderTension(t, el) {
  if (BuilderState.root === null || !BuilderState.quality) return;

  if (BuilderState.tension && BuilderState.tension.label === t.label) {
    BuilderState.tension = null;
    clearTensionSelection();
  } else {
    BuilderState.tension = t;
    clearTensionSelection();
    el.classList.add('selected');
  }

  // Replace last placed chord (rhythm chart app behavior)
  replaceLastPlacedChord();
  updateBuilderUI();
}

function clearTensionSelection() {
  document.querySelectorAll('.tension-btn.selected').forEach(b => b.classList.remove('selected'));
}

// ======== QUALITY-DEPENDENT TENSION VISIBILITY (8 categories, from 64 Pad) ========

function updateControlsForQuality(quality) {
  if (!quality) return;
  const isTriad = quality.pcs.length <= 3;

  // Category A: Voicing controls visibility
  const shellBar = document.getElementById('shell-bar');
  const inv3 = document.getElementById('btn-inv3');
  const dropBar = document.getElementById('drop-bar');
  if (shellBar) shellBar.classList.toggle('hidden', isTriad);
  if (inv3) inv3.classList.toggle('hidden', isTriad);
  if (dropBar) dropBar.classList.toggle('hidden', isTriad);

  if (isTriad) {
    if (VoicingState.shell) {
      VoicingState.shell = null;
      VoicingState.shellExtension = 0;
      VoicingState.omit5 = false;
    }
    if (VoicingState.inversion > 2) VoicingState.inversion = 0;
    if (VoicingState.drop) VoicingState.drop = null;
    updateVoicingButtons();
  }

  // Category D-H: Theory-based tension restrictions
  const btns = document.querySelectorAll('#tension-grid .tension-btn');
  const has7th = quality.pcs.includes(10) || quality.pcs.includes(11) ||
                 (quality.pcs.includes(9) && quality.pcs.includes(6));
  const has6th = quality.pcs.includes(9) && !has7th;

  // Reset
  btns.forEach(btn => { btn.classList.remove('quality-hidden'); btn.classList.remove('tension-uncommon'); });

  // D: Without 7th, no altered tensions
  if (!has7th) {
    btns.forEach(btn => {
      if (!btn._tension) return;
      const m = btn._tension.mods;
      if (m.replace3 !== undefined) { btn.classList.add('quality-hidden'); return; }
      if (m.sharp5 || m.flat5) { btn.classList.add('quality-hidden'); return; }
      if (m.add) {
        for (const pc of m.add) {
          if (pc === 1 || pc === 3) { btn.classList.add('quality-hidden'); return; }
        }
      }
      const label = btn._tension.label;
      if (label.includes('13') && !label.includes('b13')) { btn.classList.add('quality-hidden'); return; }
    });
  }

  // E: With 7th, hide "6" labels (use "13" instead)
  if (has7th) {
    const sixLabels = new Set(['6', '6/9', '6/9\n(#11)']);
    btns.forEach(btn => {
      if (btn._tension && sixLabels.has(btn._tension.label)) {
        btn.classList.add('quality-hidden');
      }
    });
  }

  // F: sus4 only for dominant 7
  if (has7th) {
    const isDominant7 = quality.pcs.includes(4) && quality.pcs.includes(10) && !quality.pcs.includes(11);
    if (!isDominant7) {
      btns.forEach(btn => {
        if (btn._tension && btn._tension.mods.replace3 !== undefined) {
          btn.classList.add('quality-hidden');
        }
      });
    }
  }

  // B+C: PCS-based no-op and duplicate detection
  const basePCS = [...quality.pcs].sort((a, b) => a - b);
  const baseKey = basePCS.join(',');

  const entries = [];
  btns.forEach(btn => {
    if (!btn._tension || btn.classList.contains('quality-hidden')) { entries.push(null); return; }
    const result = applyTension([...quality.pcs], btn._tension.mods);
    const resultKey = result.join(',');
    const m = btn._tension.mods;
    let complexity = 0;
    if (m.add) complexity += m.add.length;
    if (m.sharp5) complexity++;
    if (m.flat5) complexity++;
    if (m.replace3 !== undefined) complexity++;
    if (m.omit5) complexity++;
    if (m.omit3) complexity++;
    entries.push({ btn, resultKey, complexity, isNoOp: resultKey === baseKey });
  });

  const groups = new Map();
  entries.forEach(e => {
    if (!e || e.isNoOp) return;
    if (!groups.has(e.resultKey)) groups.set(e.resultKey, []);
    groups.get(e.resultKey).push(e.complexity);
  });

  entries.forEach(e => {
    if (!e) return;
    if (e.isNoOp) { e.btn.classList.add('quality-hidden'); return; }
    const group = groups.get(e.resultKey);
    const minComplexity = Math.min(...group);
    if (group.length > 1 && e.complexity > minComplexity) {
      e.btn.classList.add('quality-hidden');
    }
  });

  // G: Dim uncommon tensions for non-dominant 7th
  if (has7th) {
    const isDom7 = quality.pcs.includes(4) && quality.pcs.includes(10) && !quality.pcs.includes(11);
    if (isDom7) {
      btns.forEach(btn => {
        if (!btn._tension || btn.classList.contains('quality-hidden')) return;
        const m = btn._tension.mods;
        if (m.replace3 !== undefined) return;
        if (m.add && m.add.includes(5)) btn.classList.add('quality-hidden');
      });
    } else {
      const isMinor = quality.pcs.includes(3);
      const isDim7 = isMinor && quality.pcs.includes(6) && quality.pcs.includes(9) && !quality.pcs.includes(10);
      const isMM7 = isMinor && quality.pcs.includes(11);
      btns.forEach(btn => {
        if (!btn._tension || btn.classList.contains('quality-hidden')) return;
        const m = btn._tension.mods;
        if (m.replace3 !== undefined) return;
        if (m.sharp5 || m.flat5) { btn.classList.add('tension-uncommon'); return; }
        if (m.add) {
          if (isMM7 && m.add.includes(6)) { btn.classList.add('quality-hidden'); return; }
          for (const pc of m.add) {
            if (pc === 1 || pc === 3) { btn.classList.add('tension-uncommon'); return; }
            if (pc === 8 && !isDim7) { btn.classList.add('tension-uncommon'); return; }
            if (pc === 6 && isMinor) { btn.classList.add('tension-uncommon'); return; }
          }
        }
      });
    }
  }

  // G2: 11th avoid on major 3rd chords
  if (quality.pcs.includes(4)) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.replace3 !== undefined) return;
      if (m.add && m.add.includes(5)) btn.classList.add('quality-hidden');
    });
  }

  // G3: Minor non-7th + #11 restrictions
  if (quality.pcs.includes(3) && !has7th) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.add && m.add.includes(6)) {
        if (m.add.includes(9) || has6th) {
          btn.classList.add('quality-hidden');
        } else {
          btn.classList.add('tension-uncommon');
        }
      }
    });
  }

  // G4: b13 on 6th chords → hide
  if (has6th) {
    btns.forEach(btn => {
      if (!btn._tension || btn.classList.contains('quality-hidden')) return;
      const m = btn._tension.mods;
      if (m.add && m.add.includes(8)) btn.classList.add('quality-hidden');
    });
  }

  // H: add9 vs 9 context
  if (has7th || has6th) {
    btns.forEach(btn => {
      if (btn._tension && btn._tension.label === 'add9') btn.classList.add('quality-hidden');
    });
  } else {
    btns.forEach(btn => {
      if (btn._tension && btn._tension.label === '9') btn.classList.add('quality-hidden');
    });
  }
}

// ======== STEP NAVIGATION ========

function setBuilderStep(step) {
  BuilderState.step = step;
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  if (step1) step1.style.display = step === 2 ? 'none' : '';
  if (step2) step2.style.display = step === 2 ? '' : 'none';
  updateChordDisplay();
  updateNextButton();
}

function initSwipe() {
  let _sx = 0, _sy = 0;
  const MIN_DX = 50;
  const MAX_DY_RATIO = 0.7;

  const panel = document.getElementById('builder-panel');
  if (!panel) return;

  panel.addEventListener('touchstart', (e) => {
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
  }, { passive: true });

  panel.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = Math.abs(e.changedTouches[0].clientY - _sy);
    if (Math.abs(dx) < MIN_DX || dy / Math.abs(dx) > MAX_DY_RATIO) return;
    if (dx < 0 && BuilderState.step === 1 && BuilderState.quality) {
      setBuilderStep(2);
    } else if (dx > 0 && BuilderState.step === 2) {
      setBuilderStep(1);
    }
  }, { passive: true });
}

// ======== CHORD DISPLAY ========

function updateChordDisplay() {
  const el = document.getElementById('chord-display');
  if (!el) return;
  const name = getBuilderChordName();
  el.textContent = name || '\u2014';
}

function initChordDisplayActions() {
  document.getElementById('btn-slash')?.addEventListener('click', () => {
    toggleBassMode();
  });
  document.getElementById('btn-builder-clear')?.addEventListener('click', () => {
    resetBuilder();
  });
  document.getElementById('btn-builder-back')?.addEventListener('click', () => {
    builderBack();
  });
  document.getElementById('btn-builder-next')?.addEventListener('click', () => {
    builderNext();
  });
}

function builderNext() {
  if (!BuilderState.quality) return;
  setBuilderStep(2);
}

function updateNextButton() {
  const btn = document.getElementById('btn-builder-next');
  if (!btn) return;
  // Show Next only when on Step 1 UI but quality is already selected (i.e. editing existing chord)
  const step1El = document.getElementById('step1');
  const onStep1UI = step1El && step1El.style.display !== 'none';
  btn.style.display = (onStep1UI && BuilderState.quality) ? '' : 'none';
}

// ======== CHORD COMMIT & REPLACE ========

function commitBuilderChord() {
  const name = getBuilderChordName();
  if (!name) return;

  const voicing = { ...VoicingState };
  BuilderState._syncing = true;
  const success = placeChord(name, voicing);
  BuilderState._syncing = false;
  if (success) {
    addToMemory(ChartState.lastPlacedChord);
    advanceCursor();
    saveChart();
    updateChordDisplay();
  }
}

function replaceLastPlacedChord() {
  const prev = ChartState.previousCursorPosition;
  if (!prev) return;

  const name = getBuilderChordName();
  if (!name) return;

  const savedCursor = { ...ChartState.cursor };
  ChartState.cursor.sectionIndex = prev.sectionIndex;
  ChartState.cursor.measure = prev.measure;
  ChartState.cursor.beat = prev.beat;

  const voicing = { ...VoicingState };
  BuilderState._syncing = true;
  const success = placeChord(name, voicing);
  BuilderState._syncing = false;
  if (success) {
    addToMemory(ChartState.lastPlacedChord);
    ChartState.cursor = savedCursor;
    saveChart();
    renderChart();
    updateChordDisplay();
  }
}

// ======== VOICING CONTROLS ========

function toggleOmit5() { VoicingState.omit5 = !VoicingState.omit5; VoicingState.shell = null; updateVoicingButtons(); }
function toggleRootless() { VoicingState.rootless = !VoicingState.rootless; VoicingState.shell = null; updateVoicingButtons(); }
function toggleOmit3() { VoicingState.omit3 = !VoicingState.omit3; VoicingState.shell = null; updateVoicingButtons(); }

function setShell(mode) {
  VoicingState.shell = mode;
  if (mode) {
    VoicingState.omit5 = true; VoicingState.rootless = false; VoicingState.omit3 = false;
    VoicingState.inversion = 0; VoicingState.drop = null;
  } else {
    VoicingState.shellExtension = 0;
  }
  updateVoicingButtons();
}

function setShellExtension(n) {
  VoicingState.shellExtension = (VoicingState.shellExtension === n) ? 0 : n;
  if (VoicingState.shellExtension > 0 && !VoicingState.shell) VoicingState.shell = '137';
  updateVoicingButtons();
}

function setInversion(inv) {
  VoicingState.inversion = inv;
  VoicingState.shell = null;
  updateVoicingButtons();
}

function setDrop(drop) {
  VoicingState.drop = VoicingState.drop === drop ? null : drop;
  VoicingState.shell = null;
  updateVoicingButtons();
}

function updateVoicingButtons() {
  const el = (id) => document.getElementById(id);
  el('btn-omit5')?.classList.toggle('active', VoicingState.omit5);
  el('btn-rootless')?.classList.toggle('active', VoicingState.rootless);
  el('btn-omit3')?.classList.toggle('active', VoicingState.omit3);
  el('btn-shell137')?.classList.toggle('active', VoicingState.shell === '137');
  el('btn-shell173')?.classList.toggle('active', VoicingState.shell === '173');
  el('btn-shell-ext1')?.classList.toggle('active', VoicingState.shellExtension === 1);
  el('btn-shell-ext2')?.classList.toggle('active', VoicingState.shellExtension === 2);
  for (let i = 0; i < 4; i++) {
    el('btn-inv' + i)?.classList.toggle('active', VoicingState.inversion === i);
  }
  el('btn-drop2')?.classList.toggle('active', VoicingState.drop === 'drop2');
  el('btn-drop3')?.classList.toggle('active', VoicingState.drop === 'drop3');
}

function initVoicingButtons() {
  document.getElementById('btn-omit5')?.addEventListener('click', toggleOmit5);
  document.getElementById('btn-rootless')?.addEventListener('click', toggleRootless);
  document.getElementById('btn-omit3')?.addEventListener('click', toggleOmit3);
  document.getElementById('btn-shell137')?.addEventListener('click', () => setShell(VoicingState.shell === '137' ? null : '137'));
  document.getElementById('btn-shell173')?.addEventListener('click', () => setShell(VoicingState.shell === '173' ? null : '173'));
  document.getElementById('btn-shell-ext1')?.addEventListener('click', () => setShellExtension(1));
  document.getElementById('btn-shell-ext2')?.addEventListener('click', () => setShellExtension(2));
  for (let i = 0; i < 4; i++) {
    document.getElementById('btn-inv' + i)?.addEventListener('click', () => setInversion(i));
  }
  document.getElementById('btn-drop2')?.addEventListener('click', () => setDrop('drop2'));
  document.getElementById('btn-drop3')?.addEventListener('click', () => setDrop('drop3'));
}

// ======== UI UPDATE ========

function updateBuilderUI() {
  highlightDiatonicRoots();
  updateChordDisplay();
  updateVoicingButtons();
  updateNextButton();
}

function highlightDiatonicRoots() {
  const chords = getDiatonicChords(ChartState.key, ChartState.scaleType, ChartState.use7th);
  const diatonicPcs = new Set(chords.map(c => {
    const parsed = parseRoot(c.name);
    return parsed ? parsed.pc : -1;
  }));

  document.querySelectorAll('#piano-root .piano-white-key, #piano-root .piano-black-key').forEach(key => {
    key.classList.toggle('diatonic', diatonicPcs.has(parseInt(key.dataset.pc)));
  });
}

function resetBuilder() {
  BuilderState.root = null;
  BuilderState.quality = null;
  BuilderState.tension = null;
  BuilderState.bass = null;
  BuilderState.bassInputMode = false;
  BuilderState.step = 0;
  clearPianoSelection('piano-root');
  clearPianoSelection('onchord-keyboard');
  clearQualitySelection();
  clearTensionSelection();
  setBuilderStep(1);
  updateBuilderUI();
}

function builderBack() {
  if (BuilderState.bassInputMode) {
    BuilderState.bassInputMode = false;
    const slashBtn = document.getElementById('btn-slash');
    if (slashBtn) slashBtn.classList.remove('active');
    if (BuilderState.quality) setBuilderStep(2);
    else setBuilderStep(1);
    return;
  }
  if (BuilderState.step === 2) {
    BuilderState.tension = null;
    clearTensionSelection();
    setBuilderStep(1);
  } else {
    if (BuilderState.quality) {
      BuilderState.quality = null;
      clearQualitySelection();
    } else if (BuilderState.root !== null) {
      BuilderState.root = null;
      clearPianoSelection('piano-root');
    }
  }
  updateBuilderUI();
}

// ======== SLASH CHORD (BASS) ========

function toggleBassMode() {
  if (BuilderState.root === null) return;
  BuilderState.bassInputMode = !BuilderState.bassInputMode;
  const slashBtn = document.getElementById('btn-slash');
  if (slashBtn) slashBtn.classList.toggle('active', BuilderState.bassInputMode);

  if (BuilderState.bassInputMode) {
    // Show on-chord keyboard (step 2)
    setBuilderStep(2);
  }
}

function selectBass(pc) {
  BuilderState.bass = pc;
  BuilderState.bassInputMode = false;
  const slashBtn = document.getElementById('btn-slash');
  if (slashBtn) slashBtn.classList.remove('active');
  highlightPianoKey('onchord-keyboard', pc);

  // Replace last placed chord with bass note
  replaceLastPlacedChord();
  updateBuilderUI();
}

// ======== MEMORY SLOTS ========

function initMemorySlots() {
  const container = document.getElementById('memory-bar');
  if (!container) return;
  updateMemoryUI();
}

function addToMemory(chord) {
  if (!chord || !chord.name) return;
  if (MemoryState.slots.some(s => s && s.name === chord.name)) return;
  const emptyIdx = MemoryState.slots.indexOf(null);
  if (emptyIdx >= 0) {
    MemoryState.slots[emptyIdx] = { name: chord.name, midiNotes: [...chord.midiNotes] };
  } else {
    MemoryState.slots.shift();
    MemoryState.slots.push({ name: chord.name, midiNotes: [...chord.midiNotes] });
  }
  saveMemorySlots();
  updateMemoryUI();
}

function recallMemorySlot(idx) {
  const slot = MemoryState.slots[idx];
  if (!slot) return;
  const success = placeChord(slot.name);
  if (success) {
    advanceCursor();
    saveChart();
    // Visual feedback: flash the recalled slot
    const container = document.getElementById('memory-bar');
    if (container) {
      const btn = container.children[idx];
      if (btn) {
        btn.classList.add('just-recalled');
        setTimeout(() => btn.classList.remove('just-recalled'), 500);
      }
    }
  }
}

function removeMemorySlot(idx) {
  MemoryState.slots[idx] = null;
  saveMemorySlots();
  updateMemoryUI();
}

function updateMemoryUI() {
  const container = document.getElementById('memory-bar');
  if (!container) return;
  container.innerHTML = '';

  MemoryState.slots.forEach((slot, i) => {
    const btn = document.createElement('button');
    btn.className = 'memory-btn' + (slot ? ' has-chord' : '');
    btn.dataset.index = i;

    const numSpan = document.createElement('span');
    numSpan.className = 'memory-num';
    numSpan.textContent = (i + 1);
    btn.appendChild(numSpan);

    if (slot) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'memory-name';
      nameSpan.textContent = slot.name;
      btn.appendChild(nameSpan);

      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', slot.name);
        e.dataTransfer.effectAllowed = 'copy';
      });

      btn.addEventListener('click', (e) => {
        if (e.shiftKey) {
          removeMemorySlot(i);
        } else {
          recallMemorySlot(i);
        }
      });
    }
    container.appendChild(btn);
  });

  initMemorySortable();
}

function initMemorySortable() {
  const container = document.getElementById('memory-bar');
  if (!container || typeof Sortable === 'undefined') return;

  if (container._sortable) {
    container._sortable.destroy();
  }

  container._sortable = new Sortable(container, {
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    delay: 200,
    onEnd(evt) {
      const item = MemoryState.slots.splice(evt.oldIndex, 1)[0];
      MemoryState.slots.splice(evt.newIndex, 0, item);
      saveMemorySlots();
      updateMemoryUI();
    }
  });
}

function clearAllMemory() {
  if (!MemoryState.slots.some(s => s !== null)) return;
  MemoryState.slots.fill(null);
  saveMemorySlots();
  updateMemoryUI();
}

function saveMemorySlots() {
  try {
    localStorage.setItem('rhythm-chart-memory', JSON.stringify(MemoryState.slots));
  } catch (_) {}
}

function loadMemorySlots() {
  try {
    const raw = localStorage.getItem('rhythm-chart-memory');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      MemoryState.slots = data;
      while (MemoryState.slots.length < 16) MemoryState.slots.push(null);
      MemoryState.slots.length = 16;
      updateMemoryUI();
    }
  } catch (_) {}
}

// ======== DIATONIC BAR ========

function buildDiatonicBar() {
  updateDiatonicBar();
}

function updateDiatonicBar() {
  const container = document.getElementById('diatonic-bar');
  if (!container) return;
  container.innerHTML = '';

  const chords = getDiatonicChords(ChartState.key, ChartState.scaleType, ChartState.use7th);
  const degreeLabels = ChartState.scaleType === 'major'
    ? ['I','ii','iii','IV','V','vi','vii\u00B0']
    : ['i','ii\u00B0','III','iv','v','VI','VII'];
  const degreeLabels7 = ChartState.scaleType === 'major'
    ? ['I\u25B37','ii7','iii7','IV\u25B37','V7','vi7','vii\u00F87']
    : ['i7','ii\u00F87','III\u25B37','iv7','v7','VI\u25B37','VII7'];

  const labels = ChartState.use7th ? degreeLabels7 : degreeLabels;

  chords.forEach((chord, i) => {
    const btn = document.createElement('button');
    btn.className = 'diatonic-btn';
    btn.innerHTML = `<span class="diatonic-degree">${labels[i]}</span><span class="diatonic-name">${chord.name}</span>`;
    btn.addEventListener('click', () => {
      const success = placeChord(chord.name);
      if (success) {
        addToMemory(ChartState.lastPlacedChord);
        advanceCursor();
        saveChart();
      }
    });
    container.appendChild(btn);
  });
}

// ======== KEY / SCALE SELECT ========

function initKeySelect() {
  const keySelect = document.getElementById('key-select');
  if (!keySelect) return;

  keySelect.value = ChartState.key;
  keySelect.addEventListener('change', () => {
    ChartState.key = parseInt(keySelect.value);
    updateDiatonicBar();
    highlightDiatonicRoots();
    saveChart();
  });

  const scaleSelect = document.getElementById('scale-select');
  if (scaleSelect) {
    scaleSelect.value = ChartState.scaleType;
    scaleSelect.addEventListener('change', () => {
      ChartState.scaleType = scaleSelect.value;
      updateDiatonicBar();
      highlightDiatonicRoots();
      saveChart();
    });
  }
}

function initScaleToggle() {
  const btn = document.getElementById('btn-7th-toggle');
  if (!btn) return;
  btn.classList.toggle('active', ChartState.use7th);
  btn.textContent = ChartState.use7th ? '7th' : 'Triad';
  btn.addEventListener('click', () => {
    ChartState.use7th = !ChartState.use7th;
    btn.classList.toggle('active', ChartState.use7th);
    btn.textContent = ChartState.use7th ? '7th' : 'Triad';
    updateDiatonicBar();
    saveChart();
  });
}

// ======== REPEAT (single chord) ========

function repeatLastChord() {
  if (!ChartState.lastPlacedChord) return false;
  const success = placeChord(ChartState.lastPlacedChord.name);
  if (success) {
    advanceCursor();
    saveChart();
  }
  return success;
}

// ======== SYNC BUILDER FROM CHORD NAME ========

function syncBuilderToChord(chordName) {
  if (BuilderState._syncing) return;
  const parsed = parseChordName(chordName);
  if (!parsed) return;

  const rootResult = parseRoot(chordName);
  if (!rootResult) return;

  BuilderState.root = rootResult.pc;
  BuilderState.bass = parsed.bass;
  BuilderState.quality = null;
  BuilderState.tension = null;
  BuilderState.step = 1;

  const qualityStr = parsed.quality;

  // Match quality from BUILDER_QUALITIES by name
  for (const row of BUILDER_QUALITIES) {
    for (const q of row) {
      if (q.name === qualityStr) {
        BuilderState.quality = q;
        BuilderState.step = 2;
        break;
      }
    }
    if (BuilderState.quality) break;
  }

  // Fallback: try matching base quality (before parenthesized tension)
  if (!BuilderState.quality) {
    const parenIdx = qualityStr.indexOf('(');
    const baseQ = parenIdx > 0 ? qualityStr.slice(0, parenIdx) : qualityStr;

    for (const row of BUILDER_QUALITIES) {
      for (const q of row) {
        if (q.name === baseQ) {
          BuilderState.quality = q;
          BuilderState.step = 2;
          break;
        }
      }
      if (BuilderState.quality) break;
    }

    // Empty quality = Major
    if (!BuilderState.quality && baseQ === '') {
      BuilderState.quality = BUILDER_QUALITIES[0][0]; // Maj
      BuilderState.step = 2;
    }
  }

  BuilderState.bassInputMode = false;

  // Update UI — show Step 1 with Next button visible (quality selected)
  highlightPianoKey('piano-root', BuilderState.root);
  if (BuilderState.quality) {
    highlightQuality(BuilderState.quality);
    updateControlsForQuality(BuilderState.quality);
  }
  if (BuilderState.bass !== null) {
    highlightPianoKey('onchord-keyboard', BuilderState.bass);
  }
  setBuilderStep(1);
  updateBuilderUI();
}

// ======== KEYBOARD: Root selection by letter ========

function handleBuilderKey(key) {
  const letterMap = { 'A': 9, 'B': 11, 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7 };
  const pc = letterMap[key.toUpperCase()];
  if (pc !== undefined) {
    selectBuilderRoot(pc);
    return true;
  }
  return false;
}
