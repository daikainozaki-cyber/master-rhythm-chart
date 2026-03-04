// ========================================
// PAD-CORE — Pure voicing calculation & SVG rendering
// Extracted from 64 Pad Explorer for shared use
// ========================================

const PAD = {
  ROWS: 8, COLS: 8,
  BASE_MIDI: 36, ROW_INTERVAL: 5, COL_INTERVAL: 1,
  PAD_SIZE: 44, PAD_GAP: 4, MARGIN: 16,
};

// ======== GRID MATH ========

function padBaseMidi(octaveShift) {
  return PAD.BASE_MIDI + (octaveShift || 0) * 12;
}

function padMidiNote(row, col, octaveShift) {
  return padBaseMidi(octaveShift) + row * PAD.ROW_INTERVAL + col * PAD.COL_INTERVAL;
}

function padPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function padNoteName(midi) {
  return NOTE_NAMES_SHARP[padPitchClass(midi)] + (Math.floor(midi / 12) - 2);
}

// ======== VOICING CALCULATION ========

function padCalcVoicingOffsets(chordPCS, inversion, drop) {
  let voiced = [...chordPCS].sort((a, b) => a - b);
  for (let i = 0; i < inversion && i < voiced.length; i++) {
    voiced.push(voiced.shift() + 12);
  }
  if (drop === 'drop2' && voiced.length >= 4) {
    voiced[voiced.length - 2] -= 12;
    voiced.sort((a, b) => a - b);
  } else if (drop === 'drop3' && voiced.length >= 4) {
    voiced[voiced.length - 3] -= 12;
    voiced.sort((a, b) => a - b);
  }
  const minVal = voiced[0];
  const offsets = voiced.map(v => v - minVal);
  return { offsets, bassInterval: voiced[0], voiced };
}

function padGetBassCase(bassPC, rootPC, chordPCS) {
  const bassIv = ((bassPC - rootPC) % 12 + 12) % 12;
  const sorted = [...new Set(chordPCS.map(iv => iv % 12))].sort((a, b) => a - b);
  const idx = sorted.indexOf(bassIv);
  return { isChordTone: idx >= 0, inversionIndex: idx >= 0 ? idx : null };
}

function padApplyOnChordBass(voiced, rootPC, bassPC) {
  const bassIv = ((bassPC - rootPC) % 12 + 12) % 12;
  const lowestPC = ((voiced[0] % 12) + 12) % 12;
  if (lowestPC === bassIv) return voiced;
  let bassVal = bassIv;
  while (bassVal >= voiced[0]) bassVal -= 12;
  return [bassVal, ...voiced].sort((a, b) => a - b);
}

function padGetShellIntervals(qualityPCS, shellMode, extension, fullPCS) {
  let thirdIv = null, seventhIv = null;
  if (qualityPCS) {
    if (qualityPCS.includes(4)) thirdIv = 4;
    else if (qualityPCS.includes(3)) thirdIv = 3;
    if (qualityPCS.includes(11)) seventhIv = 11;
    else if (qualityPCS.includes(10)) seventhIv = 10;
    else if (qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) {
      seventhIv = 9;
    }
  }
  if (thirdIv === null || seventhIv === null) return null;
  let intervals = [0, thirdIv, seventhIv];
  if (fullPCS) {
    fullPCS.filter(iv => iv >= 12).forEach(iv => {
      if (!intervals.includes(iv)) intervals.push(iv);
    });
  }
  if (extension > 0 && fullPCS) {
    const shellSet = new Set(intervals.map(iv => iv % 12));
    const extras = fullPCS.filter(iv => !shellSet.has(iv)).sort((a, b) => {
      const at = a >= 12 ? 0 : 1;
      const bt = b >= 12 ? 0 : 1;
      if (at !== bt) return at - bt;
      return a - b;
    });
    const extCount = Math.min(extension, extras.length);
    for (let i = 0; i < extCount; i++) intervals.push(extras[i]);
  }
  if (shellMode === '173') {
    intervals = intervals.map(iv => iv === thirdIv ? iv + 12 : iv);
  }
  intervals.sort((a, b) => a - b);
  return intervals;
}

// ======== VOICING POSITION SEARCH ========

function padCalcAllPositions(bassRow, bassCol, offsets, octaveShift, maxResults) {
  if (maxResults === undefined) maxResults = 10;
  const bm = padBaseMidi(octaveShift);
  const bassMidi = bm + bassRow * PAD.ROW_INTERVAL + bassCol;
  const candidates = offsets.slice(1).map(offset => {
    const targetMidi = bassMidi + offset;
    const positions = [];
    for (let r = 0; r < PAD.ROWS; r++) {
      const c = targetMidi - bm - r * PAD.ROW_INTERVAL;
      if (c >= 0 && c < PAD.COLS) positions.push({ row: r, col: c });
    }
    return positions;
  });
  if (candidates.some(c => c.length === 0)) return [];
  const bassPos = { row: bassRow, col: bassCol };
  const results = [];
  function search(idx, chosen) {
    if (idx === candidates.length) {
      const all = [bassPos, ...chosen];
      const minR = Math.min(...all.map(p => p.row));
      const maxR = Math.max(...all.map(p => p.row));
      const minC = Math.min(...all.map(p => p.col));
      const maxC = Math.max(...all.map(p => p.col));
      const rowSpan = maxR - minR + 1, colSpan = maxC - minC + 1;
      if (rowSpan > 5 || colSpan > 6) return;
      const maxDim = Math.max(rowSpan, colSpan);
      const area = rowSpan * colSpan;
      results.push({ positions: all, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC, maxDim, area });
      return;
    }
    for (const pos of candidates[idx]) search(idx + 1, [...chosen, pos]);
  }
  search(0, []);
  results.sort((a, b) => a.maxDim - b.maxDim || a.area - b.area);
  return results.slice(0, maxResults);
}

// ======== COMPUTE VOICING BOXES ========

function padComputeBoxes(offsets, targetPC, octaveShift, maxRS, maxCS) {
  const boxes = [];
  for (let row = 0; row < PAD.ROWS; row++) {
    for (let col = 0; col < PAD.COLS; col++) {
      const midi = padMidiNote(row, col, octaveShift);
      if (padPitchClass(midi) !== targetPC) continue;
      const allVP = padCalcAllPositions(row, col, offsets, octaveShift);
      if (allVP.length === 0) continue;
      const filtered = maxRS ? allVP.filter(vp => {
        const rs = vp.maxRow - vp.minRow + 1, cs = vp.maxCol - vp.minCol + 1;
        return rs <= maxRS && cs <= maxCS;
      }) : allVP;
      if (filtered.length === 0) continue;
      boxes.push({ midi, row, col, alternatives: filtered });
    }
  }
  boxes.sort((a, b) => a.midi - b.midi);
  return boxes;
}

// ======== DEGREE NAME (simplified — no BuilderState dependency) ========

function padDegreeName(interval, qualityPCS) {
  switch (interval) {
    case 0: return 'R';
    case 1: return 'b9';
    case 2: return '9';
    case 3:
      if (qualityPCS && qualityPCS.includes(4)) return '#9';
      return 'm3';
    case 4: return '3';
    case 5:
      if (qualityPCS && !qualityPCS.includes(3) && !qualityPCS.includes(4)) return '4';
      return '11';
    case 6:
      if (qualityPCS && qualityPCS.includes(6)) return 'b5';
      return '#11';
    case 7: return '5';
    case 8:
      if (qualityPCS && qualityPCS.includes(8)) return '#5';
      return 'b13';
    case 9:
      if (qualityPCS && qualityPCS.includes(9) && !qualityPCS.includes(10) && !qualityPCS.includes(11)) return '6';
      return '13';
    case 10: return 'b7';
    case 11: return '△7';
  }
  return '';
}

// ======== SVG RENDERING ========

function padGridViewBox() {
  const w = PAD.MARGIN * 2 + PAD.COLS * (PAD.PAD_SIZE + PAD.PAD_GAP) - PAD.PAD_GAP;
  const h = PAD.MARGIN * 2 + PAD.ROWS * (PAD.PAD_SIZE + PAD.PAD_GAP) - PAD.PAD_GAP;
  return { w, h };
}

function padRenderGrid(svg, activePCS, rootPC, bassPC, qualityPCS, octaveShift, selectedBox) {
  const selMidi = selectedBox ? new Set(selectedBox.midiNotes) : null;
  const S = PAD.PAD_SIZE, G = PAD.PAD_GAP, M = PAD.MARGIN;

  for (let row = 0; row < PAD.ROWS; row++) {
    for (let col = 0; col < PAD.COLS; col++) {
      const midi = padMidiNote(row, col, octaveShift);
      const pc = padPitchClass(midi);
      const x = M + col * (S + G);
      const y = M + (PAD.ROWS - 1 - row) * (S + G);
      const interval = ((pc - rootPC) + 12) % 12;
      const isRoot = pc === rootPC;
      const isBass = bassPC !== null && pc === bassPC && pc !== rootPC;
      const isActive = activePCS.has(pc);

      // Guide tones
      const isGuide3 = [3, 4].some(iv => (rootPC + iv) % 12 === pc) && isActive && !isRoot;
      const isGuide7 = [10, 11].some(iv => (rootPC + iv) % 12 === pc) && isActive && !isRoot;
      // 6th chord: treat 6th as guide7
      const is6thGuide = qualityPCS && qualityPCS.includes(9) &&
        !qualityPCS.includes(10) && !qualityPCS.includes(11) &&
        (rootPC + 9) % 12 === pc && isActive && !isRoot;
      const isGuide = isGuide3 || isGuide7 || is6thGuide;

      let fill = '#2a2a3e', textColor = '#666';
      if (isRoot && isActive) { fill = '#E69F00'; textColor = '#000'; }
      else if (isBass) { fill = '#ff9800'; textColor = '#000'; }
      else if (isGuide3) { fill = '#009E73'; textColor = '#fff'; }
      else if (isGuide7 || is6thGuide) { fill = '#CC79A7'; textColor = '#fff'; }
      else if (isActive) { fill = '#56B4E9'; textColor = '#000'; }

      const isDimmed = selMidi && !selMidi.has(midi) && fill !== '#2a2a3e';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', S); rect.setAttribute('height', S);
      rect.setAttribute('rx', 5); rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)');
      rect.setAttribute('stroke-width', isActive ? 1.5 : 0.5);
      if (isDimmed) rect.setAttribute('opacity', '0.3');
      svg.appendChild(rect);

      // Note name
      const showDegree = rootPC !== null && isActive;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + S / 2);
      text.setAttribute('y', showDegree ? y + 11 : y + S / 2 - 3);
      text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', textColor);
      text.setAttribute('font-size', showDegree ? '8px' : '8px');
      text.setAttribute('font-weight', showDegree ? '600' : '400');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.textContent = NOTE_NAMES_SHARP[pc];
      if (isDimmed) text.setAttribute('opacity', '0.3');
      svg.appendChild(text);

      // Degree label
      if (showDegree) {
        const degName = padDegreeName(interval, qualityPCS);
        const degText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        degText.setAttribute('x', x + S / 2);
        degText.setAttribute('y', y + 25);
        degText.setAttribute('text-anchor', 'middle'); degText.setAttribute('dominant-baseline', 'middle');
        degText.setAttribute('fill', textColor);
        degText.setAttribute('font-size', '11px'); degText.setAttribute('font-weight', '700');
        degText.setAttribute('font-family', 'system-ui, sans-serif');
        degText.textContent = degName;
        if (isDimmed) degText.setAttribute('opacity', '0.3');
        svg.appendChild(degText);
      }

      // Octave label
      const octText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      octText.setAttribute('x', x + S / 2);
      octText.setAttribute('y', showDegree ? y + 38 : y + S / 2 + 9);
      octText.setAttribute('text-anchor', 'middle'); octText.setAttribute('dominant-baseline', 'middle');
      octText.setAttribute('fill', textColor);
      octText.setAttribute('font-size', '7px'); octText.setAttribute('opacity', isDimmed ? '0.15' : '0.5');
      octText.setAttribute('font-family', 'system-ui, sans-serif');
      octText.textContent = padNoteName(midi);
      svg.appendChild(octText);
    }
  }
}

// ======== DRAW VOICING BOXES ========

function padDrawBoxes(svg, boxes, selectedIdx, cycleIndices, octaveShift, onSelect) {
  const S = PAD.PAD_SIZE, G = PAD.PAD_GAP, M = PAD.MARGIN;
  const hasSelection = selectedIdx !== null;
  const bm = padBaseMidi(octaveShift);

  // Build lastBoxes data
  const lastBoxes = boxes.map((b, idx) => {
    const altIdx = (cycleIndices && cycleIndices[idx]) || 0;
    const safeIdx = altIdx < b.alternatives.length ? altIdx : 0;
    const currentVP = b.alternatives[safeIdx];
    return {
      rootRow: b.row, rootCol: b.col,
      midiNotes: currentVP.positions.map(p => bm + p.row * PAD.ROW_INTERVAL + p.col).sort((a, b) => a - b),
      alternatives: b.alternatives,
      currentAlt: safeIdx
    };
  });

  // Draw
  const cycleableSet = new Set();
  boxes.forEach((b, idx) => { if (b.alternatives.length > 1) cycleableSet.add(idx); });

  boxes.forEach((b, idx) => {
    const sel = selectedIdx === idx;
    if (hasSelection && !sel) return;

    const safeIdx = lastBoxes[idx].currentAlt;
    const vp = b.alternatives[safeIdx];
    const isCycleable = cycleableSet.has(idx);

    // Bounding box
    const bx = M + vp.minCol * (S + G) - 3;
    const by = M + (PAD.ROWS - 1 - vp.maxRow) * (S + G) - 3;
    const bw = (vp.maxCol - vp.minCol + 1) * (S + G) - G + 6;
    const bh = (vp.maxRow - vp.minRow + 1) * (S + G) - G + 6;
    const boxRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    boxRect.setAttribute('x', bx); boxRect.setAttribute('y', by);
    boxRect.setAttribute('width', bw); boxRect.setAttribute('height', bh);
    boxRect.setAttribute('rx', 6); boxRect.setAttribute('fill', 'none');
    boxRect.setAttribute('stroke', sel ? '#fff' : 'rgba(255,255,255,0.6)');
    boxRect.setAttribute('stroke-width', sel ? 2.5 : 1.5);
    boxRect.setAttribute('stroke-dasharray', '5 3');
    boxRect.setAttribute('opacity', sel ? '1' : '0.7');
    svg.appendChild(boxRect);

    // Individual pad frames for selected box
    if (sel) {
      vp.positions.forEach(pos => {
        const px = M + pos.col * (S + G) - 2;
        const py = M + (PAD.ROWS - 1 - pos.row) * (S + G) - 2;
        const padRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        padRect.setAttribute('x', px); padRect.setAttribute('y', py);
        padRect.setAttribute('width', S + 4); padRect.setAttribute('height', S + 4);
        padRect.setAttribute('rx', 5); padRect.setAttribute('fill', 'none');
        padRect.setAttribute('stroke', '#fff'); padRect.setAttribute('stroke-width', 2);
        svg.appendChild(padRect);
      });
    }

    // Badge (clickable label: A, B, C...)
    const bassPos = vp.positions[0];
    const bsz = isCycleable ? 22 : 16;
    const bX = M + bassPos.col * (S + G);
    const bY = M + (PAD.ROWS - 1 - bassPos.row) * (S + G);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'pointer';
    if (onSelect) g.addEventListener('click', () => onSelect(idx));

    const br = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    br.setAttribute('x', bX); br.setAttribute('y', bY);
    br.setAttribute('width', bsz); br.setAttribute('height', bsz);
    br.setAttribute('rx', 3);
    br.setAttribute('fill', sel ? '#000' : '#fff');
    br.setAttribute('opacity', '0.9');
    g.appendChild(br);

    const bt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    bt.setAttribute('x', bX + bsz / 2); bt.setAttribute('y', bY + bsz / 2 + 1);
    bt.setAttribute('text-anchor', 'middle'); bt.setAttribute('dominant-baseline', 'middle');
    bt.setAttribute('fill', sel ? '#fff' : '#000');
    bt.setAttribute('font-weight', '800');
    bt.setAttribute('font-family', 'system-ui, sans-serif');
    const boxLetter = String.fromCharCode(65 + idx);
    if (isCycleable && sel) {
      const box = lastBoxes[idx];
      bt.setAttribute('font-size', '9px');
      bt.textContent = boxLetter + (box.currentAlt + 1) + '/' + box.alternatives.length;
    } else {
      bt.setAttribute('font-size', '11px');
      bt.textContent = boxLetter;
    }
    g.appendChild(bt);
    svg.appendChild(g);
  });

  return lastBoxes;
}
