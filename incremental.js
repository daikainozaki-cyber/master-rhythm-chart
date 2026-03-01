// ========================================
// INCREMENTAL — Real-time chord name input with dropdown candidates
// ========================================

const IncrementalState = {
  selectedIndex: 0,
  candidates: [],
  isOpen: false,
  isExtending: false,
};

// ======== INITIALIZATION ========

function initIncremental() {
  const input = document.getElementById('incremental-input');
  if (!input) return;

  input.addEventListener('input', () => {
    const candidates = generateCandidates(input.value.trim());
    IncrementalState.candidates = candidates;
    IncrementalState.selectedIndex = 0;
    renderDropdown(candidates);
  });

  input.addEventListener('keydown', handleIncrementalKeydown);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.incremental-container')) {
      closeDropdown();
    }
  });
}

// ======== CANDIDATE GENERATION ========

function generateCandidates(input) {
  if (!input) return [];

  // Number only → memory recall
  if (/^\d+$/.test(input)) {
    const idx = parseInt(input) - 1;
    if (idx >= 0 && idx < MemoryState.slots.length && MemoryState.slots[idx]) {
      return [{
        type: 'memory',
        index: idx,
        name: MemoryState.slots[idx].name,
        label: input + ': ' + MemoryState.slots[idx].name,
      }];
    }
    // Show all memory slots matching the prefix
    const results = [];
    for (let i = 0; i < MemoryState.slots.length; i++) {
      const slotNum = String(i + 1);
      if (slotNum.startsWith(input) && MemoryState.slots[i]) {
        results.push({
          type: 'memory',
          index: i,
          name: MemoryState.slots[i].name,
          label: slotNum + ': ' + MemoryState.slots[i].name,
        });
      }
    }
    return results;
  }

  // Root extraction (C, C#, Db etc)
  const rootMatch = input.match(/^([A-Ga-g])([#b]?)/);
  if (!rootMatch) return [];

  const rootWasLower = rootMatch[1] === rootMatch[1].toLowerCase();
  const rootStr = rootMatch[1].toUpperCase() + rootMatch[2];
  const qualityInput = input.slice(rootMatch[0].length);

  // Slash chord branch
  const slashIdx = qualityInput.indexOf('/');
  if (slashIdx >= 0) {
    const quality = qualityInput.slice(0, slashIdx);
    const bassInput = qualityInput.slice(slashIdx + 1);
    return generateSlashCandidates(rootStr, quality, bassInput);
  }

  // QUALITY_KEYS prefix match
  const candidates = [];
  for (const qKey of QUALITY_KEYS) {
    if (qKey.startsWith(qualityInput) || qKey.toLowerCase().startsWith(qualityInput.toLowerCase())) {
      const fullName = rootStr + qKey;
      const parsed = parseChordName(fullName);
      if (parsed) {
        candidates.push({
          type: 'chord',
          name: parsed.displayName,
          quality: qKey,
          exactMatch: qKey === qualityInput || qKey.toLowerCase() === qualityInput.toLowerCase(),
        });
      }
    }
  }

  // Sort: exact match first, then case-aware boost, then shorter quality
  const wantMinor = (rootWasLower && !qualityInput) ||
                    (qualityInput.length > 0 && qualityInput[0] === 'm');
  const wantMajor = qualityInput.length > 0 && qualityInput[0] === 'M';

  candidates.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) return b.exactMatch - a.exactMatch;
    // Case-aware: m → minor first, M → major first, lowercase root → minor first
    if (wantMinor) {
      const aM = a.quality.startsWith('m') ? 1 : 0;
      const bM = b.quality.startsWith('m') ? 1 : 0;
      if (aM !== bM) return bM - aM;
    } else if (wantMajor) {
      const aJ = (a.quality.startsWith('M') || a.quality.startsWith('maj')) ? 1 : 0;
      const bJ = (b.quality.startsWith('M') || b.quality.startsWith('maj')) ? 1 : 0;
      if (aJ !== bJ) return bJ - aJ;
    }
    return a.quality.length - b.quality.length;
  });

  return candidates.slice(0, 12);
}

function generateSlashCandidates(rootStr, quality, bassInput) {
  // Validate the root + quality part exists
  const baseCheck = rootStr + quality;
  if (quality && !parseChordName(baseCheck)) return [];

  const bassNotes = NOTE_NAMES_SHARP.filter(n =>
    !bassInput || n.toLowerCase().startsWith(bassInput.toLowerCase())
  );

  return bassNotes.map(bass => {
    const fullName = rootStr + quality + '/' + bass;
    const parsed = parseChordName(fullName);
    if (!parsed) return null;
    return { type: 'chord', name: parsed.displayName };
  }).filter(Boolean).slice(0, 12);
}

// ======== EXTENSION CANDIDATES (→ key) ========

function generateExtensionCandidates(baseName) {
  const rootMatch = baseName.match(/^([A-G][#b]?)/);
  if (!rootMatch) return [];
  const rootStr = rootMatch[1];
  const baseQuality = baseName.slice(rootStr.length);

  const candidates = [];
  for (const qKey of QUALITY_KEYS) {
    if (qKey.length > baseQuality.length && qKey.startsWith(baseQuality)) {
      const fullName = rootStr + qKey;
      const parsed = parseChordName(fullName);
      if (parsed) {
        candidates.push({ type: 'chord', name: parsed.displayName, quality: qKey });
      }
    }
  }
  // Sort shorter extensions first (more common)
  candidates.sort((a, b) => a.quality.length - b.quality.length);
  // Add slash chord action at the end
  candidates.push({ type: 'action', name: baseName + '/...', label: '\u2192 \u30AA\u30F3\u30B3\u30FC\u30C9' });
  return candidates.slice(0, 12);
}

// ======== DROPDOWN RENDERING ========

function renderDropdown(candidates) {
  const dropdown = document.getElementById('incremental-dropdown');
  if (!dropdown) return;

  if (candidates.length === 0) {
    closeDropdown();
    return;
  }

  dropdown.innerHTML = '';
  IncrementalState.isOpen = true;
  dropdown.classList.add('active');

  candidates.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'incremental-candidate' + (i === IncrementalState.selectedIndex ? ' selected' : '');
    div.textContent = c.label || c.name;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Don't blur input
      commitIncremental(c);
    });
    div.addEventListener('mouseenter', () => {
      IncrementalState.selectedIndex = i;
      updateDropdownSelection();
    });
    dropdown.appendChild(div);
  });
}

function updateDropdownSelection() {
  const dropdown = document.getElementById('incremental-dropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.incremental-candidate');
  items.forEach((el, i) => {
    el.classList.toggle('selected', i === IncrementalState.selectedIndex);
  });
}

function closeDropdown() {
  const dropdown = document.getElementById('incremental-dropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.classList.remove('active');
  }
  IncrementalState.isOpen = false;
  IncrementalState.isExtending = false;
  IncrementalState.candidates = [];
  IncrementalState.selectedIndex = 0;
}

// ======== COMMIT (place chord) ========

function commitIncremental(candidate) {
  const input = document.getElementById('incremental-input');
  if (!input) return;

  if (candidate.type === 'action') {
    // Slash chord action: set input to base + '/' and trigger re-generation
    const baseName = candidate.name.replace('/...', '');
    input.value = baseName + '/';
    IncrementalState.isExtending = false;
    input.dispatchEvent(new Event('input'));
    return;
  }

  if (candidate.type === 'memory') {
    recallMemorySlot(candidate.index);
  } else {
    const success = placeChord(candidate.name);
    if (success) {
      addToMemory(ChartState.lastPlacedChord);
      advanceCursor();
      saveChart();
    }
  }

  input.value = '';
  closeDropdown();
  input.focus();
}

// ======== KEYBOARD HANDLER ========

function handleIncrementalKeydown(e) {
  const input = document.getElementById('incremental-input');

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      if (IncrementalState.isOpen && IncrementalState.candidates.length > 0) {
        // Commit selected or first candidate
        const candidate = IncrementalState.candidates[IncrementalState.selectedIndex] ||
                          IncrementalState.candidates[0];
        commitIncremental(candidate);
      } else if (input.value.trim()) {
        // Free-text: try parseChordName directly
        const name = input.value.trim();
        const parsed = parseChordName(name);
        if (parsed) {
          const success = placeChord(parsed.displayName);
          if (success) {
            addToMemory(ChartState.lastPlacedChord);
            advanceCursor();
            saveChart();
          }
        } else {
          // Flash error
          input.classList.add('error');
          setTimeout(() => input.classList.remove('error'), 400);
          return;
        }
        input.value = '';
        closeDropdown();
      }
      break;

    case 'ArrowDown':
      if (IncrementalState.isOpen) {
        e.preventDefault();
        IncrementalState.selectedIndex = Math.min(
          IncrementalState.selectedIndex + 1,
          IncrementalState.candidates.length - 1
        );
        updateDropdownSelection();
      } else if (!input.value) {
        e.preventDefault();
        setCursor(Math.min(getCursorFlat() + ChartState.measuresPerLine, getTotalMeasures() - 1), ChartState.cursor.beat);
      }
      break;

    case 'ArrowUp':
      if (IncrementalState.isOpen) {
        e.preventDefault();
        IncrementalState.selectedIndex = Math.max(
          IncrementalState.selectedIndex - 1,
          0
        );
        updateDropdownSelection();
      } else if (!input.value) {
        e.preventDefault();
        setCursor(Math.max(getCursorFlat() - ChartState.measuresPerLine, 0), ChartState.cursor.beat);
      }
      break;

    case 'Tab':
      if (IncrementalState.isOpen && IncrementalState.candidates.length > 0) {
        e.preventDefault();
        // Tab-complete: fill input with first candidate name
        const candidate = IncrementalState.candidates[IncrementalState.selectedIndex] ||
                          IncrementalState.candidates[0];
        input.value = candidate.name;
        // Re-generate candidates with completed name
        const newCandidates = generateCandidates(input.value.trim());
        IncrementalState.candidates = newCandidates;
        IncrementalState.selectedIndex = 0;
        renderDropdown(newCandidates);
      }
      break;

    case 'Escape':
      e.preventDefault();
      if (IncrementalState.isOpen) {
        closeDropdown();
        input.value = '';
      } else {
        input.blur();
      }
      break;

    case ' ':
      // Space toggles play when input is empty
      if (!input.value.trim()) {
        e.preventDefault();
        togglePlay();
      }
      break;

    case 'Backspace':
      if (!input.value && !IncrementalState.isOpen) {
        e.preventDefault();
        // BS = 戻りながら消す（テキストエディタ的）
        const bsFlat = getCursorFlat();
        const bsB = ChartState.cursor.beat;
        // まず現在位置のコードを消す
        removeChord();
        // 1拍戻る
        const prevB = bsB - 1;
        if (prevB >= 0) {
          setCursor(bsFlat, prevB);
        } else if (bsFlat > 0) {
          setCursor(bsFlat - 1, getBeatsPerMeasureAt(bsFlat - 1) - 1);
        }
        saveChart();
      }
      break;

    case 'Delete':
      if (!input.value && !IncrementalState.isOpen) {
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
      }
      break;

    case 'ArrowRight':
      if (input.value && IncrementalState.isOpen && !IncrementalState.isExtending) {
        // Input has value & dropdown open & not yet extending → extension mode
        e.preventDefault();
        const selCand = IncrementalState.candidates[IncrementalState.selectedIndex];
        if (selCand && selCand.name) {
          input.value = selCand.name;
          IncrementalState.isExtending = true;
          const extCandidates = generateExtensionCandidates(input.value);
          IncrementalState.candidates = extCandidates;
          IncrementalState.selectedIndex = 0;
          renderDropdown(extCandidates);
        }
      } else if (IncrementalState.isExtending && !input.value.endsWith('/')) {
        // Already extending → add slash for on-chord input
        e.preventDefault();
        input.value += '/';
        input.dispatchEvent(new Event('input'));
        IncrementalState.isExtending = false;
      } else if (!input.value && !IncrementalState.isOpen) {
        // Empty input → cursor movement
        e.preventDefault();
        if (e.shiftKey) {
          setCursor(getCursorFlat() + 1, 0);
        } else {
          advanceCursor();
        }
      }
      break;

    case 'ArrowLeft':
      // Move cursor when input is empty
      if (!input.value && !IncrementalState.isOpen) {
        e.preventDefault();
        const leftFlat = getCursorFlat();
        const leftBeat = ChartState.cursor.beat;
        if (e.shiftKey) {
          setCursor(leftFlat - 1, 0);
        } else {
          const prevBeat = leftBeat - 1;
          if (prevBeat >= 0) {
            setCursor(leftFlat, prevBeat);
          } else if (leftFlat > 0) {
            setCursor(leftFlat - 1, getBeatsPerMeasureAt(leftFlat - 1) - 1);
          }
        }
      }
      break;
  }
}
