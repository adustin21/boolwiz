// BoolWiz — truth table + Karnaugh map visualizer (vanilla JS, no dependencies).
// Output values per minterm: null (unset) | 0 | 1 | 'X' (don't care).

(function () {
  'use strict';

  const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E'];
  const DEFAULT_N = 3;
  const STORE_KEY = 'boolwiz.tables.v1';
  const NAME_RE = /^[A-Za-z](?:_[0-9]{1,2})?$/; // A, B, ..., A_1, A_2, ..., A_99
  const NAME_MAX = 4;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let n = DEFAULT_N;
  let names = [...DEFAULT_NAMES];  // variable names (validated)
  let outputs = [];                // length 2^n
  const ttEls = [];                // truth-table output buttons, indexed by minterm
  const kEls = [];                 // K-map cell buttons, indexed by minterm
  const varHeads = [];             // truth-table header cells for the variables

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

  function paintCell(btn, i) {
    const v = outputs[i];
    btn.classList.remove('st-blank', 'st-0', 'st-1', 'st-x');
    btn.classList.add(stateClass(v));
    btn.querySelector('.v').textContent = v === null ? '' : String(v);
    btn.setAttribute('aria-label', `minterm ${i}, output ${v === null ? 'unset' : v}`);
  }

  function setOutput(i, v) {
    outputs[i] = v;
    paintCell(ttEls[i], i);
    paintCell(kEls[i], i);
    updateStats();
  }

  function paintAll() {
    outputs.forEach((_, i) => {
      paintCell(ttEls[i], i);
      paintCell(kEls[i], i);
    });
    updateStats();
  }

  // ---------- Variable names ----------

  function uniqueIgnoreCase(list) {
    const seen = new Set();
    for (const s of list) {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }

  // Valid pattern and unique among the active variables (case-insensitive).
  function isValidName(name, index) {
    if (!NAME_RE.test(name)) return false;
    const others = names.slice(0, n).filter((_, j) => j !== index);
    return uniqueIgnoreCase([...others, name]);
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
    document.querySelectorAll('.seg').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n));
    });
  }

  function buildVarInputs() {
    const host = $('#var-names');
    host.innerHTML = '';
    for (let j = 0; j < n; j++) {
      const field = el('label', 'var-field');
      const cap = el('span', 'var-cap');
      cap.textContent = `Variable ${j + 1}`;
      const input = el('input', 'vname');
      input.type = 'text';
      input.maxLength = NAME_MAX;
      input.value = names[j];
      input.dataset.j = j;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-describedby', 'var-hint');
      field.append(cap, input);
      host.append(field);
    }
  }

  // ---------- Truth table ----------

  function buildTable() {
    const table = $('#tt');
    table.innerHTML = '';
    ttEls.length = 0;
    varHeads.length = 0;

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

    const thOut = el('th', 'out-h');
    thOut.textContent = 'F';
    hr.append(thOut);
    thead.append(hr);

    const tbody = el('tbody');
    for (let i = 0; i < outputs.length; i++) {
      const tr = el('tr');

      const idx = el('td', 'idx');
      idx.textContent = i;
      tr.append(idx);

      for (let j = 0; j < n; j++) {
        const td = el('td', 'bit');
        td.textContent = (i >> (n - 1 - j)) & 1;
        tr.append(td);
      }

      const outTd = el('td', 'out-td');
      const btn = el('button', 'out');
      btn.type = 'button';
      btn.dataset.i = i;
      btn.innerHTML = '<span class="v"></span>';
      outTd.append(btn);
      tr.append(outTd);

      ttEls[i] = btn;
      tbody.append(tr);
    }

    table.append(thead, tbody);
  }

  function refreshHeaders() {
    for (let j = 0; j < n; j++) {
      varHeads[j].innerHTML = nameHTML(names[j]);
    }
  }

  // ---------- K-map ----------

  function buildKmap() {
    const host = $('#kmap');
    host.innerHTML = '';
    kEls.length = 0;

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
    outputs.forEach((v) => {
      if (v === null) unset++;
      else if (v === 0) zeros++;
      else if (v === 1) ones++;
      else dc++;
    });
    $('#stats').textContent =
      `Ones ${ones} · Zeros ${zeros} · X ${dc} · Unset ${unset}`;
  }

  // ---------- Build / state changes ----------

  function rebuildAll() {
    buildVarInputs();
    buildTable();
    buildKmap();
    syncSegButtons();
    paintAll();
  }

  function setN(newN) {
    n = newN;
    outputs = new Array(1 << n).fill(null); // minterm meanings change, so start fresh
    rebuildAll();
  }

  function clearOutputs() {
    outputs.fill(null);
    paintAll();
  }

  // ---------- Local storage: saved tables ----------

  function isValidRecord(r) {
    if (!r || typeof r !== 'object') return false;
    if (typeof r.name !== 'string' || !r.name.trim()) return false;
    if (typeof r.savedAt !== 'string') return false;
    if (!Number.isInteger(r.n) || r.n < 2 || r.n > 5) return false;
    if (!Array.isArray(r.outputs) || r.outputs.length !== (1 << r.n)) return false;
    return r.outputs.every((v) => v === null || v === 0 || v === 1 || v === 'X');
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
    outputs = rec.outputs.slice();
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
      const rows = 1 << rec.n;
      const filled = rec.outputs.filter((v) => v !== null).length;
      const vars = sanitizeNames(rec.names).slice(0, rec.n).join(', ');
      meta.textContent =
        `${rec.n} variables (${vars}) · ${filled}/${rows} set · ` +
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

  // ---------- Events ----------

  document.querySelectorAll('.seg').forEach((b) => {
    b.addEventListener('click', () => {
      if (Number(b.dataset.n) !== n) setN(Number(b.dataset.n));
    });
  });

  $('#clear').addEventListener('click', clearOutputs);

  $('#reset').addEventListener('click', () => {
    names = [...DEFAULT_NAMES];
    n = DEFAULT_N;
    outputs = new Array(1 << n).fill(null);
    rebuildAll();
  });

  // Variable names: accept valid edits live, flag invalid ones, revert on blur.
  $('#var-names').addEventListener('input', (e) => {
    const input = e.target.closest('input.vname');
    if (!input) return;
    const j = Number(input.dataset.j);
    const value = input.value;
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
    input.value = names[Number(input.dataset.j)];
  });

  $('#tt').addEventListener('click', (e) => {
    const btn = e.target.closest('button.out');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    setOutput(i, nextValue(outputs[i]));
  });

  $('#tt').addEventListener('keydown', (e) => {
    const btn = e.target.closest('button.out');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    const k = e.key;

    if (k === '0' || k === '1') {
      setOutput(i, Number(k));
    } else if (k === 'x' || k === 'X') {
      setOutput(i, 'X');
    } else if (k === 'Backspace' || k === 'Delete') {
      setOutput(i, null);
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const j = i + (k === 'ArrowUp' ? -1 : 1);
      if (ttEls[j]) {
        e.preventDefault();
        ttEls[j].focus();
      }
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
    setOutput(i, nextValue(outputs[i]));
  });

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
      outputs: outputs.slice(),
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

  outputs = new Array(1 << n).fill(null);
  rebuildAll();
  renderSaved();
})();
