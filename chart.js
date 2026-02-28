// ========================================
// CHART — Grid State, Rendering, Cursor, Playback
// ========================================

const ChartState = {
  title: '',
  tempo: 120,
  beatsPerMeasure: 4,
  measuresPerLine: 4,
  totalMeasures: 16,
  measures: [],
  cursor: { measure: 0, beat: 0 },
  playing: false,
  playTimer: null,
  playMeasure: 0,
  playBeat: 0,
  lastPlayedChord: null, // Track current sounding chord
};

function initChart() {
  ChartState.measures = [];
  for (let i = 0; i < ChartState.totalMeasures; i++) {
    ChartState.measures.push({ chords: [] });
  }
  renderChart();
}

// ======== RENDERING ========

function renderChart() {
  const grid = document.getElementById('chart-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const { measuresPerLine, totalMeasures, beatsPerMeasure, cursor } = ChartState;
  const lines = Math.ceil(totalMeasures / measuresPerLine);

  for (let line = 0; line < lines; line++) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'chart-line';

    // Line number
    const lineNum = document.createElement('div');
    lineNum.className = 'line-number';
    lineNum.textContent = (line * measuresPerLine + 1);
    lineDiv.appendChild(lineNum);

    for (let col = 0; col < measuresPerLine; col++) {
      const mIdx = line * measuresPerLine + col;
      if (mIdx >= totalMeasures) break;

      const measure = ChartState.measures[mIdx];
      const mDiv = document.createElement('div');
      mDiv.className = 'measure';
      mDiv.dataset.measure = mIdx;

      for (let b = 0; b < beatsPerMeasure; b++) {
        const beatDiv = document.createElement('div');
        beatDiv.className = 'beat';
        beatDiv.dataset.measure = mIdx;
        beatDiv.dataset.beat = b;

        // Find chord at this beat
        const chord = measure.chords.find(c => c.beat === b);
        if (chord) {
          beatDiv.textContent = chord.name;
          beatDiv.classList.add('has-chord');
          beatDiv.draggable = true; // D&D ready (Phase 2)
        }

        // Cursor
        if (!ChartState.playing && mIdx === cursor.measure && b === cursor.beat) {
          beatDiv.classList.add('cursor');
        }

        // Playback position
        if (ChartState.playing && mIdx === ChartState.playMeasure && b === ChartState.playBeat) {
          beatDiv.classList.add('playing');
        }

        // Click to move cursor
        beatDiv.addEventListener('click', () => {
          if (ChartState.playing) return;
          ChartState.cursor.measure = mIdx;
          ChartState.cursor.beat = b;
          renderChart();
          document.getElementById('chord-input')?.focus();
        });

        mDiv.appendChild(beatDiv);
      }

      lineDiv.appendChild(mDiv);
    }

    grid.appendChild(lineDiv);
  }

  updatePlayButton();
}

// ======== CURSOR ========

function setCursor(measure, beat) {
  const { totalMeasures, beatsPerMeasure } = ChartState;
  ChartState.cursor.measure = Math.max(0, Math.min(measure, totalMeasures - 1));
  ChartState.cursor.beat = Math.max(0, Math.min(beat, beatsPerMeasure - 1));
  renderChart();
}

// ======== CHORD PLACEMENT ========

function placeChord(name) {
  const parsed = parseChordName(name);
  if (!parsed) return false;

  const { measure, beat } = ChartState.cursor;
  const m = ChartState.measures[measure];

  // Remove existing chord at this beat
  m.chords = m.chords.filter(c => c.beat !== beat);

  // Calculate MIDI notes
  const midiNotes = chordToMidi(parsed);

  // Place chord
  m.chords.push({
    beat,
    name: parsed.displayName,
    midiNotes,
  });
  m.chords.sort((a, b) => a.beat - b.beat);

  renderChart();

  // Audio feedback (don't interrupt playback)
  if (!ChartState.playing) {
    playChordStab(midiNotes, 800);
  }

  return true;
}

function removeChord() {
  const { measure, beat } = ChartState.cursor;
  const m = ChartState.measures[measure];
  const had = m.chords.length;
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
  ChartState.playMeasure = ChartState.cursor.measure;
  ChartState.playBeat = 0;
  ChartState.lastPlayedChord = null;
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

  const { playMeasure, playBeat, beatsPerMeasure, totalMeasures } = ChartState;
  const measure = ChartState.measures[playMeasure];

  // Find chord at current beat
  const chord = measure.chords.find(c => c.beat === playBeat);
  if (chord && chord !== ChartState.lastPlayedChord) {
    playChordAudio(chord.midiNotes);
    ChartState.lastPlayedChord = chord;
  }

  renderChart();

  // Beat duration in ms
  const beatMs = 60000 / ChartState.tempo;

  // Advance to next beat
  let nextBeat = playBeat + 1;
  let nextMeasure = playMeasure;
  if (nextBeat >= beatsPerMeasure) {
    nextBeat = 0;
    nextMeasure++;
  }

  if (nextMeasure >= totalMeasures) {
    // Reached end — stop after last beat plays
    ChartState.playTimer = setTimeout(() => {
      stopPlayback();
    }, beatMs);
    return;
  }

  ChartState.playBeat = nextBeat;
  ChartState.playMeasure = nextMeasure;
  ChartState.playTimer = setTimeout(playStep, beatMs);
}

function updatePlayButton() {
  const btn = document.getElementById('btn-play');
  if (btn) {
    btn.textContent = ChartState.playing ? '\u25A0 Stop' : '\u25B6 Play';
    btn.classList.toggle('playing', ChartState.playing);
  }
}

// ======== PERSISTENCE (localStorage) ========

function saveChart() {
  try {
    const data = {
      title: ChartState.title,
      tempo: ChartState.tempo,
      totalMeasures: ChartState.totalMeasures,
      measures: ChartState.measures,
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
    if (data.totalMeasures) ChartState.totalMeasures = data.totalMeasures;
    if (Array.isArray(data.measures)) {
      ChartState.measures = data.measures;
      // Ensure totalMeasures matches
      while (ChartState.measures.length < ChartState.totalMeasures) {
        ChartState.measures.push({ chords: [] });
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}
