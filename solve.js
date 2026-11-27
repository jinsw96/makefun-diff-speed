// solve.js — a faster drop-in for makefun-diff 1.0.0's diffPatch.
// run(input) returns the makefun-diff/1 patch of { old, new } as one string.
//
//   makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I
//   @ os ol ns nl            (os = 1 + old lines before the hunk)
//   =|+|- line               (each line keeps its own newline)
// A line that ends its text with no newline is written with one, then a line "%".

const HEAD = 'makefun-diff/1 old=';

function splitLines(text) {
  const out = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl < 0) {
      if (start < text.length) out.push(text.slice(start));
      return out;
    }
    out.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
}

// Greedy Myers on the diagonals of the edit graph (oldPos per diagonal), keeping
// the path that reaches furthest into the old text; a deletion wins when the two
// moves reach the same point; the first path to both ends is the script.
// Returns D and one row of oldPos values per edit length (for the back-track).
function myers(a, b, n, m) {
  const max = n + m;
  const off = max + 2;
  const V = new Int32Array(2 * max + 5).fill(-2);
  const rows = [];

  // edit length 0: the common prefix
  let x = -1, y = -1;
  while (x + 1 < n && y + 1 < m && a[x + 1] === b[y + 1]) { x++; y++; }
  V[off] = x;
  rows.push(V.slice(off, off + 1));
  if (x + 1 >= n && y + 1 >= m) return { D: 0, rows };

  for (let d = 1; d <= max; d++) {
    let done = false;
    const lo = -d, hi = d;
    for (let k = lo; k <= hi; k += 2) {
      const i = off + k;
      const x1 = V[i - 1], x2 = V[i + 1];
      const addNewPos = x2 - k;
      const canAdd = x2 !== -2 && addNewPos >= 0 && addNewPos < m;
      const canRemove = x1 !== -2 && x1 + 1 < n;
      if (!canAdd && !canRemove) { V[i] = -2; continue; }
      // deletion wins when oldPos+1 >= oldPos of the insertion path
      const pickAdd = !canRemove || (canAdd && x1 + 1 < x2);
      x = pickAdd ? x2 : x1 + 1;
      y = x - k;
      while (x + 1 < n && y + 1 < m && a[x + 1] === b[y + 1]) { x++; y++; }
      V[i] = x;
      if (x + 1 >= n && y + 1 >= m) { done = true; break; }
    }
    rows.push(V.slice(off - d, off + d + 1));
    if (done) return { D: d, rows };
  }
  return { D: -1, rows };
}

function buildOps(a, b, n, m, D, rows) {
  const rev = [];
  let x = n - 1, y = m - 1;
  for (let d = D; d > 0; d--) {
    const base = d - 1;
    const row = rows[d - 1];
    const k = x - y;
    const get = (kk) => (kk < -base || kk > base) ? -2 : row[kk + base];
    const x1 = get(k - 1), x2 = get(k + 1);
    const addNewPos = x2 - k;
    const canAdd = x2 !== -2 && addNewPos >= 0 && addNewPos < m;
    const canRemove = x1 !== -2 && x1 + 1 < n;
    const pickAdd = !canRemove || (canAdd && x1 + 1 < x2);
    const px = pickAdd ? x2 : x1 + 1;
    const py = px - k;
    while (x > px && y > py) { rev.push(0, x, y); x--; y--; }
    if (pickAdd) { rev.push(1, -1, y); y--; }
    else { rev.push(-1, x, -1); x--; }
  }
  while (x >= 0 && y >= 0) { rev.push(0, x, y); x--; y--; }
  const ops = new Int32Array(rev.length);
  for (let i = 0, j = rev.length - 3; j >= 0; i += 3, j -= 3) {
    ops[i] = rev[j]; ops[i + 1] = rev[j + 1]; ops[i + 2] = rev[j + 2];
  }
  return ops;
}

export function run(input) {
  const oldText = input.old, newText = input.new;
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length, m = b.length;

  if (oldText === newText) return HEAD + n + ' new=' + m + ' hunks=0 deleted=0 inserted=0';

  // intern the lines so the search compares ints
  const ids = new Map();
  let next = 0;
  const ai = new Int32Array(n), bi = new Int32Array(m);
  for (let i = 0; i < n; i++) {
    const s = a[i];
    let id = ids.get(s);
    if (id === undefined) { id = next++; ids.set(s, id); }
    ai[i] = id;
  }
  for (let j = 0; j < m; j++) {
    const s = b[j];
    let id = ids.get(s);
    if (id === undefined) { id = next++; ids.set(s, id); }
    bi[j] = id;
  }

  const { D, rows } = myers(ai, bi, n, m);
  const ops = buildOps(ai, bi, n, m, D, rows);
  const tot = ops.length / 3;

  const oldCum = new Int32Array(tot + 1), newCum = new Int32Array(tot + 1);
  let del = 0, ins = 0;
  for (let p = 0; p < tot; p++) {
    const t = ops[3 * p];
    oldCum[p + 1] = oldCum[p] + (t <= 0 ? 1 : 0);
    newCum[p + 1] = newCum[p] + (t >= 0 ? 1 : 0);
    if (t < 0) del++; else if (t > 0) ins++;
  }

  const gS = [], gE = [];
  for (let p = 0; p < tot;) {
    if (ops[3 * p] === 0) { p++; continue; }
    const st = p;
    while (p < tot && ops[3 * p] !== 0) p++;
    if (gS.length && st - gE[gE.length - 1] <= 6) gE[gE.length - 1] = p;
    else { gS.push(st); gE.push(p); }
  }

  const parts = [HEAD + n + ' new=' + m + ' hunks=' + gS.length + ' deleted=' + del + ' inserted=' + ins + '\n'];
  const lineOut = (ch, line) => parts.push(line.charCodeAt(line.length - 1) === 10 ? ch + line : ch + line + '\n%\n');
  for (let g = 0; g < gS.length; g++) {
    const hs = Math.max(0, gS[g] - 3), he = Math.min(tot, gE[g] + 3);
    parts.push('@ ' + (oldCum[hs] + 1) + ' ' + (oldCum[he] - oldCum[hs]) + ' ' + (newCum[hs] + 1) + ' ' + (newCum[he] - newCum[hs]) + '\n');
    let q = hs;
    while (q < he) {
      const t = ops[3 * q];
      if (t === 0) { lineOut('=', a[ops[3 * q + 1]]); q++; continue; }
      const st = q;
      while (q < he && ops[3 * q] !== 0) q++;
      // a run of changes lists its deletions before its insertions
      for (let r = st; r < q; r++) if (ops[3 * r] < 0) lineOut('-', a[ops[3 * r + 1]]);
      for (let r = st; r < q; r++) if (ops[3 * r] > 0) lineOut('+', b[ops[3 * r + 2]]);
    }
  }
  return parts.join('');
}
