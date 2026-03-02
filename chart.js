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
  clipboard: null,              // [{chords: [...]}] — copied measures

  // Click pattern: 'off', 'all', '24' (backbeat)
  clickPattern: 'all',

  // Playback pass: 1 = first time (play ending 1), 2 = repeat (play ending 2)
  playPass: 1,

  // Hidden sections (indices): sections whose grid rows are collapsed
  hiddenSections: new Set(),

  // Navigation (D.S. jump tracking)
  playDSActive: false,
  playRepeatsUsed: new Set(),
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
  return ending === occurrence;
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

function sectionHasEndings(section) {
  return section.measures.some(m => m.ending != null && m.ending > 0);
}

function getMaxEnding(section) {
  let max = 0;
  for (const m of section.measures) {
    if (m.ending != null && m.ending > max) max = m.ending;
  }
  return max;
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

    // Skip rendering if section is hidden
    if (ChartState.hiddenSections.has(secIdx)) return;

    const bpm = section.timeSignature.beats;
    const sectionLen = section.measures.length;
    const endingGroups = getEndingGroups(section.measures);
    const lines = Math.ceil(sectionLen / measuresPerLine);

    for (let line = 0; line < lines; line++) {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'chart-line';

      // Line number (section-relative) — also drag selection start point
      const lineNum = document.createElement('div');
      lineNum.className = 'line-number';
      lineNum.textContent = (line * measuresPerLine + 1);
      const lineFirstMeasure = line * measuresPerLine;
      lineNum.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0 || ChartState.playing) return;
        ev.preventDefault();
        _dragStartX = ev.clientX;
        _dragStartY = ev.clientY;
        startDragSelect(sectionToFlat(secIdx, lineFirstMeasure));
      });
      lineDiv.appendChild(lineNum);

      for (let col = 0; col < measuresPerLine; col++) {
        const mIdx = line * measuresPerLine + col;
        if (mIdx >= sectionLen) break;

        const measure = section.measures[mIdx];
        const mDiv = document.createElement('div');
        mDiv.className = 'measure';
        mDiv.dataset.flat = String(sectionToFlat(secIdx, mIdx));
        mDiv.style.gridTemplateColumns = `repeat(${bpm}, 1fr)`;

        // Repeat barline markers
        if (measure.repeatStart) mDiv.classList.add('repeat-start-mark');
        if (measure.repeatEnd) mDiv.classList.add('repeat-end-mark');

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

        // Navigation mark label
        if (measure.nav) {
          const navLabel = document.createElement('span');
          navLabel.className = 'nav-label nav-' + measure.nav;
          const symbols = { segno: '\uD834\uDD0B', coda: '\uD834\uDD0C', ds: 'D.S.', toCoda: 'to\uD834\uDD0C', dc: 'D.C.', fine: 'Fine' };
          navLabel.textContent = symbols[measure.nav];
          mDiv.appendChild(navLabel);
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

          // Mouse range selection
          beatDiv.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0 || ChartState.playing || ev.shiftKey) return;
            _dragStartX = ev.clientX;
            _dragStartY = ev.clientY;
            const flatIdx = sectionToFlat(si, mi);

            if (!chord) {
              // Empty beat: immediate range selection
              ev.preventDefault();
              startDragSelect(flatIdx);
            } else {
              // Chord beat: long press → range selection
              clearTimeout(_longPressTimer);
              _longPressActive = false;
              _longPressTimer = setTimeout(() => {
                _longPressActive = true;
                document.body.style.cursor = 'crosshair';
                startDragSelect(flatIdx);
              }, LONG_PRESS_MS);
            }
          });

          beatDiv.addEventListener('mouseup', () => {
            clearTimeout(_longPressTimer);
            if (!_dragSelecting) _longPressActive = false;
          });

          beatDiv.addEventListener('click', (ev) => {
            if (ChartState.playing) return;
            if (_longPressActive || _dragSelectMoved) {
              _dragSelectMoved = false;
              return; // suppress click after drag/long-press selection
            }
            if (ev.shiftKey) {
              // Shift+click on chord = delete it
              const shiftChord = ChartState.sections[si].measures[mi].chords.find(c => c.beat === bt);
              if (shiftChord) {
                pushUndo();
                ChartState.sections[si].measures[mi].chords =
                  ChartState.sections[si].measures[mi].chords.filter(c => c.beat !== bt);
                setCursorInSection(si, mi, bt);
                renderChart();
                saveChart();
                return;
              }
              // Shift+click on empty beat = repeat range
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

          // D&D: dragstart (drag = move, Option+drag = copy)
          beatDiv.addEventListener('dragstart', (ev) => {
            if (!chord) { ev.preventDefault(); return; }
            // Long press active → cancel D&D, use range selection instead
            if (_longPressActive) { ev.preventDefault(); return; }
            // Quick drag → D&D, cancel long press timer
            clearTimeout(_longPressTimer);
            const mode = ev.altKey ? 'copy' : 'move';
            ev.dataTransfer.setData('text/plain', chord.name);
            ev.dataTransfer.setData('application/x-grid-source', JSON.stringify({ si, mi, bt, mode }));
            ev.dataTransfer.effectAllowed = mode;
          });

          // D&D drop target (memory → grid, grid internal move)
          beatDiv.addEventListener('dragover', (ev) => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = ev.altKey ? 'copy' : 'move';
            beatDiv.classList.add('drag-over');
          });
          beatDiv.addEventListener('dragleave', () => {
            beatDiv.classList.remove('drag-over');
          });
          beatDiv.addEventListener('drop', (ev) => {
            ev.preventDefault();
            beatDiv.classList.remove('drag-over');
            const chordName = ev.dataTransfer.getData('text/plain');
            if (!chordName) return;

            const srcData = ev.dataTransfer.getData('application/x-grid-source');
            if (srcData) {
              // Grid-internal drag (move or copy)
              const src = JSON.parse(srcData);
              const srcMeasure = ChartState.sections[src.si].measures[src.mi];
              const dstMeasure = ChartState.sections[si].measures[mi];
              const srcChord = srcMeasure.chords.find(c => c.beat === src.bt);
              if (!srcChord) return;

              pushUndo();

              if (src.mode === 'copy') {
                dstMeasure.chords = dstMeasure.chords.filter(c => c.beat !== bt);
                dstMeasure.chords.push({ name: srcChord.name, beat: bt, beats: srcChord.beats, voicing: srcChord.voicing || null });
                dstMeasure.chords.sort((a, b) => a.beat - b.beat);
              } else {
                const dstChord = dstMeasure.chords.find(c => c.beat === bt);
                srcMeasure.chords = srcMeasure.chords.filter(c => c.beat !== src.bt);
                if (dstChord) {
                  dstMeasure.chords = dstMeasure.chords.filter(c => c.beat !== bt);
                  dstChord.beat = src.bt;
                  srcMeasure.chords.push(dstChord);
                  srcMeasure.chords.sort((a, b) => a.beat - b.beat);
                }
                srcChord.beat = bt;
                dstMeasure.chords.push(srcChord);
                dstMeasure.chords.sort((a, b) => a.beat - b.beat);
              }

              setCursorInSection(si, mi, bt);
              renderChart();
              saveChart();
            } else {
              // External drop (memory → grid)
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

      // Click on line background (gap between measures) → start range selection
      lineDiv.addEventListener('mousedown', (ev) => {
        // Only if clicking directly on the lineDiv (not on child elements)
        if (ev.target !== lineDiv || ev.button !== 0 || ChartState.playing) return;
        ev.preventDefault();
        _dragStartX = ev.clientX;
        _dragStartY = ev.clientY;
        // Find nearest measure by mouse X position
        const measures = lineDiv.querySelectorAll('.measure[data-flat]');
        let nearestFlat = sectionToFlat(secIdx, line * measuresPerLine);
        let nearestDist = Infinity;
        measures.forEach(mEl => {
          const box = mEl.getBoundingClientRect();
          const centerX = box.x + box.width / 2;
          const dist = Math.abs(ev.clientX - centerX);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestFlat = parseInt(mEl.dataset.flat);
          }
        });
        startDragSelect(nearestFlat);
      });

      grid.appendChild(lineDiv);
    }
  });

  updatePlayButton();
  updateBarsInput();
  renderSectionBar();
  updateEndingButtons();
  updateNavButtons();
  updateRepeatButtons();
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

    // Click on label → stop propagation (prevent tab click from re-rendering)
    label.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Double-click on label → inline rename
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(label, section.label, (newLabel) => {
        if (newLabel && newLabel.trim()) updateSectionLabel(idx, newLabel.trim());
      });
    });

    // Click on tab → jump to section / Shift+click → delete
    tab.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.stopPropagation();
        if (ChartState.sections.length > 1) {
          removeSection(idx);
        }
        return;
      }
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

    // Context menu → delete
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (ChartState.sections.length > 1 && confirm('Delete section [' + section.label + ']?')) {
        removeSection(idx);
      }
    });

    // Eye toggle (show/hide section in grid)
    const eyeBtn = document.createElement('span');
    eyeBtn.className = 'section-tab-eye';
    const isHidden = ChartState.hiddenSections.has(idx);
    eyeBtn.textContent = isHidden ? '\u25B7' : '\u25BC';
    eyeBtn.title = isHidden ? 'Show section' : 'Hide section';
    if (isHidden) tab.classList.add('section-hidden');
    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ChartState.hiddenSections.has(idx)) {
        ChartState.hiddenSections.delete(idx);
      } else {
        ChartState.hiddenSections.add(idx);
      }
      renderChart();
    });

    // Delete button (×)
    const delBtn = document.createElement('span');
    delBtn.className = 'section-tab-del';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Delete section';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ChartState.sections.length > 1) {
        removeSection(idx);
      }
    });

    tab.appendChild(label);
    tab.appendChild(info);
    tab.appendChild(ts);
    tab.appendChild(eyeBtn);
    tab.appendChild(delBtn);
    bar.appendChild(tab);
  });

  // Add section button
  const addBtn = document.createElement('button');
  addBtn.className = 'section-add-btn';
  addBtn.textContent = '+';
  addBtn.title = 'Add section';
  addBtn.addEventListener('click', () => addSection());
  bar.appendChild(addBtn);

  // Form chips (D&D reorderable)
  renderFormChips();
}

function updateEndingButtons() {
  const section = getCurrentSection();
  const measure = section ? section.measures[ChartState.cursor.measure] : null;
  const ending = measure ? measure.ending : null;
  for (let n = 1; n <= 3; n++) {
    const btn = document.getElementById('btn-ending-' + n);
    if (btn) btn.classList.toggle('active', ending === n);
  }
}

function updateNavButtons() {
  const section = getCurrentSection();
  const measure = section ? section.measures[ChartState.cursor.measure] : null;
  const nav = measure ? measure.nav || null : null;
  ['segno', 'coda', 'ds', 'tocoda', 'dc', 'fine'].forEach(type => {
    const btn = document.getElementById('btn-nav-' + type);
    if (btn) btn.classList.toggle('active', nav === (type === 'tocoda' ? 'toCoda' : type));
  });
}

function setMeasureRepeat(flatIdx, type) {
  pushUndo();
  const measure = getMeasureAt(flatIdx);
  if (!measure) return;
  if (type === 'start') {
    measure.repeatStart = !measure.repeatStart;
  } else if (type === 'end') {
    measure.repeatEnd = !measure.repeatEnd;
  }
  renderChart();
  saveChart();
}

function updateRepeatButtons() {
  const section = getCurrentSection();
  const measure = section ? section.measures[ChartState.cursor.measure] : null;
  const btnStart = document.getElementById('btn-repeat-start');
  const btnEnd = document.getElementById('btn-repeat-end');
  if (btnStart) btnStart.classList.toggle('active', !!(measure && measure.repeatStart));
  if (btnEnd) btnEnd.classList.toggle('active', !!(measure && measure.repeatEnd));
}

function setMeasureNav(flatIdx, navType) {
  pushUndo();
  const measure = getMeasureAt(flatIdx);
  if (!measure) return;
  measure.nav = (measure.nav === navType) ? null : navType;
  renderChart();
  saveChart();
}

function findNavPosition(navType) {
  for (let fi = 0; fi < ChartState.form.length; fi++) {
    const secId = ChartState.form[fi];
    const secIdx = ChartState.sections.findIndex(s => s.id === secId);
    if (secIdx < 0) continue;
    const section = ChartState.sections[secIdx];
    for (let mi = 0; mi < section.measures.length; mi++) {
      if (section.measures[mi].nav === navType) {
        return { formIndex: fi, sectionIndex: secIdx, measure: mi };
      }
    }
  }
  return null;
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

function placeChord(name, voicing = null) {
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

  // Place chord (voicing stored for future Pad panel use)
  const chordObj = { beat, name: parsed.displayName, midiNotes, voicing: voicing || null };
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
  ChartState.playPass = 1;
  ChartState.playDSActive = false;
  ChartState.playRepeatsUsed = new Set();
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
    // After D.S./D.C., repeat signs are ignored: play as 2nd pass (skip ending 1, play ending 2)
    const hasEndings = sectionHasEndings(section);
    const occurrence = ChartState.playDSActive ? 2
      : (hasEndings ? ChartState.playPass : getFormOccurrence(ChartState.playFormIndex));
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

    // Navigation symbol checks (after finishing a measure)
    const justPlayed = section.measures[ChartState.playMeasure];

    // D.S.: jump to segno (first time only)
    if (justPlayed && justPlayed.nav === 'ds' && !ChartState.playDSActive) {
      const segnoPos = findNavPosition('segno');
      if (segnoPos) {
        ChartState.playDSActive = true;
        ChartState.playFormIndex = segnoPos.formIndex;
        ChartState.playSectionIndex = segnoPos.sectionIndex;
        ChartState.playMeasure = segnoPos.measure;
        ChartState.playBeat = 0;
        ChartState.playPass = 1;
        ChartState.lastPlayedChord = null;
        ChartState.playTimer = setTimeout(playStep, beatMs);
        return;
      }
    }

    // D.C.: jump to beginning (first time only, reuses playDSActive flag)
    if (justPlayed && justPlayed.nav === 'dc' && !ChartState.playDSActive) {
      ChartState.playDSActive = true;
      ChartState.playFormIndex = 0;
      ChartState.playSectionIndex = getFormSectionIndex(0);
      ChartState.playMeasure = 0;
      ChartState.playBeat = 0;
      ChartState.playPass = 1;
      ChartState.lastPlayedChord = null;
      ChartState.playTimer = setTimeout(playStep, beatMs);
      return;
    }

    // To Coda: jump to coda (only during D.S./D.C. pass)
    if (justPlayed && justPlayed.nav === 'toCoda' && ChartState.playDSActive) {
      const codaPos = findNavPosition('coda');
      if (codaPos) {
        ChartState.playFormIndex = codaPos.formIndex;
        ChartState.playSectionIndex = codaPos.sectionIndex;
        ChartState.playMeasure = codaPos.measure;
        ChartState.playBeat = 0;
        ChartState.playPass = 1;
        ChartState.lastPlayedChord = null;
        ChartState.playTimer = setTimeout(playStep, beatMs);
        return;
      }
    }

    // Fine: stop playback (only active after D.S./D.C.)
    if (justPlayed && justPlayed.nav === 'fine' && ChartState.playDSActive) {
      ChartState.playTimer = setTimeout(() => stopPlayback(), beatMs);
      return;
    }

    // Repeat barline check (ignored after D.S./D.C.)
    if (justPlayed && justPlayed.repeatEnd && !ChartState.playDSActive) {
      const flatIdx = sectionToFlat(secIdx, ChartState.playMeasure);
      if (!ChartState.playRepeatsUsed.has(flatIdx)) {
        ChartState.playRepeatsUsed.add(flatIdx);
        // Find corresponding repeat start in same section
        let repeatStartMeasure = 0; // default: section start
        for (let mi = ChartState.playMeasure - 1; mi >= 0; mi--) {
          if (section.measures[mi].repeatStart) {
            repeatStartMeasure = mi;
            break;
          }
        }
        ChartState.playMeasure = repeatStartMeasure;
        ChartState.playBeat = 0;
        ChartState.playPass++;
        ChartState.lastPlayedChord = null;
        ChartState.playTimer = setTimeout(playStep, beatMs);
        return;
      }
    }
  }

  if (ChartState.useFormPlayback) {
    let nextFormIdx = ChartState.playFormIndex;
    const hasEnd = sectionHasEndings(section);
    const occ = ChartState.playDSActive ? 2
      : (hasEnd ? ChartState.playPass : getFormOccurrence(nextFormIdx));

    // Skip non-playable measures
    while (nextMeasure < section.measures.length &&
           !shouldPlayMeasure(section.measures[nextMeasure], occ)) {
      nextMeasure++;
    }

    if (nextMeasure >= section.measures.length) {
      const maxEnd = getMaxEnding(section);
      if (hasEnd && ChartState.playPass < maxEnd && !ChartState.playDSActive) {
        // Implicit repeat: return to section start for next ending (disabled after D.S./D.C.)
        ChartState.playPass++;
        nextMeasure = 0;
        while (nextMeasure < section.measures.length &&
               !shouldPlayMeasure(section.measures[nextMeasure], ChartState.playPass)) {
          nextMeasure++;
        }
      } else {
        // Advance to next form entry
        nextFormIdx++;
        nextMeasure = 0;
        ChartState.playPass = 1;
        if (nextFormIdx < ChartState.form.length) {
          const nextSection = getFormSection(nextFormIdx);
          const nextHasEnd = nextSection ? sectionHasEndings(nextSection) : false;
          const nextOcc = ChartState.playDSActive ? 2
            : (nextHasEnd ? 1 : getFormOccurrence(nextFormIdx));
          if (nextSection) {
            while (nextMeasure < nextSection.measures.length &&
                   !shouldPlayMeasure(nextSection.measures[nextMeasure], nextOcc)) {
              nextMeasure++;
            }
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

function copyRange() {
  if (!ChartState.repeatRange) return false;
  const { start, end } = ChartState.repeatRange;
  const clipboard = [];
  for (let i = start; i <= end; i++) {
    const m = getMeasureAt(i);
    if (!m) { clipboard.push({ chords: [] }); continue; }
    clipboard.push({
      chords: m.chords.map(c => ({
        beat: c.beat,
        name: c.name,
        beats: c.beats || 1,
        midiNotes: c.midiNotes ? [...c.midiNotes] : [],
        voicing: c.voicing || null,
      })),
    });
  }
  ChartState.clipboard = clipboard;
  return true;
}

function pasteRange() {
  if (!ChartState.clipboard || ChartState.clipboard.length === 0) return false;
  pushUndo();
  const cursorFlat = getCursorFlat();
  const total = getTotalMeasures();
  for (let i = 0; i < ChartState.clipboard.length; i++) {
    const dstFlat = cursorFlat + i;
    if (dstFlat >= total) break;
    const dst = getMeasureAt(dstFlat);
    if (!dst) continue;
    const src = ChartState.clipboard[i];
    dst.chords = src.chords.map(c => ({
      beat: c.beat,
      name: c.name,
      beats: c.beats || 1,
      midiNotes: c.midiNotes ? [...c.midiNotes] : [],
      voicing: c.voicing || null,
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

// ======== MOUSE DRAG RANGE SELECTION ========

let _dragSelecting = false;
let _dragSelectStartFlat = -1;
let _dragSelectMoved = false;
let _dragStartX = 0;
let _dragStartY = 0;
let _longPressTimer = null;
let _longPressActive = false;
const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 300;

function startDragSelect(flatIdx) {
  _dragSelecting = true;
  _dragSelectStartFlat = flatIdx;
  _dragSelectMoved = false;
  document.addEventListener('mousemove', onDragSelectMove);
  document.addEventListener('mouseup', onDragSelectEnd);
}

function onDragSelectMove(ev) {
  if (!_dragSelecting) return;
  if (!_dragSelectMoved) {
    const dx = ev.clientX - _dragStartX;
    const dy = ev.clientY - _dragStartY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    _dragSelectMoved = true;
  }
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el) return;
  const measureEl = el.closest('.measure[data-flat]');
  if (!measureEl) return;
  const flat = parseInt(measureEl.dataset.flat);
  const start = Math.min(_dragSelectStartFlat, flat);
  const end = Math.max(_dragSelectStartFlat, flat);
  ChartState.repeatRange = { start, end };
  updateRangeHighlight();
}

function onDragSelectEnd() {
  _dragSelecting = false;
  _longPressActive = false;
  clearTimeout(_longPressTimer);
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', onDragSelectMove);
  document.removeEventListener('mouseup', onDragSelectEnd);
  if (!_dragSelectMoved) {
    ChartState.repeatRange = null;
    updateRangeHighlight();
  }
}

function updateRangeHighlight() {
  document.querySelectorAll('.beat').forEach(b => {
    b.classList.remove('in-repeat-range', 'repeat-start', 'repeat-end');
  });
  if (!ChartState.repeatRange) return;
  const { start, end } = ChartState.repeatRange;
  document.querySelectorAll('.measure[data-flat]').forEach(mEl => {
    const flat = parseInt(mEl.dataset.flat);
    if (flat < start || flat > end) return;
    const beats = mEl.querySelectorAll('.beat');
    beats.forEach((beatEl, i) => {
      beatEl.classList.add('in-repeat-range');
      if (flat === start && i === 0) beatEl.classList.add('repeat-start');
      if (flat === end && i === beats.length - 1) beatEl.classList.add('repeat-end');
    });
  });
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
  // First try: chord at current cursor position
  const section = getCurrentSection();
  if (section) {
    const measure = section.measures[ChartState.cursor.measure];
    if (measure) {
      const chord = measure.chords.find(c => c.beat === ChartState.cursor.beat);
      if (chord) {
        advanceCursor();
        const success = placeChord(chord.name);
        if (success) {
          advanceCursor();
          saveChart();
        }
        return success;
      }
    }
  }
  // Fallback: last placed chord
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

// ======== FORM CHIPS (D&D reorderable) ========

function renderFormChips() {
  const container = document.getElementById('form-chips');
  if (!container) return;
  container.innerHTML = '';

  ChartState.form.forEach((sectionId, idx) => {
    const chip = document.createElement('div');
    chip.className = 'form-chip';
    chip.dataset.index = idx;

    const label = document.createElement('span');
    label.className = 'form-chip-label';
    label.textContent = sectionId;
    chip.appendChild(label);

    const removeBtn = document.createElement('span');
    removeBtn.className = 'form-chip-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove from form';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ChartState.form.length <= 1) return;
      ChartState.form.splice(idx, 1);
      saveChart();
      renderFormChips();
    });
    chip.appendChild(removeBtn);

    container.appendChild(chip);
  });

  // Init SortableJS on form chips
  if (typeof Sortable !== 'undefined' && !container._sortable) {
    container._sortable = new Sortable(container, {
      animation: 150,
      ghostClass: 'form-chip-ghost',
      chosenClass: 'form-chip-chosen',
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === newIndex) return;
        const item = ChartState.form.splice(oldIndex, 1)[0];
        ChartState.form.splice(newIndex, 0, item);
        saveChart();
        renderFormChips();
      },
    });
  }

  // Form add button + menu
  const addBtn = document.getElementById('btn-form-add');
  const menu = document.getElementById('form-add-menu');
  if (addBtn && menu) {
    addBtn.onclick = () => {
      menu.innerHTML = '';
      ChartState.sections.forEach((sec) => {
        const item = document.createElement('div');
        item.className = 'form-add-item';
        item.textContent = sec.label;
        item.addEventListener('click', () => {
          ChartState.form.push(sec.id);
          saveChart();
          renderFormChips();
          menu.classList.remove('open');
        });
        menu.appendChild(item);
      });
      menu.classList.toggle('open');
    };
    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!addBtn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('open');
      }
    });
  }
}

// ======== INLINE EDIT ========

function startInlineEdit(element, currentValue, onSave) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = currentValue;
  input.style.width = Math.max(30, element.offsetWidth + 10) + 'px';

  const originalText = element.textContent;
  element.textContent = '';
  element.appendChild(input);
  input.focus();
  input.select();

  const finish = () => {
    const val = input.value.trim();
    element.textContent = val || originalText;
    if (val && val !== currentValue) {
      onSave(val);
    }
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentValue; input.blur(); }
    e.stopPropagation();
  });
}
