// ========================================
// APP — Initialization & Keyboard Handler (Phase 3)
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

  // Bars input (controls current section's measure count)
  const barsInput = document.getElementById('bars-input');
  if (barsInput) {
    barsInput.value = getCurrentSection().measures.length;
    barsInput.addEventListener('change', () => {
      const val = parseInt(barsInput.value);
      if (val >= 1 && val <= 128) setTotalMeasures(val);
      barsInput.value = getCurrentSection().measures.length;
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

  // Section bar toggle
  const sectionToggle = document.getElementById('btn-section-toggle');
  const sectionContent = document.getElementById('section-bar-content');
  if (sectionToggle && sectionContent) {
    sectionToggle.addEventListener('click', () => {
      const isHidden = sectionContent.style.display === 'none';
      sectionContent.style.display = isHidden ? '' : 'none';
      sectionToggle.textContent = (isHidden ? '\u25BC' : '\u25B6') + ' Sections';
    });
  }

  // Ending buttons
  document.getElementById('btn-ending-1')?.addEventListener('click', () => {
    setMeasureEnding(getCursorFlat(), 1);
  });
  document.getElementById('btn-ending-2')?.addEventListener('click', () => {
    setMeasureEnding(getCursorFlat(), 2);
  });

  // Initialize builder (includes incremental init)
  initBuilder();

  // Restore key/scale selects from state
  const keySelect = document.getElementById('key-select');
  if (keySelect) keySelect.value = ChartState.key;
  const scaleSelect = document.getElementById('scale-select');
  if (scaleSelect) scaleSelect.value = ChartState.scaleType;

  // Click pattern
  const clickSelect = document.getElementById('click-select');
  if (clickSelect) {
    clickSelect.addEventListener('change', () => {
      ChartState.clickPattern = clickSelect.value;
      saveSoundSettings();
    });
  }

  // Sound controls
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      setPreset(presetSelect.value);
    });
  }
  const volSlider = document.getElementById('vol-slider');
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      setVolume(parseFloat(volSlider.value));
      saveSoundSettings();
    });
  }
  const revSlider = document.getElementById('rev-slider');
  if (revSlider) {
    revSlider.addEventListener('input', () => {
      setReverb(parseFloat(revSlider.value));
      saveSoundSettings();
    });
  }
  // Restore saved sound settings
  loadSoundSettings();

  // Global keyboard handler
  document.addEventListener('keydown', handleKeydown);

  // Auto-focus incremental input on load
  const incInput = document.getElementById('incremental-input');
  if (incInput) incInput.focus();
});

// ======== KEYBOARD HANDLER (Phase 3) ========

function handleKeydown(e) {
  const incInput = document.getElementById('incremental-input');
  const activeEl = document.activeElement;
  const inIncremental = activeEl === incInput;
  const inAnyInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA');

  // Cmd+Z / Cmd+Shift+Z: Undo/Redo (works even in incremental)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) { redo(); } else { undo(); }
    return;
  }

  // Incremental input handles its own keys — let it through
  if (inIncremental) return;

  // Always handle Space for play/stop (unless in other input)
  if (e.key === ' ' && !inAnyInput) {
    e.preventDefault();
    togglePlay();
    return;
  }

  // Don't handle when in other inputs (title, tempo, key select)
  if (inAnyInput) return;

  // ? = Help modal toggle
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    const overlay = document.getElementById('help-overlay');
    if (overlay) overlay.classList.toggle('active');
    return;
  }

  // Stop playback on Escape, or clear repeat range
  if (e.key === 'Escape') {
    e.preventDefault();
    if (ChartState.playing) {
      stopPlayback();
    } else if (ChartState.repeatRange) {
      clearRepeatRange();
    }
    return;
  }

  // Cmd+D / Ctrl+D: Duplicate (same as repeat)
  if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
    e.preventDefault();
    duplicateChord();
    return;
  }

  // Ctrl+R: Copy repeat range
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    copyRepeatRange();
    return;
  }

  const measuresPerLine = ChartState.measuresPerLine;
  const totalMeasures = getTotalMeasures();
  const beatsPerMeasure = getCurrentBeatsPerMeasure();
  const curFlat = getCursorFlat();
  const beat = ChartState.cursor.beat;

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+→: extend range selection right
        if (!ChartState.repeatRange) {
          ChartState.repeatRange = { start: curFlat, end: curFlat };
        }
        if (ChartState.repeatRange.end + 1 < totalMeasures) {
          ChartState.repeatRange.end++;
        }
        renderChart();
      } else {
        // →: 1 beat forward (wraps across measures/sections)
        const nextBeat = beat + 1;
        if (nextBeat < beatsPerMeasure) {
          setCursor(curFlat, nextBeat);
        } else if (curFlat + 1 < totalMeasures) {
          setCursor(curFlat + 1, 0);
        }
      }
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+←: extend range selection left
        if (!ChartState.repeatRange) {
          ChartState.repeatRange = { start: curFlat, end: curFlat };
        }
        if (ChartState.repeatRange.start > 0) {
          ChartState.repeatRange.start--;
        }
        renderChart();
      } else {
        // ←: 1 beat backward (wraps across measures/sections)
        const prevBeat = beat - 1;
        if (prevBeat >= 0) {
          setCursor(curFlat, prevBeat);
        } else if (curFlat > 0) {
          setCursor(curFlat - 1, getBeatsPerMeasureAt(curFlat - 1) - 1);
        }
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      setCursor(Math.min(curFlat + measuresPerLine, totalMeasures - 1), beat);
      break;

    case 'ArrowUp':
      e.preventDefault();
      setCursor(Math.max(curFlat - measuresPerLine, 0), beat);
      break;

    case 'Delete':
      e.preventDefault();
      if (ChartState.repeatRange) {
        pushUndo();
        const { start: rStart, end: rEnd } = ChartState.repeatRange;
        for (let rm = rStart; rm <= rEnd; rm++) {
          const m = getMeasureAt(rm);
          if (m) m.chords = [];
        }
        clearRepeatRange();
        saveChart();
      } else {
        removeChord();
        saveChart();
      }
      break;

    case 'Backspace':
      e.preventDefault();
      if (ChartState.repeatRange) {
        pushUndo();
        const { start: rStart2, end: rEnd2 } = ChartState.repeatRange;
        for (let rm = rStart2; rm <= rEnd2; rm++) {
          const m = getMeasureAt(rm);
          if (m) m.chords = [];
        }
        clearRepeatRange();
        saveChart();
      } else {
        // BS = 消して1拍戻る
        removeChord();
        const prevBeatBS = beat - 1;
        if (prevBeatBS >= 0) {
          setCursor(curFlat, prevBeatBS);
        } else if (curFlat > 0) {
          setCursor(curFlat - 1, getBeatsPerMeasureAt(curFlat - 1) - 1);
        }
        saveChart();
      }
      break;

    case 'r':
    case 'R':
      // Repeat last placed chord (non-Ctrl)
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        repeatLastChord();
      }
      break;

    case 'Enter':
      // Focus incremental input
      e.preventDefault();
      if (incInput) incInput.focus();
      break;

    default:
      // A-G: focus incremental input and pass the keystroke
      if (/^[A-Ga-g]$/.test(e.key) && !ChartState.playing) {
        e.preventDefault();
        if (incInput) {
          incInput.value = e.key.toUpperCase();
          incInput.focus();
          // Trigger input event to generate candidates
          incInput.dispatchEvent(new Event('input'));
        }
      }
      // 0-9: focus incremental input for memory recall
      if (/^[0-9]$/.test(e.key) && !ChartState.playing) {
        e.preventDefault();
        if (incInput) {
          incInput.value = e.key;
          incInput.focus();
          incInput.dispatchEvent(new Event('input'));
        }
      }
      break;
  }
}
