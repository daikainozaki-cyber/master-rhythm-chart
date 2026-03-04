// ========================================
// FILE I/O — Save/Load .mrc, MIDI Export/Import, .clvz Import
// ========================================

// ======== SHARED UTILITIES ========

function _triggerFilePicker(accept, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    if (input.files.length > 0) cb(input.files[0]);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

function _readFileAsArrayBuffer(file, cb) {
  const reader = new FileReader();
  reader.onload = () => cb(new Uint8Array(reader.result));
  reader.readAsArrayBuffer(file);
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function _syncUIAfterLoad() {
  const titleInput = document.getElementById('title-input');
  if (titleInput) titleInput.value = ChartState.title;
  const tempoInput = document.getElementById('tempo-input');
  if (tempoInput) tempoInput.value = ChartState.tempo;
  const keySelect = document.getElementById('key-select');
  if (keySelect) keySelect.value = ChartState.key;
  const scaleSelect = document.getElementById('scale-select');
  if (scaleSelect) scaleSelect.value = ChartState.scaleType;
  const barsInput = document.getElementById('bars-input');
  if (barsInput) barsInput.value = getCurrentSection().measures.length;
}

// ======== BROWSER STORAGE (multiple charts in localStorage) ========

const STORAGE_INDEX_KEY = 'rhythm-charts-index';

function _getChartIndex() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_INDEX_KEY)) || [];
  } catch (_) { return []; }
}

function _saveChartIndex(index) {
  localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
}

function _chartDataKey(id) {
  return 'rhythm-chart-' + id;
}

function _currentChartData() {
  return {
    version: 2,
    title: ChartState.title,
    tempo: ChartState.tempo,
    sections: ChartState.sections,
    form: ChartState.form,
    key: ChartState.key,
    scaleType: ChartState.scaleType,
    use7th: ChartState.use7th,
  };
}

// Save current chart to browser storage
function browserSave() {
  const title = ChartState.title || 'Untitled';
  const index = _getChartIndex();

  // Check if a chart with same title exists → offer overwrite
  const existing = index.find(e => e.title === title);
  if (existing) {
    if (!confirm('「' + title + '」を上書きしますか？')) return;
    existing.updated = Date.now();
    localStorage.setItem(_chartDataKey(existing.id), JSON.stringify(_currentChartData()));
    _saveChartIndex(index);
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    index.push({ id, title, updated: Date.now() });
    localStorage.setItem(_chartDataKey(id), JSON.stringify(_currentChartData()));
    _saveChartIndex(index);
  }
  _renderBrowserModal();
}

// Load a chart from browser storage by id
function browserLoad(id) {
  try {
    const raw = localStorage.getItem(_chartDataKey(id));
    if (!raw) { alert('Chart not found.'); return; }
    const data = JSON.parse(raw);
    loadChartFromData(data);
    _syncUIAfterLoad();
    renderChart();
    saveChart(); // sync to default localStorage slot
    _closeBrowserModal();
  } catch (e) {
    alert('Load error: ' + e.message);
  }
}

// Delete a chart from browser storage
function browserDelete(id) {
  const index = _getChartIndex();
  const entry = index.find(e => e.id === id);
  if (!entry) return;
  if (!confirm('「' + entry.title + '」を削除しますか？')) return;
  localStorage.removeItem(_chartDataKey(id));
  const newIndex = index.filter(e => e.id !== id);
  _saveChartIndex(newIndex);
  _renderBrowserModal();
}

// Open browser storage modal
function openBrowserModal() {
  const modal = document.getElementById('browser-storage-overlay');
  if (modal) {
    modal.classList.add('active');
    _renderBrowserModal();
  }
}

function _closeBrowserModal() {
  const modal = document.getElementById('browser-storage-overlay');
  if (modal) modal.classList.remove('active');
}

function _renderBrowserModal() {
  const list = document.getElementById('browser-storage-list');
  if (!list) return;
  const index = _getChartIndex();
  // Sort by updated desc
  index.sort((a, b) => (b.updated || 0) - (a.updated || 0));

  if (index.length === 0) {
    list.innerHTML = '<div class="browser-storage-empty">保存されたチャートはありません</div>';
    return;
  }

  list.innerHTML = index.map(entry => {
    const date = new Date(entry.updated);
    const dateStr = date.toLocaleDateString('ja-JP') + ' ' +
      date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return '<div class="browser-storage-item">' +
      '<div class="browser-storage-item-info" onclick="browserLoad(\'' + entry.id + '\')">' +
        '<span class="browser-storage-item-title">' + _escHtml(entry.title) + '</span>' +
        '<span class="browser-storage-item-date">' + dateStr + '</span>' +
      '</div>' +
      '<button class="browser-storage-item-del" onclick="browserDelete(\'' + entry.id + '\')" title="Delete">&times;</button>' +
    '</div>';
  }).join('');
}

function _escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ======== SAVE .mrc ========

function exportMRC() {
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
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = (ChartState.title || 'untitled') + '.mrc';
  _downloadBlob(blob, filename);
}

// ======== OPEN .mrc ========

function importMRC() {
  _triggerFilePicker('.mrc,.json', (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        loadChartFromData(data);
        _syncUIAfterLoad();
        renderChart();
        saveChart();
      } catch (e) {
        alert('Invalid .mrc file: ' + e.message);
      }
    };
    reader.readAsText(file);
  });
}

// ======== MIDI EXPORT (scratch SMF, Format 0) ========

function exportMidi() {
  const PPQ = 480;
  const tempo = ChartState.tempo || 120;
  const events = [];

  // Tempo meta event: FF 51 03 tttttt (microseconds per quarter)
  const uspq = Math.round(60000000 / tempo);
  events.push({ tick: 0, data: [0xFF, 0x51, 0x03,
    (uspq >> 16) & 0xFF, (uspq >> 8) & 0xFF, uspq & 0xFF] });

  // Collect all chords in form order with absolute tick positions
  let tick = 0;
  for (const sectionId of ChartState.form) {
    const section = ChartState.sections.find(s => s.id === sectionId);
    if (!section) continue;
    const bpm = section.timeSignature ? section.timeSignature.beats : 4;
    for (const measure of section.measures) {
      for (let beat = 0; beat < bpm; beat++) {
        const chord = measure.chords.find(c => c.beat === beat);
        if (chord) {
          const midiNotes = _getChordMidiNotes(chord);
          const duration = PPQ; // 1 beat = 1 quarter note
          for (const note of midiNotes) {
            events.push({ tick, data: [0x90, note, 100] });         // noteOn
            events.push({ tick: tick + duration - 1, data: [0x80, note, 0] }); // noteOff
          }
        }
        tick += PPQ;
      }
    }
  }

  // End of track
  events.push({ tick, data: [0xFF, 0x2F, 0x00] });

  // Sort by tick, then noteOff before noteOn at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return (a.data[0] & 0xF0) - (b.data[0] & 0xF0); // 0x80 before 0x90
  });

  // Build track data with delta times
  const trackBytes = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    _writeVLQ(trackBytes, delta);
    for (const b of ev.data) trackBytes.push(b);
  }

  // Build complete SMF
  const smf = [];
  // MThd
  _writeASCII(smf, 'MThd');
  _write32(smf, 6);        // header length
  _write16(smf, 0);        // format 0
  _write16(smf, 1);        // 1 track
  _write16(smf, PPQ);      // ticks per quarter
  // MTrk
  _writeASCII(smf, 'MTrk');
  _write32(smf, trackBytes.length);
  for (const b of trackBytes) smf.push(b);

  const blob = new Blob([new Uint8Array(smf)], { type: 'audio/midi' });
  const filename = (ChartState.title || 'untitled') + '.mid';
  _downloadBlob(blob, filename);
}

function _getChordMidiNotes(chord) {
  if (chord.midiNotes && chord.midiNotes.length > 0) return chord.midiNotes;
  const parsed = parseChordName(chord.name);
  return chordToMidi(parsed);
}

function _writeVLQ(arr, value) {
  if (value < 0) value = 0;
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  for (let i = bytes.length - 1; i >= 0; i--) arr.push(bytes[i]);
}

function _writeASCII(arr, str) {
  for (let i = 0; i < str.length; i++) arr.push(str.charCodeAt(i));
}

function _write32(arr, val) {
  arr.push((val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF);
}

function _write16(arr, val) {
  arr.push((val >> 8) & 0xFF, val & 0xFF);
}

// ======== MIDI IMPORT (self-contained parser) ========

function importMidi() {
  _triggerFilePicker('.mid,.midi', (file) => {
    _readFileAsArrayBuffer(file, (uint8) => {
      try {
        const parsed = _parseSMF(uint8);
        if (!parsed) { alert('Invalid MIDI file.'); return; }

        const ppq = parsed.ppq;
        let tempo = 120;
        const noteEvents = [];

        for (const track of parsed.tracks) {
          let tick = 0;
          for (const ev of track) {
            tick += ev.delta;
            if (ev.type === 'tempo') {
              tempo = Math.round(60000000 / ev.value);
            }
            if (ev.type === 'noteOn') {
              noteEvents.push({ tick, note: ev.note, type: 'on' });
            }
            if (ev.type === 'noteOff') {
              noteEvents.push({ tick, note: ev.note, type: 'off' });
            }
          }
        }

        // Group noteOn events by quantized beat position
        const ticksPerBeat = ppq;
        const chordGroups = new Map();
        for (const ev of noteEvents) {
          if (ev.type !== 'on') continue;
          const beatIdx = Math.round(ev.tick / ticksPerBeat);
          if (!chordGroups.has(beatIdx)) chordGroups.set(beatIdx, new Set());
          chordGroups.get(beatIdx).add(ev.note);
        }

        const sortedBeats = [...chordGroups.keys()].sort((a, b) => a - b);
        if (sortedBeats.length === 0) {
          alert('No notes found in MIDI file.');
          return;
        }
        const maxBeat = sortedBeats[sortedBeats.length - 1];
        const beatsPerMeasure = 4;
        const totalMeasures = Math.max(Math.ceil((maxBeat + 1) / beatsPerMeasure), 1);

        const measures = [];
        for (let m = 0; m < totalMeasures; m++) {
          const chords = [];
          for (let b = 0; b < beatsPerMeasure; b++) {
            const beatIdx = m * beatsPerMeasure + b;
            if (chordGroups.has(beatIdx)) {
              const notes = [...chordGroups.get(beatIdx)].sort((a, b) => a - b);
              const name = _midiNotesToChordName(notes);
              if (name) {
                chords.push({ beat: b, name, midiNotes: notes });
              }
            }
          }
          measures.push({ chords });
        }

        const data = {
          version: 2,
          title: file.name.replace(/\.(mid|midi)$/i, ''),
          tempo,
          key: 0,
          scaleType: 'major',
          use7th: false,
          sections: [{
            id: 'A',
            label: 'A',
            timeSignature: { beats: beatsPerMeasure, noteValue: 4 },
            measures,
          }],
          form: ['A'],
        };

        loadChartFromData(data);
        _syncUIAfterLoad();
        renderChart();
        saveChart();
      } catch (e) {
        alert('MIDI import error: ' + e.message);
      }
    });
  });
}

// Minimal SMF parser (Format 0/1, enough for chord import)
function _parseSMF(buf) {
  let pos = 0;
  const r8  = () => buf[pos++];
  const r16 = () => (r8() << 8) | r8();
  const r32 = () => (r8() << 24 | r8() << 16 | r8() << 8 | r8()) >>> 0;
  const rVLQ = () => {
    let val = 0;
    for (let i = 0; i < 4; i++) {
      const b = r8();
      val = (val << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return val;
  };
  const ascii = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(r8()); return s; };

  // MThd
  if (ascii(4) !== 'MThd') return null;
  const hdrLen = r32();
  const format = r16();
  const nTracks = r16();
  const ppq = r16();
  if (hdrLen > 6) pos += hdrLen - 6; // skip extra

  const tracks = [];
  for (let t = 0; t < nTracks; t++) {
    if (ascii(4) !== 'MTrk') return null;
    const trkLen = r32();
    const trkEnd = pos + trkLen;
    const events = [];
    let runStatus = 0;

    while (pos < trkEnd) {
      const delta = rVLQ();
      let status = buf[pos];

      if (status === 0xFF) {
        // Meta event
        pos++; // skip 0xFF
        const metaType = r8();
        const len = rVLQ();
        if (metaType === 0x51 && len === 3) {
          // Tempo
          const uspq = (r8() << 16) | (r8() << 8) | r8();
          events.push({ delta, type: 'tempo', value: uspq });
        } else if (metaType === 0x2F) {
          pos += len; // End of track
          break;
        } else {
          pos += len; // skip other meta
          events.push({ delta, type: 'meta' });
        }
      } else if (status === 0xF0 || status === 0xF7) {
        // SysEx
        pos++;
        const len = rVLQ();
        pos += len;
        events.push({ delta, type: 'sysex' });
      } else {
        // Channel message
        if (status & 0x80) {
          runStatus = status;
          pos++;
        } else {
          status = runStatus;
        }
        const cmd = status & 0xF0;
        if (cmd === 0x90) {
          const note = r8(), vel = r8();
          if (vel > 0) {
            events.push({ delta, type: 'noteOn', note, vel });
          } else {
            events.push({ delta, type: 'noteOff', note });
          }
        } else if (cmd === 0x80) {
          const note = r8(); r8(); // vel
          events.push({ delta, type: 'noteOff', note });
        } else if (cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) {
          r8(); r8(); // 2-byte params
          events.push({ delta, type: 'other' });
        } else if (cmd === 0xC0 || cmd === 0xD0) {
          r8(); // 1-byte param
          events.push({ delta, type: 'other' });
        } else {
          // Unknown, skip
          events.push({ delta, type: 'other' });
        }
      }
    }
    pos = trkEnd; // ensure aligned
    tracks.push(events);
  }
  return { format, ppq, tracks };
}

// Reverse-lookup: MIDI notes → chord name
function _midiNotesToChordName(notes) {
  if (!notes || notes.length === 0) return null;

  // Extract pitch class set (relative to lowest note as root candidate)
  const pcs = [...new Set(notes.map(n => n % 12))].sort((a, b) => a - b);
  const root = pcs[0];
  const intervals = pcs.map(pc => (pc - root + 12) % 12).sort((a, b) => a - b);

  // Try each quality in QUALITY_INTERVALS
  let bestMatch = null;
  let bestLen = -1;
  for (const [quality, qIntervals] of Object.entries(QUALITY_INTERVALS)) {
    // Compare pitch class sets (mod 12)
    const qPcs = qIntervals.map(iv => iv % 12).sort((a, b) => a - b);
    const qUnique = [...new Set(qPcs)].sort((a, b) => a - b);
    const iUnique = [...new Set(intervals)].sort((a, b) => a - b);
    if (qUnique.length === iUnique.length && qUnique.every((v, i) => v === iUnique[i])) {
      // Prefer shorter quality names (more canonical)
      if (bestMatch === null || quality.length < bestLen) {
        bestMatch = quality;
        bestLen = quality.length;
      }
    }
  }

  if (bestMatch !== null) {
    const rootName = NOTE_NAMES_SHARP[root];
    const display = (typeof QUALITY_DISPLAY !== 'undefined' && QUALITY_DISPLAY[bestMatch])
      ? QUALITY_DISPLAY[bestMatch] : bestMatch;
    return rootName + display;
  }

  // Fallback: just use root note
  return NOTE_NAMES_SHARP[root];
}

// ======== .clvz IMPORT (pako CDN) ========

function importClvz() {
  if (typeof pako === 'undefined') {
    alert('Pako (gzip) library not loaded. Please refresh the page.');
    return;
  }
  _triggerFilePicker('.clvz', (file) => {
    _readFileAsArrayBuffer(file, (uint8) => {
      try {
        // Decompress gzip
        const xmlBytes = pako.inflate(uint8);
        const xmlStr = new TextDecoder('utf-8').decode(xmlBytes);
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, 'text/xml');

        // Parse Clover Studio XML
        const measureSets = doc.querySelectorAll('measure-set');
        if (measureSets.length === 0) {
          alert('No measures found in .clvz file.');
          return;
        }

        // Extract tempo
        let tempo = 120;
        const tempoEl = doc.querySelector('tempo');
        if (tempoEl) {
          const t = parseFloat(tempoEl.textContent || tempoEl.getAttribute('value'));
          if (t > 0) tempo = Math.round(t);
        }

        // Extract time signature
        let beatsPerMeasure = 4;
        const tsEl = doc.querySelector('time-signature');
        if (tsEl) {
          const beats = parseInt(tsEl.getAttribute('beats') || tsEl.querySelector('beats')?.textContent);
          if (beats > 0) beatsPerMeasure = beats;
        }

        const CLOVER_TPB = 240; // Clover ticks per beat
        const measures = [];

        for (const ms of measureSets) {
          const chordValues = ms.querySelectorAll('chord-value');
          const chords = [];

          for (const cv of chordValues) {
            // Parse timing
            const position = parseInt(cv.getAttribute('position') || '0');
            const beat = Math.floor(position / CLOVER_TPB);
            if (beat >= beatsPerMeasure) continue;

            // Parse chord components
            const step1 = cv.querySelector('step1'); // root note
            const step2 = cv.querySelector('step2'); // quality
            const step3 = cv.querySelector('step3'); // tension
            const baseEl = cv.querySelector('base'); // on-chord (bass)

            if (!step1) continue;
            const rootStr = _cloverStepToNote(step1.textContent || step1.getAttribute('value') || '');
            if (!rootStr) continue;

            let name = rootStr;
            const quality = _cloverQualityToMRC(step2 ? (step2.textContent || step2.getAttribute('value') || '') : '');
            name += quality;

            const tension = step3 ? (step3.textContent || step3.getAttribute('value') || '') : '';
            if (tension) {
              const mappedTension = _cloverTensionToMRC(tension);
              if (mappedTension) name += mappedTension;
            }

            if (baseEl) {
              const bassNote = _cloverStepToNote(baseEl.textContent || baseEl.getAttribute('value') || '');
              if (bassNote) name += '/' + bassNote;
            }

            // Verify chord parses
            if (parseChordName(name)) {
              chords.push({ beat, name });
            }
          }

          measures.push({ chords });
        }

        // Pad to at least the number of measures found
        while (measures.length < 1) measures.push({ chords: [] });

        const data = {
          version: 2,
          title: file.name.replace(/\.clvz$/i, ''),
          tempo,
          key: 0,
          scaleType: 'major',
          use7th: false,
          sections: [{
            id: 'A',
            label: 'A',
            timeSignature: { beats: beatsPerMeasure, noteValue: 4 },
            measures,
          }],
          form: ['A'],
        };

        loadChartFromData(data);
        _syncUIAfterLoad();
        renderChart();
        saveChart();
      } catch (e) {
        alert('.clvz import error: ' + e.message);
      }
    });
  });
}

// Clover step value → note name (C, C#, Db, etc.)
function _cloverStepToNote(step) {
  if (!step) return null;
  step = step.trim();
  // Clover uses integer values 0-11 or note names
  const intVal = parseInt(step);
  if (!isNaN(intVal) && intVal >= 0 && intVal <= 11) {
    return NOTE_NAMES_SHARP[intVal];
  }
  // Try as note name
  const mapped = {
    'C': 'C', 'C#': 'C#', 'Db': 'Db', 'D': 'D', 'D#': 'D#', 'Eb': 'Eb',
    'E': 'E', 'F': 'F', 'F#': 'F#', 'Gb': 'Gb', 'G': 'G', 'G#': 'G#',
    'Ab': 'Ab', 'A': 'A', 'A#': 'A#', 'Bb': 'Bb', 'B': 'B',
  };
  return mapped[step] || null;
}

// Clover quality → MRC quality string
function _cloverQualityToMRC(q) {
  if (!q) return '';
  q = q.trim();
  const map = {
    '': '', 'major': '', 'maj': '', 'M': '',
    'minor': 'm', 'min': 'm', 'm': 'm',
    '7': '7', 'dom7': '7', 'dominant7': '7',
    'maj7': 'maj7', 'major7': 'maj7', 'M7': 'maj7',
    'min7': 'm7', 'minor7': 'm7', 'm7': 'm7',
    'dim': 'dim', 'diminished': 'dim',
    'dim7': 'dim7', 'diminished7': 'dim7',
    'aug': 'aug', 'augmented': 'aug',
    'sus4': 'sus4', 'sus2': 'sus2',
    '6': '6', 'm6': 'm6', 'min6': 'm6',
    '9': '9', 'maj9': 'maj9', 'm9': 'm9', 'min9': 'm9',
    '7sus4': '7sus4',
    'm7b5': 'm7b5', 'min7b5': 'm7b5', 'half-dim': 'm7b5', 'hdim7': 'm7b5',
    'mM7': 'mM7', 'minMaj7': 'mM7',
    'add9': 'add9',
    '7#9': '7(#9)', '7b9': '7(b9)', '7#5': '7(#5)', '7b5': '7(b5)',
    'aug7': 'aug7', '13': '13', '11': '11',
  };
  return map[q] !== undefined ? map[q] : q;
}

// Clover tension → MRC tension string
function _cloverTensionToMRC(t) {
  if (!t) return '';
  t = t.trim();
  if (!t) return '';
  // Already formatted like (9), (b9,#11) etc.
  if (t.startsWith('(')) return t;
  // Wrap in parens
  return '(' + t + ')';
}
