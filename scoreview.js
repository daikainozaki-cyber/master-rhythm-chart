// ========================================
// SCOREVIEW — SVG Score View (Phase 5 Step 3 → SVG)
// ========================================

const KEY_DISPLAY = ['C','D\u266D','D','E\u266D','E','F','G\u266D','G','A\u266D','A','B\u266D','B'];
const SVG_NS = 'http://www.w3.org/2000/svg';

let scoreViewActive = false;

function toggleScoreView(showScore) {
  const grid = document.getElementById('chart-grid');
  const score = document.getElementById('score-view');
  const btnGrid = document.getElementById('btn-view-grid');
  const btnScore = document.getElementById('btn-view-score');
  if (!grid || !score) return;

  scoreViewActive = showScore;

  if (showScore) {
    score.style.display = 'block';
    grid.style.display = 'none';
    btnScore?.classList.add('active');
    btnGrid?.classList.remove('active');
    document.body.classList.add('score-fullscreen');
    renderScoreView();
  } else {
    score.style.display = 'none';
    grid.style.display = '';
    btnGrid?.classList.add('active');
    btnScore?.classList.remove('active');
    document.body.classList.remove('score-fullscreen');
  }
}

// ======== SVG HELPERS ========

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
  }
  return el;
}

function svgText(x, y, text, attrs) {
  const el = svgEl('text', { x, y, ...attrs });
  el.textContent = text;
  return el;
}

function svgLine(x1, y1, x2, y2, attrs) {
  return svgEl('line', { x1, y1, x2, y2, ...attrs });
}

function svgRect(x, y, w, h, attrs) {
  return svgEl('rect', { x, y, width: w, height: h, ...attrs });
}

// Simile mark (single-measure repeat) using Bravura SMuFL font
// U+E500 = repeat1Bar (standard 1-bar repeat sign)
function drawSimile(g, cx, cy) {
  g.appendChild(svgText(cx, cy + 2, '\uE500', {
    'font-family': 'Bravura', 'font-size': 38,
    fill: '#333', 'text-anchor': 'middle', 'dominant-baseline': 'central',
  }));
}

// ======== LAYOUT ========

function calcLayout() {
  const W = 800;
  const rightPad = 8;
  const staffLeft = 64;
  const staffRight = W - rightPad;  // 792
  const staffW = staffRight - staffLeft;  // 728
  const measW = staffW / 4;  // 182
  return {
    W,
    staffLeft,
    staffRight,
    staffW,
    measW,
    lineH: 48,
    lineGap: 14,
    lineGap2: 6, // 2nd ending gap (tighter)
    marginLeft: staffLeft,
    rehW: 28,
    tsW: 24,
    rightPad,
    titleY: 32,
    infoY: 56,
    staffStartY: 80,
    fontFamily: "'Times New Roman', Georgia, serif",
    chordSize: 14,
    titleSize: 22,
    infoSize: 12,
    rehSize: 14,
    tsSize: 14,
    formSize: 11,
    voltaLabelSize: 10,
    repeatSymSize: 18,
  };
}

// ======== MAIN RENDER ========

function renderScoreView() {
  const container = document.getElementById('score-view');
  if (!container) return;
  container.innerHTML = '';

  const L = calcLayout();

  // Precompute all section data
  const repeatCounts = {};
  ChartState.form.forEach(id => { repeatCounts[id] = (repeatCounts[id] || 0) + 1; });

  const allSections = [];
  ChartState.sections.forEach((section, secIdx) => {
    const endingGroups = getEndingGroups(section.measures);
    const hasRepeat = (repeatCounts[section.id] || 0) > 1;
    const scoreLines = buildScoreLines(section.measures, endingGroups, 4);
    allSections.push({ section, secIdx, scoreLines, hasRepeat, endingGroups });
  });

  // Calculate total height
  let totalH = L.staffStartY;
  allSections.forEach(a => {
    a.scoreLines.forEach(sl => {
      totalH += L.lineH + (sl.isEnding2 ? L.lineGap2 : L.lineGap);
    });
  });
  totalH += 40; // form + bottom padding

  // Create SVG
  const svg = svgEl('svg', {
    viewBox: `0 0 ${L.W} ${totalH}`,
    width: '100%',
    preserveAspectRatio: 'xMidYMin meet',
    style: 'background: #fff;',
  });

  // Title
  drawTitle(svg, L);

  // Info line (Key + Tempo)
  drawInfo(svg, L);

  // Score lines
  let y = L.staffStartY;
  allSections.forEach(({ section, secIdx, scoreLines, hasRepeat }) => {
    scoreLines.forEach((sl, lineIdx) => {
      y = drawScoreLine(svg, y, sl, lineIdx, scoreLines.length,
                        section, secIdx, hasRepeat, L);
    });
  });

  // Form display
  if (ChartState.form.length > 1) {
    drawForm(svg, y + 8, L);
  }

  // Grid button (floating)
  drawGridButton(svg, L);

  container.appendChild(svg);
}

// ======== TITLE & INFO ========

function drawTitle(svg, L) {
  const title = ChartState.title || 'Untitled';
  svg.appendChild(svgText(L.W / 2, L.titleY, title, {
    'font-family': L.fontFamily,
    'font-size': L.titleSize,
    'font-weight': '700',
    'text-anchor': 'middle',
    fill: '#000',
    'letter-spacing': '0.05em',
  }));
}

function drawInfo(svg, L) {
  const keyName = KEY_DISPLAY[ChartState.key] || 'C';
  const scaleName = ChartState.scaleType === 'minor' ? 'minor' : 'Major';
  const keyText = `Key: ${keyName} ${scaleName}`;
  const tempoText = `\u2669 = ${ChartState.tempo}`;

  // Key (left)
  svg.appendChild(svgText(L.marginLeft, L.infoY, keyText, {
    'font-family': L.fontFamily,
    'font-size': L.infoSize,
    fill: '#444',
  }));

  // Tempo (right)
  svg.appendChild(svgText(L.W - L.rightPad, L.infoY, tempoText, {
    'font-family': L.fontFamily,
    'font-size': L.infoSize,
    fill: '#444',
    'text-anchor': 'end',
  }));

  // Separator line
  svg.appendChild(svgLine(L.marginLeft, L.infoY + 6, L.W - L.rightPad, L.infoY + 6, {
    stroke: '#000',
    'stroke-width': 2,
  }));
}

// ======== SCORE LINE ========

function drawScoreLine(svg, y, sl, lineIdx, totalLines, section, secIdx, hasRepeat, L) {
  const g = svgEl('g', { transform: `translate(0, ${y})` });
  const bpm = section.timeSignature.beats;
  const noteValue = section.timeSignature.noteValue;
  const isE2 = sl.isEnding2;
  const measCount = sl.measures.length;

  // 1. Margin elements (don't affect measure positions)
  if (lineIdx === 0 && !isE2) {
    drawRehearsal(g, 0, section.label, L);
    drawTimeSig(g, L.staffLeft - L.tsW - 4, bpm, noteValue, L);
  }

  // 2. Fixed measure positions (all lines share the same grid)
  const measStartIdx = isE2 ? sl.offset : 0;

  // 3. Start barline at staffLeft (not for 2nd endings)
  if (!isE2) {
    if (lineIdx === 0 && hasRepeat) {
      drawBarline(g, L.staffLeft, 0, L.lineH, 'repeat-start');
    } else if (lineIdx === 0 && secIdx > 0) {
      drawBarline(g, L.staffLeft, 0, L.lineH, 'double');
    } else {
      drawBarline(g, L.staffLeft, 0, L.lineH, 'single-thick');
    }
  }

  // 4. Determine left padding for first measure based on start barline type
  let firstMeasPad = 6; // default (single/single-thick)
  if (!isE2 && lineIdx === 0 && hasRepeat) {
    firstMeasPad = 16; // repeat-start: thick + thin + dots extend ~14px
  } else if (!isE2 && lineIdx === 0 && secIdx > 0) {
    firstMeasPad = 10; // double barline extends ~6px right
  }

  // 5. Measures + internal barlines (fixed grid)
  let currentVolta = null;
  let prevMeasure = null;

  sl.measures.forEach((measure, mIdx) => {
    const colIdx = measStartIdx + mIdx;
    const mx = L.staffLeft + colIdx * L.measW;
    const nextMx = L.staffLeft + (colIdx + 1) * L.measW;
    const ending = measure.ending;

    // Internal barline at column boundary
    if (mIdx > 0 || (isE2 && mIdx === 0)) {
      drawBarline(g, mx, 0, L.lineH, 'single');
    }

    // Volta bracket tracking
    if (ending && ending !== 0) {
      if (!currentVolta || currentVolta.ending !== ending) {
        currentVolta = { ending, startX: mx, count: 0 };
      }
      currentVolta.count++;
      currentVolta.endX = nextMx;
    } else {
      if (currentVolta) {
        drawVolta(g, currentVolta.startX, currentVolta.endX - currentVolta.startX,
                  currentVolta.ending, L);
        currentVolta = null;
      }
    }

    // Measure content (first measure gets barline-aware padding)
    const pad = (mIdx === 0) ? firstMeasPad : 6;
    drawMeasureContent(g, mx, L.measW, measure, bpm, prevMeasure, L, pad);
    prevMeasure = measure;
  });

  // Close final volta if open
  if (currentVolta) {
    drawVolta(g, currentVolta.startX, currentVolta.endX - currentVolta.startX,
              currentVolta.ending, L);
  }

  // 5. End barline at fixed grid position
  const endX = L.staffLeft + (measStartIdx + measCount) * L.measW;
  const hasEnding1 = sl.measures.some(m => m.ending === 1);

  if (hasEnding1 && hasRepeat) {
    drawBarline(g, endX, 0, L.lineH, 'repeat-end');
  } else if (isE2) {
    drawBarline(g, endX, 0, L.lineH, 'final');
  } else if (lineIdx === totalLines - 1 && !hasRepeat) {
    drawBarline(g, endX, 0, L.lineH, 'double-end');
  } else {
    drawBarline(g, endX, 0, L.lineH, 'single');
  }

  svg.appendChild(g);
  return y + L.lineH + (isE2 ? L.lineGap2 : L.lineGap);
}

// ======== REHEARSAL MARK ========

function drawRehearsal(g, x, label, L) {
  const boxW = L.rehW;
  const boxH = 20;
  const boxY = 2;

  // Box (drawn in margin, does not affect measure positions)
  g.appendChild(svgRect(x + 2, boxY, boxW - 4, boxH, {
    fill: 'none',
    stroke: '#000',
    'stroke-width': 2,
  }));

  // Label
  g.appendChild(svgText(x + boxW / 2, boxY + boxH / 2 + 1, label, {
    'font-family': L.fontFamily,
    'font-size': L.rehSize,
    'font-weight': '700',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: '#000',
  }));
}

// ======== TIME SIGNATURE ========

function drawTimeSig(g, x, beats, noteValue, L) {
  // Drawn in margin (does not affect measure positions)
  if (beats === 4 && noteValue === 4) {
    // Common time: C
    g.appendChild(svgText(x + L.tsW / 2, L.lineH / 2, 'C', {
      'font-family': L.fontFamily,
      'font-size': L.tsSize + 4,
      'font-weight': '700',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: '#000',
    }));
  } else {
    // Stacked: beats/noteValue
    g.appendChild(svgText(x + L.tsW / 2, L.lineH / 2 - 8, String(beats), {
      'font-family': L.fontFamily,
      'font-size': L.tsSize,
      'font-weight': '700',
      'text-anchor': 'middle',
      fill: '#000',
    }));
    g.appendChild(svgText(x + L.tsW / 2, L.lineH / 2 + 10, String(noteValue), {
      'font-family': L.fontFamily,
      'font-size': L.tsSize,
      'font-weight': '700',
      'text-anchor': 'middle',
      fill: '#000',
    }));
  }
}

// ======== BARLINES ========

function drawBarline(g, x, y1, y2, type) {
  // Fixed-position barlines: draw at x, no return value (grid is not affected)
  switch (type) {
    case 'single':
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 1 }));
      break;

    case 'single-thick':
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 1.5 }));
      break;

    case 'double': {
      // thin + thick, extending RIGHT from x (section start)
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 1 }));
      g.appendChild(svgLine(x + 4, y1, x + 4, y2, { stroke: '#000', 'stroke-width': 2.5 }));
      break;
    }

    case 'double-end': {
      // thin + thick, extending LEFT to x (section end)
      g.appendChild(svgLine(x - 4, y1, x - 4, y2, { stroke: '#000', 'stroke-width': 1 }));
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 2.5 }));
      break;
    }

    case 'final': {
      // thin + very thick, extending LEFT to x
      g.appendChild(svgLine(x - 5, y1, x - 5, y2, { stroke: '#000', 'stroke-width': 1 }));
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 3.5 }));
      break;
    }

    case 'repeat-start': {
      // thick | thin | dots — extending RIGHT from x
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 3.5 }));
      g.appendChild(svgLine(x + 5, y1, x + 5, y2, { stroke: '#000', 'stroke-width': 1 }));
      const dotY1s = y1 + (y2 - y1) / 3;
      const dotY2s = y1 + (y2 - y1) * 2 / 3;
      g.appendChild(svgEl('circle', { cx: x + 10, cy: dotY1s, r: 2.5, fill: '#000' }));
      g.appendChild(svgEl('circle', { cx: x + 10, cy: dotY2s, r: 2.5, fill: '#000' }));
      break;
    }

    case 'repeat-end': {
      // dots | thin | thick — extending LEFT to x
      const dotY1e = y1 + (y2 - y1) / 3;
      const dotY2e = y1 + (y2 - y1) * 2 / 3;
      g.appendChild(svgEl('circle', { cx: x - 10, cy: dotY1e, r: 2.5, fill: '#000' }));
      g.appendChild(svgEl('circle', { cx: x - 10, cy: dotY2e, r: 2.5, fill: '#000' }));
      g.appendChild(svgLine(x - 5, y1, x - 5, y2, { stroke: '#000', 'stroke-width': 1 }));
      g.appendChild(svgLine(x, y1, x, y2, { stroke: '#000', 'stroke-width': 3.5 }));
      break;
    }
  }
}

// ======== VOLTA BRACKET ========

function drawVolta(g, x, w, ending, L) {
  const bracketY = -2; // above the line
  const bracketH = 14;

  // L-shape path: down-left | horizontal top | down-right
  const d = `M ${x} ${bracketY + bracketH} V ${bracketY} H ${x + w} V ${bracketY + bracketH}`;
  g.appendChild(svgEl('path', {
    d,
    fill: 'none',
    stroke: '#000',
    'stroke-width': 1.5,
  }));

  // Label
  g.appendChild(svgText(x + 4, bracketY + 10, ending + '.', {
    'font-family': L.fontFamily,
    'font-size': L.voltaLabelSize,
    'font-weight': '700',
    fill: '#000',
  }));
}

// ======== MEASURE CONTENT ========

function drawMeasureContent(g, mx, measW, measure, bpm, prevMeasure, L, leftPad) {
  const cy = L.lineH / 2 + 2; // vertical center for text
  const padL = leftPad || 6; // left padding (varies by barline type)

  // Check for repeat symbol (simile mark)
  if (prevMeasure && measure.chords.length > 0 && svMeasuresEqual(measure, prevMeasure)) {
    drawSimile(g, mx + measW / 2, cy);
    return;
  }

  if (measure.chords.length === 0) return;

  // Layout chords within the measure (left-aligned per slot)
  const chords = measure.chords;
  const slotW = measW / Math.max(chords.length, 1);

  chords.forEach((chord, ci) => {
    // First chord uses leftPad (clears barline), subsequent chords use standard pad
    const cx2 = mx + ci * slotW + (ci === 0 ? padL : 6);
    const name = svFormatChord(chord.name);
    g.appendChild(svgText(cx2, cy, name, {
      'font-family': L.fontFamily,
      'font-size': L.chordSize,
      'font-weight': '400',
      'text-anchor': 'start',
      'dominant-baseline': 'central',
      fill: '#000',
    }));
  });
}

// ======== FORM DISPLAY ========

function drawForm(svg, y, L) {
  const formText = 'Form: ' + ChartState.form.join(' \u2192 ');
  svg.appendChild(svgText(L.W / 2, y, formText, {
    'font-family': L.fontFamily,
    'font-size': L.formSize,
    fill: '#555',
    'text-anchor': 'middle',
  }));
}

// ======== GRID BUTTON (floating) ========

function drawGridButton(svg, L) {
  const btnG = svgEl('g', {
    style: 'cursor: pointer;',
    class: 'sv-grid-btn',
  });

  const bx = L.W - 60;
  const by = 6;
  const bw = 50;
  const bh = 22;

  btnG.appendChild(svgRect(bx, by, bw, bh, {
    rx: 4,
    ry: 4,
    fill: '#f0f0f0',
    stroke: '#999',
    'stroke-width': 1,
  }));

  btnG.appendChild(svgText(bx + bw / 2, by + bh / 2, 'Grid', {
    'font-family': '-apple-system, sans-serif',
    'font-size': 11,
    'font-weight': '600',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: '#333',
  }));

  btnG.addEventListener('click', () => toggleScoreView(false));
  svg.appendChild(btnG);
}

// ======== LINE BUILDING ========

function buildScoreLines(measures, endingGroups, mpl) {
  const lines = [];
  let i = 0;

  while (i < measures.length) {
    const eg2 = endingGroups.find(g => g.ending === 2 && g.start === i);

    if (eg2) {
      const eg1 = endingGroups.find(g => g.ending === 1);
      const offset = eg1 ? (eg1.start % mpl) : 0;

      const line = {
        measures: [],
        offset: offset,
        isEnding2: true,
      };
      for (let j = eg2.start; j <= eg2.end; j++) {
        line.measures.push(measures[j]);
      }
      lines.push(line);
      i = eg2.end + 1;
      continue;
    }

    const line = {
      measures: [],
      offset: 0,
      isEnding2: false,
    };

    for (let col = 0; col < mpl && i < measures.length; col++) {
      if (measures[i].ending === 2) break;
      line.measures.push(measures[i]);
      i++;
    }

    lines.push(line);
  }

  return lines;
}

// ======== HELPERS ========

function svMeasuresEqual(a, b) {
  if (a.chords.length !== b.chords.length || a.chords.length === 0) return false;
  return a.chords.every((c, i) =>
    c.name === b.chords[i].name && c.beat === b.chords[i].beat
  );
}

function svFormatChord(name) {
  if (!name || name.length < 2) return name;
  const second = name[1];
  if (second === 'b') return name[0] + '\u266D' + name.slice(2);
  if (second === '#') return name[0] + '\u266F' + name.slice(2);
  return name;
}
