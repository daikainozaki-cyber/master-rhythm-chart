// ========================================
// BUILDER — Chord Builder, Memory Slots, Diatonic Bar, Tab Switching
// ========================================

// ======== STATE ========

const BuilderState = {
  root: null,        // 0-11 pitch class
  quality: null,     // {name, label}
  tension: null,     // {label, suffix, replacesQuality}
  bass: null,        // 0-11 pitch class (slash chord)
  bassInputMode: false,
  step: 0,           // 0=idle, 1=root selected, 2=quality selected
};

const MemoryState = {
  slots: Array(16).fill(null),  // [{name, midiNotes}, ...]
};

// ======== INITIALIZATION ========

function initBuilder() {
  buildRootButtons();
  buildQualityGrid();
  buildTensionGrid();
  buildDiatonicBar();
  initMemorySlots();
  initBuilderToggle();
  initKeySelect();
  initScaleToggle();
  loadMemorySlots();
  updateBuilderUI();
  updateDiatonicBar();
  initIncremental();
}

// ======== BUILDER PANEL TOGGLE (replaces tab switching) ========

function initBuilderToggle() {
  const toggleBtn = document.getElementById('btn-builder-toggle');
  const panel = document.getElementById('builder-panel');
  if (!toggleBtn || !panel) return;

  // Default: expanded
  panel.style.display = '';
  toggleBtn.textContent = '\u25BC Builder';

  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? '' : 'none';
    toggleBtn.textContent = (isHidden ? '\u25BC' : '\u25B6') + ' Builder';
  });
}

// ======== ROOT BUTTONS ========

function buildRootButtons() {
  const container = document.getElementById('builder-roots');
  if (!container) return;
  container.innerHTML = '';

  NOTE_NAMES_SHARP.forEach((name, pc) => {
    const btn = document.createElement('button');
    btn.className = 'builder-btn root-btn';
    btn.textContent = name;
    btn.dataset.pc = pc;
    btn.addEventListener('click', () => selectBuilderRoot(pc));
    container.appendChild(btn);
  });
}

function selectBuilderRoot(pc) {
  if (BuilderState.bassInputMode) {
    BuilderState.bass = pc;
    BuilderState.bassInputMode = false;
    // Rebuild the chord name with bass
    commitBuilderChord();
    return;
  }

  BuilderState.root = pc;
  BuilderState.quality = null;
  BuilderState.tension = null;
  BuilderState.bass = null;
  BuilderState.step = 1;
  updateBuilderUI();
}

// ======== QUALITY GRID ========

function buildQualityGrid() {
  const container = document.getElementById('builder-qualities');
  if (!container) return;
  container.innerHTML = '';

  BUILDER_QUALITIES.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'builder-row';
    row.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'builder-btn quality-btn';
      btn.textContent = q.label;
      btn.dataset.name = q.name;
      btn.addEventListener('click', () => selectBuilderQuality(q));
      rowDiv.appendChild(btn);
    });
    container.appendChild(rowDiv);
  });
}

function selectBuilderQuality(q) {
  if (BuilderState.root === null) return;
  BuilderState.quality = q;
  BuilderState.tension = null;
  BuilderState.step = 2;
  // Immediately place chord
  commitBuilderChord();
  renderTensionButtons(q.name);
  updateBuilderUI();
}

// ======== TENSION GRID ========

function buildTensionGrid() {
  // Initial render: only static row (no quality selected yet)
  renderTensionButtons(null);
}

function renderTensionButtons(baseQuality) {
  const container = document.getElementById('builder-tensions');
  if (!container) return;
  container.innerHTML = '';

  // Row 1: Quality replacements (always shown)
  const replaceRow = document.createElement('div');
  replaceRow.className = 'builder-row';
  [
    {label:'sus4', suffix:'sus4', replacesQuality:true},
    {label:'sus2', suffix:'sus2', replacesQuality:true},
    {label:'add9', suffix:'add9', replacesQuality:true},
    {label:'9',    suffix:'9',    replacesQuality:true},
  ].forEach(t => {
    replaceRow.appendChild(makeTensionBtn(t, false));
  });
  container.appendChild(replaceRow);

  if (!baseQuality) return;

  // Scan QUALITY_INTERVALS for parenthesized tensions on this quality
  const single = [];
  const multi = [];
  for (const key of QUALITY_KEYS) {
    if (!key.startsWith(baseQuality + '(')) continue;
    const tensionPart = key.slice(baseQuality.length);
    const item = { label: tensionPart, suffix: key };
    (tensionPart.includes(',') ? multi : single).push(item);
  }

  const standards = STANDARD_TENSIONS[baseQuality] || [];

  // Sort single: standard first, then by musical order
  const tensionOrder = ['(9)','(b9)','(#9)','(11)','(#11)','(b13)','(13)','(b5)','(#5)'];
  single.sort((a, b) => {
    const aStd = standards.includes(a.label) ? 0 : 1;
    const bStd = standards.includes(b.label) ? 0 : 1;
    if (aStd !== bStd) return aStd - bStd;
    const ai = tensionOrder.indexOf(a.label);
    const bi = tensionOrder.indexOf(b.label);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  // Sort multi: all-standard combos first
  multi.sort((a, b) => {
    const aStd = isAllStandard(a.label, standards) ? 0 : 1;
    const bStd = isAllStandard(b.label, standards) ? 0 : 1;
    if (aStd !== bStd) return aStd - bStd;
    return a.label.localeCompare(b.label);
  });

  // Render single tensions
  if (single.length > 0) {
    const row = document.createElement('div');
    row.className = 'builder-row';
    single.forEach(t => {
      row.appendChild(makeTensionBtn(t, !standards.includes(t.label)));
    });
    container.appendChild(row);
  }

  // Render multi-tensions (rows of 4)
  for (let i = 0; i < multi.length; i += 4) {
    const row = document.createElement('div');
    row.className = 'builder-row';
    multi.slice(i, i + 4).forEach(t => {
      row.appendChild(makeTensionBtn(t, !isAllStandard(t.label, standards)));
    });
    container.appendChild(row);
  }
}

function isAllStandard(label, standards) {
  const inner = label.slice(1, -1);
  return inner.split(',').every(p => standards.includes('(' + p.trim() + ')'));
}

function makeTensionBtn(t, isAlt) {
  const btn = document.createElement('button');
  btn.className = 'builder-btn tension-btn' + (isAlt ? ' tension-alt' : '');
  btn.textContent = t.label;
  btn.dataset.suffix = t.suffix;
  if (t.replacesQuality) btn.dataset.replaces = 'true';
  btn.addEventListener('click', () => selectBuilderTension(t));
  return btn;
}

function selectBuilderTension(t) {
  if (BuilderState.root === null || BuilderState.quality === null) return;
  BuilderState.tension = t;
  // Overwrite the last placed chord
  replaceLastPlacedChord();
  updateBuilderUI();
}

function updateTensionAvailability() {
  // Now handled by renderTensionButtons() — kept for backward compat
  if (BuilderState.root === null) return;
  const rootName = NOTE_NAMES_SHARP[BuilderState.root];
  document.querySelectorAll('.tension-btn').forEach(btn => {
    const suffix = btn.dataset.suffix;
    const testName = rootName + suffix;
    const valid = parseChordName(testName) !== null;
    btn.disabled = !valid;
    btn.classList.toggle('btn-disabled', !valid);
  });
}

// ======== CHORD COMMIT & REPLACE ========

function buildChordName() {
  if (BuilderState.root === null) return null;
  const rootName = NOTE_NAMES_SHARP[BuilderState.root];

  let qualityStr = '';
  if (BuilderState.tension && BuilderState.tension.replacesQuality) {
    qualityStr = BuilderState.tension.suffix;
  } else if (BuilderState.tension) {
    qualityStr = BuilderState.tension.suffix;
  } else if (BuilderState.quality) {
    qualityStr = BuilderState.quality.name;
  }

  let name = rootName + qualityStr;
  if (BuilderState.bass !== null) {
    name += '/' + NOTE_NAMES_SHARP[BuilderState.bass];
  }
  return name;
}

function commitBuilderChord() {
  const name = buildChordName();
  if (!name) return;

  const success = placeChord(name);
  if (success) {
    addToMemory(ChartState.lastPlacedChord);
    advanceCursor();
    saveChart();
    updateBuilderPreview();
  }
}

function replaceLastPlacedChord() {
  const prev = ChartState.previousCursorPosition;
  if (!prev) return;

  const name = buildChordName();
  if (!name) return;

  // Temporarily move cursor back to overwrite
  const savedCursor = { ...ChartState.cursor };
  ChartState.cursor.sectionIndex = prev.sectionIndex;
  ChartState.cursor.measure = prev.measure;
  ChartState.cursor.beat = prev.beat;

  const success = placeChord(name);
  if (success) {
    addToMemory(ChartState.lastPlacedChord);
    // Restore cursor (don't advance again — already advanced)
    ChartState.cursor = savedCursor;
    saveChart();
    renderChart();
    updateBuilderPreview();
  }
}

// ======== BUILDER UI UPDATE ========

function updateBuilderUI() {
  // Highlight active root
  document.querySelectorAll('.root-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.pc) === BuilderState.root);
  });

  // Highlight active quality
  document.querySelectorAll('.quality-btn').forEach(btn => {
    const isActive = BuilderState.quality && btn.dataset.name === BuilderState.quality.name;
    btn.classList.toggle('active', !!isActive);
  });

  // Highlight active tension
  document.querySelectorAll('.tension-btn').forEach(btn => {
    const isActive = BuilderState.tension && btn.dataset.suffix === BuilderState.tension.suffix;
    btn.classList.toggle('active', !!isActive);
  });

  // Enable/disable quality buttons based on root selection
  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.disabled = BuilderState.root === null;
  });

  // Enable/disable tension buttons based on quality selection
  const hasBasis = BuilderState.root !== null && BuilderState.quality !== null;
  document.querySelectorAll('.tension-btn').forEach(btn => {
    if (!hasBasis) {
      btn.disabled = true;
      btn.classList.add('btn-disabled');
    }
  });

  // Step indicator
  const stepEl = document.getElementById('builder-step');
  if (stepEl) {
    const steps = ['Root', 'Quality', 'Tension / Bass'];
    stepEl.textContent = 'Step: ' + steps[Math.min(BuilderState.step, 2)];
  }

  // Bass mode indicator
  const bassBtn = document.getElementById('btn-bass');
  if (bassBtn) {
    bassBtn.classList.toggle('active', BuilderState.bassInputMode);
  }

  // Highlight diatonic roots
  highlightDiatonicRoots();

  updateBuilderPreview();
}

function updateBuilderPreview() {
  const el = document.getElementById('builder-preview');
  if (!el) return;
  const name = buildChordName();
  el.textContent = name ? 'Preview: ' + name : '';
}

function highlightDiatonicRoots() {
  const chords = getDiatonicChords(ChartState.key, ChartState.scaleType, ChartState.use7th);
  const diatonicPcs = new Set(chords.map(c => {
    const parsed = parseRoot(c.name);
    return parsed ? parsed.pc : -1;
  }));

  document.querySelectorAll('.root-btn').forEach(btn => {
    btn.classList.toggle('diatonic', diatonicPcs.has(parseInt(btn.dataset.pc)));
  });
}

function resetBuilder() {
  BuilderState.root = null;
  BuilderState.quality = null;
  BuilderState.tension = null;
  BuilderState.bass = null;
  BuilderState.bassInputMode = false;
  BuilderState.step = 0;
  updateBuilderUI();
}

// ======== SLASH CHORD (BASS) ========

function toggleBassMode() {
  if (BuilderState.root === null || BuilderState.quality === null) return;
  BuilderState.bassInputMode = !BuilderState.bassInputMode;
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
  // Check for duplicates
  if (MemoryState.slots.some(s => s && s.name === chord.name)) return;
  // Find first empty slot
  const emptyIdx = MemoryState.slots.indexOf(null);
  if (emptyIdx >= 0) {
    MemoryState.slots[emptyIdx] = { name: chord.name, midiNotes: [...chord.midiNotes] };
  } else {
    // FIFO: shift first, push to end
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

    // Number label + chord name
    const numSpan = document.createElement('span');
    numSpan.className = 'memory-num';
    numSpan.textContent = (i + 1);
    btn.appendChild(numSpan);

    if (slot) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'memory-name';
      nameSpan.textContent = slot.name;
      btn.appendChild(nameSpan);

      // D&D: draggable for memory → grid
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

  // Destroy existing instance if any
  if (container._sortable) {
    container._sortable.destroy();
  }

  container._sortable = new Sortable(container, {
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    delay: 200, // Prevent accidental drag on click
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

// ======== KEY SELECT ========

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

  // Check replace-type items (sus4, sus2, add9, 9)
  const replaceItems = ['sus4', 'sus2', 'add9', '9'];
  if (replaceItems.includes(qualityStr)) {
    BuilderState.quality = { name: '', label: 'Maj' };
    BuilderState.tension = { label: qualityStr, suffix: qualityStr, replacesQuality: true };
    BuilderState.step = 2;
  } else {
    // Split parenthesized tension: "7(b9)" → base="7", tension="(b9)"
    const parenIdx = qualityStr.indexOf('(');
    const baseQ = parenIdx > 0 ? qualityStr.slice(0, parenIdx) : qualityStr;
    const tensionLabel = parenIdx > 0 ? qualityStr.slice(parenIdx) : null;

    // Match base quality from BUILDER_QUALITIES
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

    // Fallback: empty quality = Major
    if (!BuilderState.quality && baseQ === '') {
      BuilderState.quality = { name: '', label: 'Maj' };
      BuilderState.step = 2;
    }

    // Set tension if parenthesized part exists
    if (tensionLabel && BuilderState.quality) {
      BuilderState.tension = { label: tensionLabel, suffix: qualityStr };
    }
  }

  BuilderState.bassInputMode = false;
  renderTensionButtons(BuilderState.quality ? BuilderState.quality.name : null);
  updateBuilderUI();
}

// ======== KEYBOARD: Root selection by letter ========

function handleBuilderKey(key) {
  // Map A-G to pitch classes for builder root selection
  const letterMap = { 'A': 9, 'B': 11, 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7 };
  const pc = letterMap[key.toUpperCase()];
  if (pc !== undefined) {
    selectBuilderRoot(pc);
    return true;
  }
  return false;
}
