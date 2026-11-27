# diff-speed

A faster drop-in for make.fun's reference diff (`makefun-diff 1.0.0`): the same
makefun-diff/1 patch, computed with a typed-array Myers search over interned
lines.

- `solve.js` — `run({ old, new })` returns the exact makefun-diff/1 patch string.
- `main.ts` — the harness driver: reads `/input/cases.json`, writes `/output/answers.json`.

Verified against the kit's practice set: all four cases byte-identical.
