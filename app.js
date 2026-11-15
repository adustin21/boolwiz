// BoolWiz — truth table + Karnaugh map visualizer (vanilla JS, no dependencies).
// Output values per cell: null (unset) | 0 | 1 | 'X' (don't care).
// outputs[b][i] is output bit b at minterm i. A K-map is shown only for a single output bit.

(function () {
  'use strict';

  const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E'];
  const DEFAULT_N = 3;
  const MAX_W = 8;                 // most output bits
  const STORE_KEY = 'boolwiz.tables.v1';
  const NAME_RE = /^[A-Za-z](?:_[0-9]{1,2})?$/; // A, B, ..., A_1, A_2, ..., A_99
  const NAME_MAX = 4;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DEFAULT_OUT = 'F';

  let n = DEFAULT_N;
  let names = [...DEFAULT_NAMES];  // variable names (validated)
  let outNames = [DEFAULT_OUT];    // one name per output bit (validated)
  let outputs = [];                // outputs[b][i]: one column per output bit, 2^n cells each
  const ttEls = [];                // ttEls[b][i]: truth-table output buttons
  const kEls = [];                 // K-map cell buttons by minterm (only with one output bit)
  const varHeads = [];             // truth-table header cells for the variables
  const outHeads = [];             // truth-table header cells for the outputs

  const $ = (sel) => document.querySelector(sel);

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Binary-reflected Gray code: 0,1,3,2,6,7,5,4,...
  const gray = (i) => i ^ (i >> 1);
  const bin = (v, bits) => v.toString(2).padStart(bits, '0');

  // How many variables go on the K-map rows (r) and columns (c).
  // Remaining variables (n - r - c) become separate map panels (only E for n = 5).
  function layoutFor(count) {
    if (count === 2) return { r: 1, c: 1 };
    if (count === 3) return { r: 1, c: 2 };
    return { r: 2, c: 2 }; // 4 and 5 variables
  }

  function nextValue(v) {
    if (v === null) return 0;
    if (v === 0) return 1;
    if (v === 1) return 'X';
    return null;
  }

  function stateClass(v) {
    if (v === null) return 'st-blank';
    if (v === 0) return 'st-0';
    if (v === 1) return 'st-1';
    return 'st-x';
  }

  // A fresh set of output columns, each with 2^n unset cells.
  function newCols(w) {
    return Array.from({ length: w }, () => new Array(1 << n).fill(null));
  }

  function paintCell(btn, b, i) {
    const v = outputs[b][i];
    btn.classList.remove('st-blank', 'st-0', 'st-1', 'st-x');
    btn.classList.add(stateClass(v));
    btn.querySelector('.v').textContent = v === null ? '' : String(v);
    btn.setAttribute('aria-label', `minterm ${i}, ${outNames[b]} ${v === null ? 'unset' : v}`);
  }

  function setOutput(i, v, b = 0) {
    outputs[b][i] = v;
    paintCell(ttEls[b][i], b, i);
    if (kEls[i]) paintCell(kEls[i], 0, i);
    updateStats();
  }

  function paintAll() {
    outputs.forEach((col, b) => col.forEach((_, i) => paintCell(ttEls[b][i], b, i)));
    kEls.forEach((btn, i) => paintCell(btn, 0, i));
    updateStats();
  }

  // ---------- Variable and output names ----------

  function uniqueIgnoreCase(list) {
    const seen = new Set();
    for (const s of list) {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }

  // Valid pattern, and unique (case-insensitive) among the active variables and the outputs.
  function isValidName(name, j) {
    if (!NAME_RE.test(name)) return false;
    const others = names.slice(0, n).filter((_, k) => k !== j);
    return uniqueIgnoreCase([...others, ...outNames, name]);
  }

  // Output name b: same pattern, unique among the active variables and the other outputs.
  function isValidOutName(name, b) {
    if (!NAME_RE.test(name)) return false;
    const others = outNames.filter((_, k) => k !== b);
    return uniqueIgnoreCase([...names.slice(0, n), ...others, name]);
  }

  // Keep each preferred output name that is valid and free; otherwise use the first free default.
  function fixOutNames(list, taken, w) {
    const out = [];
    for (let b = 0; b < w; b++) {
      const pref = Array.isArray(list) ? list[b] : undefined;
      if (typeof pref === 'string' && NAME_RE.test(pref) && uniqueIgnoreCase([...taken, ...out, pref])) {
        out.push(pref);
      } else {
        out.push([DEFAULT_OUT, ...LETTERS.split('')].find((c) => uniqueIgnoreCase([...taken, ...out, c])));
      }
    }
    return out;
  }

  // Render a name LaTeX-style: A_1 -> A with subscript 1. Input is always validated.
  function nameHTML(name) {
    const m = /^([A-Za-z])_([0-9]+)$/.exec(name);
    return m ? `${m[1]}<sub>${m[2]}</sub>` : name;
  }

  // Fix up names loaded from storage: keep valid unique ones, replace the rest.
  function sanitizeNames(list) {
    const out = [];
    for (let j = 0; j < DEFAULT_NAMES.length; j++) {
      let cand = Array.isArray(list) ? list[j] : undefined;
      if (typeof cand !== 'string' || !NAME_RE.test(cand) || !uniqueIgnoreCase([...out, cand])) {
        cand = LETTERS.split('').find((l) => uniqueIgnoreCase([...out, l]));
      }
      out.push(cand);
    }
    return out;
  }

  // ---------- Variables panel ----------

  function syncSegButtons() {
    document.querySelectorAll('.seg[data-n]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n));
    });
    document.querySelectorAll('.seg[data-w]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.w) === outputs.length));
    });
  }

  function buildVarInputs() {
    const host = $('#var-names');
    host.innerHTML = '';

    const addField = (cap, value, key, val) => {
      const field = el('label', 'var-field');
      const capEl = el('span', 'var-cap');
      capEl.textContent = cap;
      const input = el('input', 'vname');
      input.type = 'text';
      input.maxLength = NAME_MAX;
      input.value = value;
      input.dataset[key] = val;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-describedby', 'var-hint');
      field.append(capEl, input);
      host.append(field);
    };

    for (let j = 0; j < n; j++) {
      addField(`Variable ${j + 1}`, names[j], 'j', j);
    }
    for (let b = 0; b < outputs.length; b++) {
      const cap = outputs.length === 1 ? 'Output' : `Output ${b + 1}`;
      addField(cap, outNames[b], 'b', b);
    }
  }

  // ---------- Truth table ----------

  function buildTable() {
    const table = $('#tt');
    table.innerHTML = '';
    ttEls.length = 0;
    varHeads.length = 0;
    outHeads.length = 0;

    const w = outputs.length;
    for (let b = 0; b < w; b++) ttEls.push([]);

    const thead = el('thead');
    const hr = el('tr');

    const thIdx = el('th', 'idx-h');
    thIdx.textContent = 'm';
    hr.append(thIdx);

    for (let j = 0; j < n; j++) {
      const th = el('th', 'var-h');
      th.innerHTML = nameHTML(names[j]);
      varHeads.push(th);
      hr.append(th);
    }

    for (let b = 0; b < w; b++) {
      const th = el('th', b === 0 ? 'out-h out-first' : 'out-h');
      th.innerHTML = nameHTML(outNames[b]);
      outHeads.push(th);
      hr.append(th);
    }
    thead.append(hr);

    const tbody = el('tbody');
    for (let i = 0; i < (1 << n); i++) {
      const tr = el('tr');

      const idx = el('td', 'idx');
      idx.textContent = i;
      tr.append(idx);

      for (let j = 0; j < n; j++) {
        const td = el('td', 'bit');
        td.textContent = (i >> (n - 1 - j)) & 1;
        tr.append(td);
      }

      for (let b = 0; b < w; b++) {
        const outTd = el('td', b === 0 ? 'out-td out-first' : 'out-td');
        const btn = el('button', 'out');
        btn.type = 'button';
        btn.dataset.i = i;
        btn.dataset.b = b;
        btn.innerHTML = '<span class="v"></span>';
        outTd.append(btn);
        tr.append(outTd);
        ttEls[b][i] = btn;
      }

      tbody.append(tr);
    }

    table.append(thead, tbody);
  }

  function refreshHeaders() {
    varHeads.forEach((th, j) => { th.innerHTML = nameHTML(names[j]); });
    outHeads.forEach((th, b) => { th.innerHTML = nameHTML(outNames[b]); });
  }

  // ---------- K-map ----------

  function buildKmap() {
    const host = $('#kmap');
    host.innerHTML = '';
    kEls.length = 0;
    if (outputs.length > 1) return; // a K-map needs a single output bit

    const { r, c } = layoutFor(n);
    const extra = n - r - c;          // 0, or 1 (E) for five variables
    const panels = 1 << extra;
    const rowNames = names.slice(0, r);
    const colNames = names.slice(r, r + c);
    const rowCodes = Array.from({ length: 1 << r }, (_, i) => gray(i));
    const colCodes = Array.from({ length: 1 << c }, (_, i) => gray(i));

    const wrap = el('div', 'maps');

    for (let p = 0; p < panels; p++) {
      const block = el('div', 'map');

      if (extra) {
        const title = el('div', 'map-title');
        title.innerHTML = `${nameHTML(names[n - 1])} = ${p}`;
        block.append(title);
      }

      const table = el('table', 'kg');

      const thead = el('thead');
      const hr = el('tr');
      const corner = el('th', 'corner');
      corner.setAttribute('aria-label', `rows ${rowNames.join(' ')}, columns ${colNames.join(' ')}`);
      const cRow = el('span', 'c-row');
      cRow.innerHTML = rowNames.map(nameHTML).join(' ');
      const cCol = el('span', 'c-col');
      cCol.innerHTML = colNames.map(nameHTML).join(' ');
      corner.append(cRow, cCol);
      hr.append(corner);
      colCodes.forEach((cc) => {
        const h = el('th', 'col-h');
        h.textContent = bin(cc, c);
        hr.append(h);
      });
      thead.append(hr);
      table.append(thead);

      const tbody = el('tbody');
      rowCodes.forEach((rc) => {
        const tr = el('tr');
        const rh = el('th', 'row-h');
        rh.textContent = bin(rc, r);
        tr.append(rh);

        colCodes.forEach((cc) => {
          // Minterm index with the first variable as the most significant bit.
          const idx = (((rc << c) | cc) << extra) | p;
          const td = el('td');
          const btn = el('button', 'kcell');
          btn.type = 'button';
          btn.dataset.i = idx;
          btn.innerHTML = `<span class="mi">${idx}</span><span class="v"></span>`;
          td.append(btn);
          tr.append(td);
          kEls[idx] = btn;
        });

        tbody.append(tr);
      });
      table.append(tbody);

      block.append(table);
      wrap.append(block);
    }

    host.append(wrap);
  }

  // ---------- Stats (counts only, no analysis) ----------

  function updateStats() {
    let ones = 0, zeros = 0, dc = 0, unset = 0;
    outputs.forEach((col) => col.forEach((v) => {
      if (v === null) unset++;
      else if (v === 0) zeros++;
      else if (v === 1) ones++;
      else dc++;
    }));
    $('#stats').textContent =
      `Ones ${ones} · Zeros ${zeros} · X ${dc} · Unset ${unset}`;
  }

  // The K-map panel is shown only for a single output bit.
  function syncKmapVisibility() {
    const single = outputs.length === 1;
    $('.panel-km').hidden = !single;
    $('#km-note').hidden = single;
  }

  // ---------- Build / state changes ----------

  function rebuildAll() {
    buildVarInputs();
    buildTable();
    buildKmap();
    syncKmapVisibility();
    syncSegButtons();
    paintAll();
  }

  function setN(newN) {
    n = newN;
    outNames = fixOutNames(outNames, names.slice(0, n), outputs.length);
    outputs = newCols(outputs.length); // minterm meanings change, so start fresh
    rebuildAll();
  }

  // Changing the output width keeps existing bit columns; new ones start unset.
  function setW(newW) {
    const old = outputs;
    outputs = Array.from({ length: newW }, (_, b) => (old[b] ? old[b] : new Array(1 << n).fill(null)));
    outNames = fixOutNames(outNames, names.slice(0, n), newW);
    rebuildAll();
  }

  function clearOutputs() {
    outputs.forEach((col) => col.fill(null));
    paintAll();
  }

  // ---------- Local storage: saved tables ----------

  // Records hold output columns in `outCols`; older ones hold one column in `outputs`.
  function recordCols(r) {
    if (Array.isArray(r.outCols)) return r.outCols;
    if (Array.isArray(r.outputs)) return [r.outputs];
    return null;
  }

  function isValidRecord(r) {
    if (!r || typeof r !== 'object') return false;
    if (typeof r.name !== 'string' || !r.name.trim()) return false;
    if (typeof r.savedAt !== 'string') return false;
    if (!Number.isInteger(r.n) || r.n < 2 || r.n > 5) return false;
    const cols = recordCols(r);
    if (!cols || cols.length < 1 || cols.length > MAX_W) return false;
    return cols.every((col) => Array.isArray(col) && col.length === (1 << r.n)
      && col.every((v) => v === null || v === 0 || v === 1 || v === 'X'));
  }

  function readStore() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.filter(isValidRecord) : [];
    } catch (err) {
      return [];
    }
  }

  function writeStore(records) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(records));
      return true;
    } catch (err) {
      return false;
    }
  }

  function setStatus(msg) {
    $('#save-status').textContent = msg;
  }

  function loadRecord(rec) {
    n = rec.n;
    names = sanitizeNames(rec.names);
    const cols = recordCols(rec).map((col) => col.slice());
    outputs = cols;
    outNames = fixOutNames(
      Array.isArray(rec.outNames) ? rec.outNames : [rec.outName],
      names.slice(0, n),
      cols.length,
    );
    rebuildAll();
    $('#save-name').value = rec.name;
  }

  function renderSaved() {
    const list = $('#saved-list');
    const records = readStore().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    list.innerHTML = '';
    $('#saved-empty').hidden = records.length > 0;

    records.forEach((rec) => {
      const li = el('li', 'saved-item');
      li.dataset.name = rec.name;

      const info = el('div', 'info');
      const title = el('strong');
      title.textContent = rec.name;
      const meta = el('small');
      const cols = recordCols(rec);
      const rows = 1 << rec.n;
      const filled = cols.reduce((s, col) => s + col.filter((v) => v !== null).length, 0);
      const vars = sanitizeNames(rec.names).slice(0, rec.n).join(', ');
      const outs = cols.length > 1 ? `${cols.length} outputs` : '1 output';
      meta.textContent =
        `${rec.n} variables (${vars}) · ${outs} · ${filled}/${rows * cols.length} set · ` +
        new Date(rec.savedAt).toLocaleString();
      info.append(title, meta);

      const actions = el('div', 'actions');
      const loadBtn = el('button');
      loadBtn.type = 'button';
      loadBtn.dataset.action = 'load';
      loadBtn.textContent = 'Load';
      const delBtn = el('button');
      delBtn.type = 'button';
      delBtn.dataset.action = 'delete';
      delBtn.textContent = 'Delete';
      actions.append(loadBtn, delBtn);

      li.append(info, actions);
      list.append(li);
    });
  }

  // ---------- Export: canvas image of truth table + K-map ----------

  const MONO = 'ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';
  const EX = {
    pad: 24, gap: 32, halfGap: 16,
    hdr: 44, row: 36, idxW: 48, varW: 48, outW: 52,          // truth table
    rhW: 72, corner: 40, cellW: 48, cellH: 48, mapGap: 24, titleH: 24, // K-map
  };

  function exFont(ctx, size, weight = 700) {
    ctx.font = `${weight} ${size}px ${MONO}`;
  }

  // "A_1" -> ["A", "1"] so the subscript can be drawn smaller, as nameHTML does on screen.
  function splitName(name) {
    const m = /^([A-Za-z])_([0-9]+)$/.exec(name);
    return m ? [m[1], m[2]] : [name, ''];
  }

  function nameWidth(ctx, name, size) {
    const [base, sub] = splitName(name);
    exFont(ctx, size);
    let w = ctx.measureText(base).width;
    if (sub) {
      exFont(ctx, size * 0.7);
      w += ctx.measureText(sub).width;
    }
    return w;
  }

  // Draws one name left-aligned at x, centred on cy. Returns the width used.
  function drawName(ctx, name, x, cy, size) {
    const [base, sub] = splitName(name);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    exFont(ctx, size);
    ctx.fillText(base, x, cy);
    let w = ctx.measureText(base).width;
    if (sub) {
      exFont(ctx, size * 0.7);
      ctx.fillText(sub, x + w, cy + size * 0.3);
      w += ctx.measureText(sub).width;
    }
    return w;
  }

  function listWidth(ctx, list, size) {
    return list.reduce((s, nm) => s + nameWidth(ctx, nm, size), 0)
      + Math.max(0, list.length - 1) * size * 0.5;
  }

  function drawList(ctx, list, x, cy, size) {
    let cx = x;
    list.forEach((nm, k) => {
      if (k) cx += size * 0.5;
      cx += drawName(ctx, nm, cx, cy, size);
    });
  }

  function drawCentered(ctx, text, cx, cy, size, weight = 700) {
    exFont(ctx, size, weight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  function drawHatch(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -h; k < w; k += 6) {
      ctx.moveTo(x + k, y + h);
      ctx.lineTo(x + k + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Cell look matches the screen: 1 = black, X = hatched with a white plate, 0/blank = white.
  function drawState(ctx, v, x, y, w, h, size) {
    ctx.fillStyle = v === 1 ? '#000' : '#fff';
    ctx.fillRect(x, y, w, h);
    if (v === null) return;
    if (v === 'X') drawHatch(ctx, x, y, w, h);

    const cx = x + w / 2;
    const cy = y + h / 2;
    if (v === 'X') {
      exFont(ctx, size);
      const tw = ctx.measureText('X').width + 12;
      const th = size * 1.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - tw / 2 + 0.5, cy - th / 2 + 0.5, tw - 1, th - 1);
      ctx.fillStyle = '#000';
    } else {
      ctx.fillStyle = v === 1 ? '#fff' : '#000';
    }
    drawCentered(ctx, String(v), cx, cy, size);
  }

  // One truth-table block: m | variables | outputs, rows from..from+count-1.
  function drawTruthTable(ctx, x, y, from, count) {
    const w = EX.idxW + n * EX.varW + outputs.length * EX.outW;
    const h = EX.hdr + count * EX.row;
    const varsX = x + EX.idxW;
    const outX = varsX + n * EX.varW;

    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);

    // Header: black "m" cell, variable names and output names (repeated on every block)
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, EX.idxW, EX.hdr);
    ctx.fillStyle = '#fff';
    drawCentered(ctx, 'm', x + EX.idxW / 2, y + EX.hdr / 2, 15);
    ctx.fillStyle = '#000';
    for (let j = 0; j < n; j++) {
      const cx = varsX + j * EX.varW + EX.varW / 2;
      const tw = nameWidth(ctx, names[j], 17);
      drawName(ctx, names[j], cx - tw / 2, y + EX.hdr / 2, 17);
    }
    for (let b = 0; b < outputs.length; b++) {
      const cx = outX + b * EX.outW + EX.outW / 2;
      const tw = nameWidth(ctx, outNames[b], 17);
      drawName(ctx, outNames[b], cx - tw / 2, y + EX.hdr / 2, 17);
    }

    // Body
    for (let i = 0; i < count; i++) {
      const m = from + i;
      const ry = y + EX.hdr + i * EX.row;
      const cy = ry + EX.row / 2;
      ctx.fillStyle = '#000';
      drawCentered(ctx, String(m), x + EX.idxW / 2, cy, 15);
      for (let j = 0; j < n; j++) {
        const bit = (m >> (n - 1 - j)) & 1;
        drawCentered(ctx, String(bit), varsX + j * EX.varW + EX.varW / 2, cy, 15, 400);
      }
      for (let b = 0; b < outputs.length; b++) {
        drawState(ctx, outputs[b][m], outX + b * EX.outW, ry, EX.outW, EX.row, 16);
      }
    }

    // Grid
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < count; i++) {
      const ly = y + EX.hdr + i * EX.row;
      ctx.moveTo(x, ly);
      ctx.lineTo(x + w, ly);
    }
    for (let j = 1; j < n; j++) {
      const vx = varsX + j * EX.varW;
      ctx.moveTo(vx, y);
      ctx.lineTo(vx, y + h);
    }
    for (let b = 1; b < outputs.length; b++) {
      const ox = outX + b * EX.outW;
      ctx.moveTo(ox, y);
      ctx.lineTo(ox, y + h);
    }
    ctx.stroke();

    // Heavier rules: under the header, and beside the minterm and first output columns
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + EX.hdr);
    ctx.lineTo(x + w, y + EX.hdr);
    ctx.moveTo(varsX, y);
    ctx.lineTo(varsX, y + h);
    ctx.moveTo(outX, y);
    ctx.lineTo(outX, y + h);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // K-map for the current variable count, one panel per value of any fifth variable.
  function drawKmap(ctx, x, y) {
    const { r, c } = layoutFor(n);
    const extra = n - r - c;
    const panels = 1 << extra;
    const rowNames = names.slice(0, r);
    const colNames = names.slice(r, r + c);
    const mapW = EX.rhW + (1 << c) * EX.cellW;
    const titleH = extra ? EX.titleH : 0;
    const bodyH = EX.corner + (1 << r) * EX.cellH;

    for (let p = 0; p < panels; p++) {
      const mx = x + p * (mapW + EX.mapGap);
      const ty = y + titleH;      // top of the grid
      const gy = ty + EX.corner;  // top of the body rows
      const gx = mx + EX.rhW;     // left edge of the first column
      const gxEnd = gx + (1 << c) * EX.cellW;

      ctx.fillStyle = '#fff';
      ctx.fillRect(mx, y, mapW, titleH + bodyH);

      if (extra) {
        const label = ` = ${p}`;
        exFont(ctx, 12);
        const lw = ctx.measureText(label).width;
        const tw = nameWidth(ctx, names[n - 1], 12) + lw;
        const sx = mx + mapW / 2 - tw / 2;
        const cy = y + titleH / 2;
        ctx.fillStyle = '#000';
        drawName(ctx, names[n - 1], sx, cy, 12);
        exFont(ctx, 12);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx + tw - lw, cy);
      }

      // Corner: diagonal split, row variables bottom-left, column variables top-right
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, ty);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      drawList(ctx, rowNames, mx + 6, gy - 11, 13);
      drawList(ctx, colNames, gx - 6 - listWidth(ctx, colNames, 13), ty + 11, 13);

      // Column headers (Gray code order)
      ctx.fillStyle = '#000';
      for (let k = 0; k < (1 << c); k++) {
        drawCentered(ctx, bin(gray(k), c), gx + k * EX.cellW + EX.cellW / 2, ty + EX.corner / 2, 13);
      }

      // Row headers and cells
      for (let k = 0; k < (1 << r); k++) {
        const rc = gray(k);
        const ry = gy + k * EX.cellH;
        ctx.fillStyle = '#000';
        drawCentered(ctx, bin(rc, r), mx + EX.rhW / 2, ry + EX.cellH / 2, 13);
        for (let m = 0; m < (1 << c); m++) {
          const cc = gray(m);
          const idx = (((rc << c) | cc) << extra) | p; // same mapping as buildKmap
          const cx = gx + m * EX.cellW;
          drawState(ctx, outputs[0][idx], cx, ry, EX.cellW, EX.cellH, 22);
          exFont(ctx, 9, 400);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = outputs[0][idx] === 1 ? '#fff' : '#000';
          ctx.fillText(String(idx), cx + 3, ry + 2);
        }
      }

      // Grid
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= (1 << r); k++) {
        const ly = gy + k * EX.cellH;
        ctx.moveTo(mx, ly);
        ctx.lineTo(gxEnd, ly);
      }
      ctx.moveTo(mx, ty);
      ctx.lineTo(gxEnd, ty);
      for (let m = 0; m <= (1 << c); m++) {
        const lx = gx + m * EX.cellW;
        ctx.moveTo(lx, ty);
        ctx.lineTo(lx, gy + (1 << r) * EX.cellH);
      }
      ctx.moveTo(mx, ty);
      ctx.lineTo(mx, gy + (1 << r) * EX.cellH);
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.strokeRect(mx + 1.5, ty + 1.5, mapW - 3, bodyH - 3);
    }
  }

  // Draws the whole export into the canvas. Four or more variables split the truth table
  // into two side-by-side halves, each with the variable header. The K-map is left out
  // when there is more than one output bit.
  function renderExport(canvas) {
    const ctx = canvas.getContext('2d');
    const S = Math.max(2, window.devicePixelRatio || 1);
    const halves = n >= 4;
    const rowsPerBlock = halves ? 1 << (n - 1) : 1 << n;
    const blockW = EX.idxW + n * EX.varW + outputs.length * EX.outW;
    const ttW = halves ? blockW * 2 + EX.halfGap : blockW;
    const ttH = EX.hdr + rowsPerBlock * EX.row;

    const showKmap = outputs.length === 1;
    const { r, c } = layoutFor(n);
    const extra = n - r - c;
    const panels = 1 << extra;
    const mapW = EX.rhW + (1 << c) * EX.cellW;
    const kW = showKmap ? panels * mapW + (panels - 1) * EX.mapGap : 0;
    const kH = showKmap ? (extra ? EX.titleH : 0) + EX.corner + (1 << r) * EX.cellH : 0;

    const W = EX.pad * 2 + ttW + (showKmap ? EX.gap + kW : 0);
    const totalH = EX.pad * 2 + Math.max(ttH, kH);

    canvas.width = Math.round(W * S);
    canvas.height = Math.round(totalH * S);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${totalH}px`;
    ctx.setTransform(S, 0, 0, S, 0, 0);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, totalH);

    drawTruthTable(ctx, EX.pad, EX.pad, 0, rowsPerBlock);
    if (halves) {
      drawTruthTable(ctx, EX.pad + blockW + EX.halfGap, EX.pad, rowsPerBlock, rowsPerBlock);
    }
    if (showKmap) drawKmap(ctx, EX.pad + ttW + EX.gap, EX.pad);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, totalH - 2);
  }

  function downloadExport() {
    $('#export-canvas').toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = `boolwiz-${n}var.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  // ---------- Events ----------

  document.querySelectorAll('.seg[data-n]').forEach((b) => {
    b.addEventListener('click', () => {
      if (Number(b.dataset.n) !== n) setN(Number(b.dataset.n));
    });
  });

  document.querySelectorAll('.seg[data-w]').forEach((b) => {
    b.addEventListener('click', () => {
      if (Number(b.dataset.w) !== outputs.length) setW(Number(b.dataset.w));
    });
  });

  $('#clear').addEventListener('click', clearOutputs);

  $('#reset').addEventListener('click', () => {
    names = [...DEFAULT_NAMES];
    n = DEFAULT_N;
    outNames = [DEFAULT_OUT];
    outputs = newCols(1);
    rebuildAll();
  });

  // Variable and output names: accept valid edits live, flag invalid ones, revert on blur.
  $('#var-names').addEventListener('input', (e) => {
    const input = e.target.closest('input.vname');
    if (!input) return;
    const value = input.value;
    if (input.dataset.b !== undefined) {
      const b = Number(input.dataset.b);
      if (isValidOutName(value, b)) {
        input.classList.remove('bad');
        outNames[b] = value;
        refreshHeaders();
        paintAll();
      } else {
        input.classList.add('bad');
      }
      return;
    }
    const j = Number(input.dataset.j);
    if (isValidName(value, j)) {
      input.classList.remove('bad');
      names[j] = value;
      refreshHeaders();
      buildKmap();
      paintAll();
    } else {
      input.classList.add('bad');
    }
  });

  $('#var-names').addEventListener('focusout', (e) => {
    const input = e.target.closest('input.vname');
    if (!input) return;
    input.classList.remove('bad');
    input.value = input.dataset.b !== undefined
      ? outNames[Number(input.dataset.b)]
      : names[Number(input.dataset.j)];
  });

  $('#tt').addEventListener('click', (e) => {
    const btn = e.target.closest('button.out');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const b = Number(btn.dataset.b);
    setOutput(i, nextValue(outputs[b][i]), b);
  });

  $('#tt').addEventListener('keydown', (e) => {
    const btn = e.target.closest('button.out');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const b = Number(btn.dataset.b);
    const k = e.key;

    if (k === '0' || k === '1') {
      setOutput(i, Number(k), b);
    } else if (k === 'x' || k === 'X') {
      setOutput(i, 'X', b);
    } else if (k === 'Backspace' || k === 'Delete') {
      setOutput(i, null, b);
    } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      // Up/Down move down the column; Left/Right move to the same row in a neighbouring bit.
      const dRow = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
      const dCol = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
      const col = ttEls[b + dCol];
      const target = col ? col[i + dRow] : undefined;
      if (!target) return;
      e.preventDefault();
      target.focus();
      return;
    } else {
      return;
    }
    e.preventDefault();
  });

  $('#kmap').addEventListener('click', (e) => {
    const btn = e.target.closest('button.kcell');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    setOutput(i, nextValue(outputs[0][i]), 0);
  });

  $('#export').addEventListener('click', () => {
    renderExport($('#export-canvas'));
    $('#export-dlg').showModal();
  });
  $('#export-close').addEventListener('click', () => $('#export-dlg').close());
  $('#export-download').addEventListener('click', downloadExport);

  $('#save-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = $('#save-name');
    const name = nameInput.value.trim();
    if (!name) {
      setStatus('Enter a name to save this table.');
      nameInput.focus();
      return;
    }

    const records = readStore();
    const rec = {
      name,
      savedAt: new Date().toISOString(),
      n,
      names: names.slice(),
      outNames: outNames.slice(),
      outCols: outputs.map((col) => col.slice()),
    };
    const existing = records.findIndex((r) => r.name === name);
    const verb = existing >= 0 ? 'Updated' : 'Saved';
    if (existing >= 0) records[existing] = rec;
    else records.push(rec);

    if (!writeStore(records)) {
      setStatus('Could not save: browser storage is unavailable or full.');
      return;
    }
    setStatus(`${verb} "${name}".`);
    renderSaved();
  });

  $('#saved-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const name = btn.closest('li').dataset.name;

    if (btn.dataset.action === 'load') {
      const rec = readStore().find((r) => r.name === name);
      if (!rec) {
        setStatus(`"${name}" was not found. It may have been removed.`);
        renderSaved();
        return;
      }
      loadRecord(rec);
      setStatus(`Loaded "${name}".`);
      return;
    }

    if (btn.dataset.action === 'delete') {
      // Two-step delete: first click arms the button, second click confirms.
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Confirm';
        setTimeout(() => {
          if (btn.isConnected) {
            delete btn.dataset.armed;
            btn.textContent = 'Delete';
          }
        }, 3000);
        return;
      }
      const ok = writeStore(readStore().filter((r) => r.name !== name));
      setStatus(ok ? `Deleted "${name}".` : 'Could not delete: browser storage is unavailable.');
      renderSaved();
    }
  });

  // ---------- Init ----------

  outputs = newCols(1);
  rebuildAll();
  renderSaved();
})();
