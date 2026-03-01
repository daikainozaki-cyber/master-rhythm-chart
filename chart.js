// ========================================
// CHART — Grid State, Rendering, Cursor, Playback (Phase 5: Section-based)
// ========================================

const ChartState = {
  title: '',
  tempo: 120,
  measuresPerLine: 4,
  key: 0,
  scaleType: 'major',
  use7th: false,

  // Section-based structure (Phase 5)
  sections: [],
  form: ['A'],

  // Cursor (section-relative)
  cursor: { sectionIndex: 0, measure: 0, beat: 0 },

  // Playback (section-relative or form-based)
  playing: false,
  playTimer: null,
  playSectionIndex: 0,
  playFormIndex: 0,
  useFormPlayback: false,
  playMeasure: 0,
  playBeat: 0,
  lastPlayedChord: null,

  // Editing state
  lastPlacedChord: null,
  previousCursorPosition: null, // {sectionIndex, measure, beat}
  repeatRange: null,            // {start, end} — flat measure indices

  // Click pattern: 'off', 'all', '24' (backbeat)
  clickPattern: 'all',
};

// ======== UNDO / REDO ========

const UndoStack = { past: [], future: [], max: 50 };

function pushUndo() {
  UndoStack.future = [];
  const snap = JSON.stringify({
    sections: ChartState.sections,
    cursor: { ...ChartState.cursor },
  });
  UndoStack.past.push(snap);
  if (UndoStack.past.length > UndoStack.max) UndoStack.past.shift();
}

function undo() {
  if (UndoStack.past.length === 0) return;
  UndoStack.future.push(JSON.stringify({
    sections: ChartState.sections,
    cursor: { ...ChartState.cursor },
  }));
  const snap = JSON.parse(UndoStack.past.pop());
  ChartState.sections = snap.sections;
  ChartState.cursor = snap.cursor;
  renderChart();
  saveChart();
}

function redo() {
  if (UndoStack.future.length === 0) return;
  UndoStack.past.push(JSON.stringify({
    sections: ChartState.sections,
    cursor: { ...ChartState.cursor },
  }));
  const snap = JSON.parse(UndoStack.future.pop());
  ChartState.sections = snap.sections;
  ChartState.cursor = snap.cursor;
  renderChart();
  saveChart();
}

// ======== SECTION HELPERS ========

function getTotalMeasures() {
  return ChartState.sections.reduce((sum, s) => sum + s.measures.length, 0);
}

function getCurrentSection() {
  return ChartState.sections[ChartState.cursor.sectionIndex];
}

function getCurrentBeatsPerMeasure() {
  return getCurrentSection().timeSignature.beats;
}

function getCursorFlat() {
  return sectionToFlat(ChartState.cursor.sectionIndex, ChartState.cursor.measure);
}

function sectionToFlat(sectionIndex, measure) {
  let flat = 0;
  for (let i = 0; i < sectionIndex; i++) {
    flat += ChartState.sections[i].measures.length;
  }
  return flat + measure;
}

function flatToSection(flatIdx) {
  let count = 0;
  for (let i = 0; i < ChartState.sections.length; i++) {
    const sec = ChartState.sections[i];
    if (flatIdx < count + sec.measures.length) {
      return { sectionIndex: i, measure: flatIdx - count };
    }
    count += sec.measures.length;
  }
  // Past end — clamp to last valid position
  const lastSec = ChartState.sections.length - 1;
  return {
    sectionIndex: lastSec,
    measure: Math.max(0, ChartState.sections[lastSec].measures.length - 1),
  };
}

function getMeasureAt(flatIdx) {
  const pos = flatToSection(flatIdx);
  return ChartState.sections[pos.sectionIndex].measures[pos.measure];
}

function getBeatsPerMeasureAt(flatIdx) {
  const pos = flatToSection(flatIdx);
  return ChartState.sections[pos.sectionIndex].timeSignature.beats;
}

// ======== ENDING / VOLTA BRACKET HELPERS ========

function shouldPlayMeasure(measure, occurrence) {
  const ending = measure.ending;
  if (!ending) return true;
  if (ending === 1) return occurrence === 1;
  if (ending === 2) return occurrence >= 2;
  return true;
}

function getFormOccurrence(formIndex) {
  const id = ChartState.form[formIndex];
  let count = 0;
  for (let i = 0; i <= formIndex; i++) {
    if (ChartState.form[i] === id) count++;
  }
  return count;
}

function getFormSection(formIndex) {
  if (formIndex < 0 || formIndex >= ChartState.form.length) return null;
  const id = ChartState.form[formIndex];
  return ChartState.sections.find(s => s.id === id) || null;
}

function getFormSectionIndex(formIndex) {
  if (formIndex < 0 || formIndex >= ChartState.form.length) return -1;
  const id = ChartState.form[formIndex];
  return ChartState.sections.findIndex(s => s.id === id);
}

function getEndingGroups(measures) {
  const groups = [];
  let current = null;
  for (let i = 0; i < measures.length; i++) {
    const e = measures[i].ending;
    if (e) {
      if (current && current.ending === e && current.end === i - 1) {
        current.end = i;
      } else {
        current = { start: i, end: i, ending: e };
        groups.push(current);
      }
    } else {
      current = null;
    }
  }
  return groups;
}

function setMeasureEnding(flatIdx, ending) {
  pushUndo();

  if (ChartState.repeatRange) {
    // Range mode: apply ending to all measures in range
    const { start, end } = ChartState.repeatRange;
    // Toggle: if ALL measures in range already have this ending, clear them
    let allSame = true;
    for (let i = start; i <= end; i++) {
      const m = getMeasureAt(i);
      if (m && m.ending !== ending) { allSame = false; break; }
    }
    const newVal = allSame ? null : ending;
    for (let i = start; i <= end; i++) {
      const m = getMeasureAt(i);
      if (m) m.ending = newVal;
    }
    clearRepeatRange();
  } else {
    const measure = getMeasureAt(flatIdx);
    if (!measure) return;

    if (measure.ending === ending) {
      // Same ending → extend to next measure + advance cursor
      const nextFlat = flatIdx + 1;
      if (nextFlat < getTotalMeasures()) {
        const nextM = getMeasureAt(nextFlat);
        if (nextM) {
          nextM.ending = ending;
          const pos = flatToSection(nextFlat);
          ChartState.cursor.sectionIndex = pos.sectionIndex;
          ChartState.cursor.measure = pos.measure;
          ChartState.cursor.beat = 0;
        }
      } else {
        // At the very end → clear
        measure.ending = null;
      }
    } else {
      // No ending or different ending → set
      measure.ending = ending;
    }
  }

  renderChart();
  saveChart();
}

// ======== INITIALIZATION ========

function initChart() {
  ChartState.sections = [{
    id: 'A',
    label: 'A',
    timeSignature: { beats: 4, noteValue: 4 },
    measures: [],
  }];
  ChartState.form = ['A'];
  for (let i = 0; i < 16; i++) {
    ChartState.sections[0].measures.push({ chords: [] });
  }
  ChartState.cursor = { sectionIndex: 0, measure: 0, beat: 0 };
  renderChart();
}

// ======== RENDERING ========

function renderChart() {
  const grid = document.getElementById('chart-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const { measuresPerLine, cursor } = ChartState;

  ChartState.sections.forEach((section, secIdx) => {
    // Section header (rehearsal mark)
    const secHeader = document.createElement('div');
    secHeader.className = 'section-header';
    secHeader.textContent = section.label;
    grid.appendChild(secHeader);

    const bpm = section.timeSignature.beats;
    const sectionLen = section.measures.length;
    const endingGroups = getEndingGroups(section.measures);
    const lines = Math.ceil(sectionLen / measuresPerLine);

    for (let line = 0; line < lines; line++) {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'chart-line';

      // Line number (section-relative)
      const lineNum = document.createElement('div');
      lineNum.className = 'line-number';
      lineNum.textContent = (line * measuresPerLine + 1);
      lineDiv.appendChild(lineNum);

      for (let col = 0; col < measuresPerLine; col++) {
        const mIdx = line * measuresPerLine + col;
        if (mIdx >= sectionLen) break;

        const measure = section.measures[mIdx];
        const mDiv = document.createElement('div');
        mDiv.className = 'measure';
        mDiv.style.gridTemplateColumns = `repeat(${bpm}, 1fr)`;

        // Volta bracket (ending markers)
        if (measure.ending) {
          mDiv.classList.add('ending-' + measure.ending);
          const group = endingGroups.find(g => mIdx >= g.start && mIdx <= g.end && g.ending === measure.ending);
          if (group) {
            if (group.start === mIdx) {
              mDiv.classList.add('ending-start');
              const endLabel = document.createElement('span');
              endLabel.className = 'ending-label';
              endLabel.textContent = measure.ending + '.';
              mDiv.appendChild(endLabel);
            }
            if (group.end === mIdx) {
              mDiv.classList.add('ending-end');
            }
          }
        }

        for (let b = 0; b < bpm; b++) {
          const beatDiv = document.createElement('div');
          beatDiv.className = 'beat';

          // Find chord at this beat
          const chord = measure.chords.find(c => c.beat === b);
          if (chord) {
            beatDiv.textContent = chord.name;
            beatDiv.classList.add('has-chord');
            beatDiv.draggable = true;
          }

          // Cursor
          if (!ChartState.playing && secIdx === cursor.sectionIndex && mIdx === cursor.measure && b === cursor.beat) {
            beatDiv.classList.add('cursor');
          }

          // Playback position
          if (ChartState.playing && secIdx === ChartState.playSectionIndex && mIdx === ChartState.playMeasure && b === ChartState.playBeat) {
            beatDiv.classList.add('playing');
          }

          // Repeat range (flat index comparison)
          if (ChartState.repeatRange) {
            const flatIdx = sectionToFlat(secIdx, mIdx);
            const { start, end } = ChartState.repeatRange;
            if (flatIdx >= start && flatIdx <= end) {
              beatDiv.classList.add('in-repeat-range');
            }
            if (flatIdx === start && b === 0) {
              beatDiv.classList.add('repeat-start');
            }
            if (flatIdx === end && b === bpm - 1) {
              beatDiv.classList.add('repeat-end');
            }
          }

          // Click handler — capture loop vars via const/let block scope
          const si = secIdx, mi = mIdx, bt = b;
          beatDiv.addEventListener('click', (ev) => {
            if (ChartState.playing) return;
            if (ev.shiftKey) {
              setRepeatRangePoint(sectionToFlat(si, mi));
              return;
            }
            setCursorInSection(si, mi, bt);
            const clickChord = ChartState.sections[si].measures[mi].chords.find(c => c.beat === bt);
            const incInput = document.getElementById('incremental-input');
            if (clickChord && incInput) {
              incInput.value = clickChord.name;
              incInput.focus();
              incInput.dispatchEvent(new Event('input'));
              if (typeof syncBuilderToChord === 'function') syncBuilderToChord(clickChord.name);
            }
          });

          // D&D drop target (memory → grid)
          beatDiv.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            beatDiv.classList.add('drag-over');
          });
          beatDiv.addEventListener('dragleave', () => {
            beatDiv.classList.remove('drag-over');
          });
          beatDiv.addEventListener('drop', (ev) => {
            ev.preventDefault();
            beatDiv.classList.remove('drag-over');
            const chordName = ev.dataTransfer.getData('text/plain');
            if (chordName) {
              setCursorInSection(si, mi, bt);
              const success = placeChord(chordName);
              if (success) {
                addToMemory(ChartState.lastPlacedChord);
                saveChart();
              }
            }
          });

          mDiv.appendChild(beatDiv);
        }

        lineDiv.appendChild(mDiv);
      }

      grid.appendChild(lineDiv);
    }
  });

  updatePlayButton();
  updateBarsInput();
  renderSectionBar();
  updateEndingButtons();
}

function updateBarsInput() {
  const barsInput = document.getElementById('bars-input');
  if (barsInput) {
    const sec = ChartState.sections[ChartState.cursor.sectionIndex];
    if (sec) barsInput.value = sec.measures.length;
  }
}

// ======== SECTION BAR ========

function renderSectionBar() {
  const bar = document.getElementById('section-bar');
  if (!bar) return;
  bar.innerHTML = '';

  ChartState.sections.forEach((section, idx) => {
    const tab = document.createElement('div');
    tab.className = 'section-tab' + (idx === ChartState.cursor.sectionIndex ? ' active' : '');

    const label = document.createElement('span');
    label.className = 'section-tab-label';
    label.textContent = section.label;

    const info = document.createElement('span');
    info.className = 'section-tab-info';
    info.textContent = section.measures.length + 'bars';

    const ts = document.createElement('span');
    ts.className = 'section-tab-ts';
    ts.textContent = section.timeSignature.beats + '/' + section.timeSignature.noteValue;

    // Click on tab → jump to section
    tab.addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('section-tab-info')) {
        e.stopPropagation();
        const newBars = prompt('Bars for [' + section.label + ']:', section.measures.length);
        if (newBars) {
          const val = parseInt(newBars);
          if (val >= 1 && val <= 128) setSectionMeasures(idx, val);
        }
        return;
      }
      if (target.classList.contains('section-tab-ts')) {
        e.stopPropagation();
        const beats = section.timeSignature.beats;
        const next = beats === 4 ? 3 : beats === 3 ? 5 : 4;
        updateSectionTimeSignature(idx, next);
        return;
      }
      setCursorInSection(idx, 0, 0);
    });

    // Double-click on label → rename
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const newLabel = prompt('Section name:', section.label);
      if (newLabel && newLabel.trim()) updateSectionLabel(idx, newLabel.trim());
    });

    // Context menu → delete
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ChartState.sections.length > 1 && confirm('Delete section [' + section.label + ']?')) {
        removeSection(idx);
      }
    });

    tab.appendChild(label);
    tab.appendChild(info);
    tab.appendChild(ts);
    bar.appendChild(tab);
  });

  // Add section button
  const addBtn = document.createElement('button');
  addBtn.className = 'section-add-btn';
  addBtn.textContent = '+';
  addBtn.title = 'Add section';
  addBtn.addEventListener('click', () => addSection());
  bar.appendChild(addBtn);

  // Form display
  const formEl = document.getElementById('form-display');
  if (formEl) {
    formEl.textContent = 'Form: ' + ChartState.form.join(' \u2192 ');
    formEl.onclick = () => {
      const newForm = prompt('Form (comma separated):', ChartState.form.join(', '));
      if (newForm) {
        ChartState.form = newForm.split(',').map(s => s.trim()).filter(Boolean);
        saveChart();
        renderSectionBar();
      }
    };
  }
}

function updateEndingButtons() {
  const section = getCurrentSection();
  const measure = section ? section.measures[ChartState.cursor.measure] : null;
  const ending = measure ? measure.ending : null;
  const btn1 = document.getElementById('btn-ending-1');
  const btn2 = document.getElementById('btn-ending-2');
  if (btn1) btn1.classList.toggle('active', ending === 1);
  if (btn2) btn2.classList.toggle('active', ending === 2);
}

// ======== SECTION MANAGEMENT ========

function addSection(label, beats, measureCount) {
  const nextChar = String.fromCharCode(65 + ChartState.sections.length);
  label = label || nextChar;
  beats = beats || 4;
  measureCount = measureCount || 8;

  pushUndo();
  const section = {
    id: label,
    label: label,
    timeSignature: { beats: beats, noteValue: 4 },
    measures: [],
  };
  for (let i = 0; i < measureCount; i++) {
    section.measures.push({ chords: [] });
  }
  ChartState.sections.push(section);
  ChartState.form.push(label);
  renderChart();
  saveChart();
}

function removeSection(sectionIndex) {
  if (ChartState.sections.length <= 1) return;
  pushUndo();
  const removed = ChartState.sections.splice(sectionIndex, 1)[0];
  ChartState.form = ChartState.form.filter(f => f !== removed.id);
  if (ChartState.form.length === 0) ChartState.form = [ChartState.sections[0].id];
  if (ChartState.cursor.sectionIndex >= ChartState.sections.length) {
    ChartState.cursor.sectionIndex = ChartState.sections.length - 1;
    ChartState.cursor.measure = 0;
    ChartState.cursor.beat = 0;
  }
  renderChart();
  saveChart();
}

function updateSectionLabel(sectionIndex, newLabel) {
  const section = ChartState.sections[sectionIndex];
  if (!section) return;
  const oldId = section.id;
  section.id = newLabel;
  section.label = newLabel;
  ChartState.form = ChartState.form.map(f => f === oldId ? newLabel : f);
  renderSectionBar();
  saveChart();
}

function updateSectionTimeSignature(sectionIndex, beats) {
  pushUndo();
  const section = ChartState.sections[sectionIndex];
  if (!section) return;
  section.timeSignature.beats = beats;
  if (ChartState.cursor.sectionIndex === sectionIndex && ChartState.cursor.beat >= beats) {
    ChartState.cursor.beat = beats - 1;
  }
  renderChart();
  saveChart();
}

function setSectionMeasures(sectionIndex, newTotal) {
  if (newTotal < 1 || newTotal > 128) return;
  pushUndo();
  const section = ChartState.sections[sectionIndex];
  if (newTotal > section.measures.length) {
    while (section.measures.length < newTotal) {
      section.measures.push({ chords: [] });
    }
  } else {
    section.measures.length = newTotal;
    if (ChartState.cursor.sectionIndex === sectionIndex && ChartState.cursor.measure >= newTotal) {
      ChartState.cursor.measure = newTotal - 1;
    }
  }
  renderChart();
  saveChart();
}

// Backward compat: applies to current section
function setTotalMeasures(newTotal) {
  setSectionMeasures(ChartState.cursor.sectionIndex, newTotal);
}

// ======== CURSOR ========

// setCursor accepts flat measure index (backward compatible with app.js/incremental.js)
function setCursor(flatMeasure, beat) {
  const total = getTotalMeasures();
  flatMeasure = Math.max(0, Math.min(flatMeasure, total - 1));
  const pos = flatToSection(flatMeasure);
  const bpm = ChartState.sections[pos.sectionIndex].timeSignature.beats;
  beat = Math.max(0, Math.min(beat, bpm - 1));
  ChartState.cursor.sectionIndex = pos.sectionIndex;
  ChartState.cursor.measure = pos.measure;
  ChartState.cursor.beat = beat;
  renderChart();
}

// setCursorInSection: direct section-relative positioning
function setCursorInSection(sectionIndex, measure, beat) {
  const sec = ChartState.sections[sectionIndex];
  if (!sec) return;
  measure = Math.max(0, Math.min(measure, sec.measures.length - 1));
  beat = Math.max(0, Math.min(beat, sec.timeSignature.beats - 1));
  ChartState.cursor.sectionIndex = sectionIndex;
  ChartState.cursor.measure = measure;
  ChartState.cursor.beat = beat;
  renderChart();
}

// ======== CHORD PLACEMENT ========

function placeChord(name) {
  const parsed = parseChordName(name);
  if (!parsed) return false;

  pushUndo();
  const section = getCurrentSection();
  const { measure, beat } = ChartState.cursor;
  const m = section.measures[measure];

  // Remove existing chord at this beat
  m.chords = m.chords.filter(c => c.beat !== beat);

  // Calculate MIDI notes
  const midiNotes = chordToMidi(parsed);

  // Place chord
  const chordObj = { beat, name: parsed.displayName, midiNotes };
  m.chords.push(chordObj);
  m.chords.sort((a, b) => a.beat - b.beat);

  // Track for repeat and tension overwrite
  ChartState.lastPlacedChord = { name: parsed.displayName, midiNotes };
  ChartState.previousCursorPosition = {
    sectionIndex: ChartState.cursor.sectionIndex,
    measure: measure,
    beat: beat,
  };

  // Auto-memory
  if (typeof addToMemory === 'function') addToMemory(ChartState.lastPlacedChord);

  // Sync builder
  if (typeof syncBuilderToChord === 'function') syncBuilderToChord(parsed.displayName);

  renderChart();

  // Audio feedback (don't interrupt playback)
  if (!ChartState.playing) {
    playChordStab(midiNotes, 800);
  }

  return true;
}

function removeChord() {
  const section = getCurrentSection();
  const { measure, beat } = ChartState.cursor;
  const m = section.measures[measure];
  const had = m.chords.length;
  if (m.chords.some(c => c.beat === beat)) pushUndo();
  m.chords = m.chords.filter(c => c.beat !== beat);
  if (m.chords.length !== had) renderChart();
}

// ======== PLAYBACK ========

function togglePlay() {
  if (ChartState.playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  ChartState.playing = true;
  ChartState.lastPlayedChord = null;
  resetVoiceLead();

  if (ChartState.repeatRange) {
    // Repeat range: linear mode (no form, no endings)
    ChartState.useFormPlayback = false;
    const startPos = flatToSection(ChartState.repeatRange.start);
    ChartState.playSectionIndex = startPos.sectionIndex;
    ChartState.playMeasure = startPos.measure;
    ChartState.playBeat = 0;
  } else {
    // Form-based playback
    ChartState.useFormPlayback = true;
    const curSectionId = ChartState.sections[ChartState.cursor.sectionIndex].id;
    let formIdx = ChartState.form.indexOf(curSectionId);
    if (formIdx < 0) formIdx = 0;
    ChartState.playFormIndex = formIdx;
    ChartState.playSectionIndex = ChartState.cursor.sectionIndex;
    ChartState.playMeasure = ChartState.cursor.measure;
    ChartState.playBeat = ChartState.cursor.beat;
  }

  renderChart();
  playStep();
}

function stopPlayback() {
  ChartState.playing = false;
  if (ChartState.playTimer) {
    clearTimeout(ChartState.playTimer);
    ChartState.playTimer = null;
  }
  ChartState.lastPlayedChord = null;
  stopAllAudio();
  renderChart();
}

function playStep() {
  if (!ChartState.playing) return;

  const beatMs = 60000 / ChartState.tempo;
  let section, secIdx, bpm;

  if (ChartState.useFormPlayback) {
    // Form-based playback with ending logic
    if (ChartState.playFormIndex >= ChartState.form.length) {
      ChartState.playTimer = setTimeout(() => stopPlayback(), beatMs);
      return;
    }
    secIdx = getFormSectionIndex(ChartState.playFormIndex);
    if (secIdx < 0) { stopPlayback(); return; }
    section = ChartState.sections[secIdx];
    ChartState.playSectionIndex = secIdx;

    // Skip non-playable measures (ending mismatch)
    const occurrence = getFormOccurrence(ChartState.playFormIndex);
    while (ChartState.playMeasure < section.measures.length &&
           !shouldPlayMeasure(section.measures[ChartState.playMeasure], occurrence)) {
      ChartState.playMeasure++;
    }
    if (ChartState.playMeasure >= section.measures.length) {
      ChartState.playFormIndex++;
      ChartState.playMeasure = 0;
      ChartState.playBeat = 0;
      ChartState.lastPlayedChord = null;
      playStep();
      return;
    }
  } else {
    // Linear playback (repeat range mode)
    secIdx = ChartState.playSectionIndex;
    section = ChartState.sections[secIdx];
    if (!section) { stopPlayback(); return; }
  }

  bpm = section.timeSignature.beats;
  const measure = section.measures[ChartState.playMeasure];
  if (!measure) { stopPlayback(); return; }

  // Click pattern
  if (ChartState.clickPattern === 'all') {
    playClick(ChartState.playBeat === 0);
  } else if (ChartState.clickPattern === '24') {
    if (ChartState.playBeat === 1 || ChartState.playBeat === 3) {
      playClick(true);
    }
  }

  // Play chord with voice leading at current beat
  const chord = measure.chords.find(c => c.beat === ChartState.playBeat);
  if (chord && chord !== ChartState.lastPlayedChord) {
    const parsed = parseChordName(chord.name);
    if (parsed) {
      const voicing = getVoiceLeadVoicing(parsed);
      playChordAudio(voicing);
    }
    ChartState.lastPlayedChord = chord;
  }

  renderChart();

  // === Advance to next position ===
  let nextBeat = ChartState.playBeat + 1;
  let nextMeasure = ChartState.playMeasure;

  if (nextBeat >= bpm) {
    nextBeat = 0;
    nextMeasure++;
  }

  if (ChartState.useFormPlayback) {
    let nextFormIdx = ChartState.playFormIndex;
    const occ = getFormOccurrence(nextFormIdx);

    // Skip non-playable measures
    while (nextMeasure < section.measures.length &&
           !shouldPlayMeasure(section.measures[nextMeasure], occ)) {
      nextMeasure++;
    }

    if (nextMeasure >= section.measures.length) {
      nextFormIdx++;
      nextMeasure = 0;
      if (nextFormIdx < ChartState.form.length) {
        const nextSection = getFormSection(nextFormIdx);
        const nextOcc = getFormOccurrence(nextFormIdx);
        if (nextSection) {
          while (nextMeasure < nextSection.measures.length &&
                 !shouldPlayMeasure(nextSection.measures[nextMeasure], nextOcc)) {
            nextMeasure++;
          }
        }
      }
    }

    if (nextFormIdx >= ChartState.form.length) {
      ChartState.playTimer = setTimeout(() => stopPlayback(), beatMs);
      return;
    }

    ChartState.playFormIndex = nextFormIdx;
    ChartState.playSectionIndex = getFormSectionIndex(nextFormIdx);
    ChartState.playMeasure = nextMeasure;
    ChartState.playBeat = nextBeat;
  } else {
    // Linear mode with repeat range
    let nextSection = secIdx;
    if (nextMeasure >= section.measures.length) {
      nextMeasure = 0;
      nextSection++;
    }

    if (ChartState.repeatRange) {
      const nextFlat = nextSection < ChartState.sections.length
        ? sectionToFlat(nextSection, nextMeasure) : Infinity;
      if (nextFlat > ChartState.repeatRange.end || nextSection >= ChartState.sections.length) {
        const startPos = flatToSection(ChartState.repeatRange.start);
        nextSection = startPos.sectionIndex;
        nextMeasure = startPos.measure;
        nextBeat = 0;
        ChartState.lastPlayedChord = null;
      }
    }

    if (nextSection >= ChartState.sections.length) {
      ChartState.playTimer = setTimeout(() => stopPlayback(), beatMs);
      return;
    }

    ChartState.playSectionIndex = nextSection;
    ChartState.playMeasure = nextMeasure;
    ChartState.playBeat = nextBeat;
  }

  ChartState.playTimer = setTimeout(playStep, beatMs);
}

function updatePlayButton() {
  const btn = document.getElementById('btn-play');
  if (btn) {
    btn.textContent = ChartState.playing ? '\u25A0 Stop' : '\u25B6 Play';
    btn.classList.toggle('playing', ChartState.playing);
  }
}

// ======== REPEAT RANGE (flat indices) ========

function setRepeatRangePoint(flatIdx) {
  if (!ChartState.repeatRange) {
    ChartState.repeatRange = { start: flatIdx, end: flatIdx };
  } else if (ChartState.repeatRange.start === flatIdx && ChartState.repeatRange.end === flatIdx) {
    ChartState.repeatRange = null;
  } else {
    const s = ChartState.repeatRange.start;
    if (flatIdx < s) {
      ChartState.repeatRange.start = flatIdx;
    } else {
      ChartState.repeatRange.end = flatIdx;
    }
  }
  renderChart();
}

function copyRepeatRange() {
  if (!ChartState.repeatRange) return false;
  pushUndo();
  const { start, end } = ChartState.repeatRange;
  const rangeLen = end - start + 1;
  const cursorFlat = getCursorFlat();
  const total = getTotalMeasures();

  for (let i = 0; i < rangeLen; i++) {
    const srcFlat = start + i;
    const dstFlat = cursorFlat + i;
    if (dstFlat >= total) break;
    const src = getMeasureAt(srcFlat);
    const dst = getMeasureAt(dstFlat);
    if (!src || !dst) continue;
    dst.chords = src.chords.map(c => ({
      beat: c.beat,
      name: c.name,
      midiNotes: [...c.midiNotes],
    }));
  }
  renderChart();
  saveChart();
  return true;
}

function clearRepeatRange() {
  ChartState.repeatRange = null;
  renderChart();
}

// ======== CURSOR ADVANCE ========

function advanceCursor() {
  const section = getCurrentSection();
  const bpm = section.timeSignature.beats;
  const { sectionIndex, measure, beat } = ChartState.cursor;

  if (beat + 1 < bpm) {
    setCursorInSection(sectionIndex, measure, beat + 1);
  } else if (measure + 1 < section.measures.length) {
    setCursorInSection(sectionIndex, measure + 1, 0);
  } else if (sectionIndex + 1 < ChartState.sections.length) {
    setCursorInSection(sectionIndex + 1, 0, 0);
  }
  // else: at the very end, don't advance
}

function duplicateChord() {
  if (!ChartState.lastPlacedChord) return false;
  const success = placeChord(ChartState.lastPlacedChord.name);
  if (success) {
    advanceCursor();
    saveChart();
  }
  return success;
}

// ======== PERSISTENCE (localStorage) ========

function saveChart() {
  try {
    const data = {
      version: 2,
      title: ChartState.title,
      tempo: ChartState.tempo,
      sections: ChartState.sections,
      form: ChartState.form,
      key: ChartState.key,
      scaleType: ChartState.scaleType,
      use7th: ChartState.use7th,
    };
    localStorage.setItem('rhythm-chart', JSON.stringify(data));
  } catch (_) {}
}

function loadChart() {
  try {
    const raw = localStorage.getItem('rhythm-chart');
    if (!raw) return false;
    const data = JSON.parse(raw);

    if (data.title !== undefined) ChartState.title = data.title;
    if (data.tempo) ChartState.tempo = data.tempo;
    if (data.key !== undefined) ChartState.key = data.key;
    if (data.scaleType) ChartState.scaleType = data.scaleType;
    if (data.use7th !== undefined) ChartState.use7th = data.use7th;

    if (data.version >= 2 && Array.isArray(data.sections)) {
      // v2: section-based structure
      ChartState.sections = data.sections;
      ChartState.form = data.form || ['A'];
    } else if (Array.isArray(data.measures)) {
      // v1 → v2 migration: flat array → single section
      const bpm = data.beatsPerMeasure || 4;
      ChartState.sections = [{
        id: 'A',
        label: 'A',
        timeSignature: { beats: bpm, noteValue: 4 },
        measures: data.measures,
      }];
      ChartState.form = ['A'];
      const total = data.totalMeasures || 16;
      while (ChartState.sections[0].measures.length < total) {
        ChartState.sections[0].measures.push({ chords: [] });
      }
    }

    ChartState.cursor = { sectionIndex: 0, measure: 0, beat: 0 };
    return true;
  } catch (_) {
    return false;
  }
}
