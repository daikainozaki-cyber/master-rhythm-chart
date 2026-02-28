// ========================================
// APP — Initialization & Keyboard Handler
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // Load saved chart or init empty
  if (!loadChart()) {
    initChart();
  } else {
    renderChart();
  }

  // Title input
  const titleInput = document.getElementById('title-input');
  if (titleInput) {
    titleInput.value = ChartState.title;
    titleInput.addEventListener('input', () => {
      ChartState.title = titleInput.value;
      saveChart();
    });
  }

  // Tempo input
  const tempoInput = document.getElementById('tempo-input');
  if (tempoInput) {
    tempoInput.value = ChartState.tempo;
    tempoInput.addEventListener('change', () => {
      const val = parseInt(tempoInput.value);
      if (val >= 40 && val <= 300) ChartState.tempo = val;
      tempoInput.value = ChartState.tempo;
      saveChart();
    });
  }

  // Play button
  document.getElementById('btn-play')?.addEventListener('click', togglePlay);

  // Clear button
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (!confirm('Clear all chords?')) return;
    initChart();
    saveChart();
  });

  // Chord input field
  const chordInput = document.getElementById('chord-input');
  if (chordInput) {
    chordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitChord();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        chordInput.blur();
      }
    });
  }

  // Submit button
  document.getElementById('chord-submit')?.addEventListener('click', submitChord);

  // Global keyboard handler
  document.addEventListener('keydown', handleKeydown);

  // Focus chord input initially
  chordInput?.focus();
});

// ======== CHORD SUBMISSION ========

function submitChord() {
  const input = document.getElementById('chord-input');
  if (!input || !input.value.trim()) return;

  const name = input.value.trim();
  const success = placeChord(name);

  if (success) {
    input.value = '';
    // Auto-advance to next measure (beat 0)
    const next = ChartState.cursor.measure + 1;
    if (next < ChartState.totalMeasures) {
      setCursor(next, 0);
    }
    saveChart();
  } else {
    // Invalid chord — flash the input red briefly
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 400);
  }
}

// ======== KEYBOARD HANDLER ========

function handleKeydown(e) {
  const input = document.getElementById('chord-input');
  const inInput = document.activeElement === input;

  // Always handle Space for play/stop (unless typing)
  if (e.key === ' ' && !inInput) {
    e.preventDefault();
    togglePlay();
    return;
  }

  // Don't handle navigation when typing in input
  if (inInput) return;

  // Stop playback on Escape
  if (e.key === 'Escape' && ChartState.playing) {
    e.preventDefault();
    stopPlayback();
    return;
  }

  const { measuresPerLine, totalMeasures, beatsPerMeasure } = ChartState;
  const { measure, beat } = ChartState.cursor;

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      setCursor(Math.min(measure + 1, totalMeasures - 1), 0);
      break;

    case 'ArrowLeft':
      e.preventDefault();
      setCursor(Math.max(measure - 1, 0), 0);
      break;

    case 'ArrowDown':
      e.preventDefault();
      setCursor(Math.min(measure + measuresPerLine, totalMeasures - 1), beat);
      break;

    case 'ArrowUp':
      e.preventDefault();
      setCursor(Math.max(measure - measuresPerLine, 0), beat);
      break;

    case 'Tab':
      e.preventDefault();
      if (e.shiftKey) {
        setCursor(measure, Math.max(beat - 1, 0));
      } else {
        setCursor(measure, Math.min(beat + 1, beatsPerMeasure - 1));
      }
      break;

    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      removeChord();
      saveChart();
      break;

    case 'Enter':
      e.preventDefault();
      if (input) input.focus();
      break;

    default:
      // Auto-focus chord input on letter keys (A-G for chord roots)
      if (/^[A-Ga-g]$/.test(e.key) && !ChartState.playing) {
        if (input) {
          input.focus();
          // Don't prevent default — let the key be typed
        }
      }
      break;
  }
}
