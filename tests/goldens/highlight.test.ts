import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HIGHLIGHT_COLORS,
  TABLE_GRAY,
  ALPHA_LEVELS,
  LIGHTER_ALPHA,
  DARK_MARK_ALPHA,
  DARK_TABLE_ALPHA,
  colorByName,
  alphaFor,
  lighterAlphaFor,
  markRgba,
  surfaceRgba,
  varsForTheme,
  cssVar,
  cssVarFor,
  applyContrastLevel,
  normalizeColor,
  tablePalette,
  blockSwatches,
  tabPresets,
  buildMark,
  stripMarks,
  markEnabledFor,
} from '../../services/highlight';

describe('canonical palette (D2)', () => {
  it('keeps five mark colors plus table-only gray', () => {
    assert.deepStrictEqual(HIGHLIGHT_COLORS.map((e) => e.name), ['yellow', 'blue', 'green', 'red', 'purple']);
    assert.strictEqual(TABLE_GRAY.name, 'gray');
    assert.deepStrictEqual(tablePalette().map((e) => e.name), ['yellow', 'blue', 'green', 'red', 'purple', 'gray']);
  });

  it('pins A안 base RGB', () => {
    assert.deepStrictEqual(colorByName('yellow')?.rgb, [254, 243, 199]);
    assert.deepStrictEqual(colorByName('blue')?.rgb, [220, 235, 255]);
    assert.deepStrictEqual(colorByName('green')?.rgb, [215, 243, 225]);
    assert.deepStrictEqual(colorByName('red')?.rgb, [255, 232, 241]);
    assert.deepStrictEqual(colorByName('purple')?.rgb, [242, 222, 251]);
  });

  it('exposes block and tab surfaces without leaking gray', () => {
    assert.strictEqual(blockSwatches().length, 5);
    assert.ok(blockSwatches().every((s) => s.hex.startsWith('#')));
    assert.deepStrictEqual(tabPresets().map((p) => p.name), ['purple', 'blue', 'green', 'yellow', 'red']);
    assert.strictEqual(colorByName('nope'), null);
  });
});

describe('contrast levels', () => {
  it('pins the agreed alpha combos', () => {
    assert.deepStrictEqual(ALPHA_LEVELS.standard, { base: 0.5, purple: 0.65, red: 0.8 });
    assert.deepStrictEqual(ALPHA_LEVELS.high, { base: 0.8, purple: 0.88, red: 0.95 });
  });

  it('resolves per-color alpha with gray on base', () => {
    assert.strictEqual(alphaFor('yellow', 'standard'), 0.5);
    assert.strictEqual(alphaFor('purple', 'standard'), 0.65);
    assert.strictEqual(alphaFor('red', 'standard'), 0.8);
    assert.strictEqual(alphaFor('gray', 'standard'), 0.5);
    assert.strictEqual(alphaFor('yellow', 'high'), 0.8);
    assert.strictEqual(alphaFor('purple', 'high'), 0.88);
    assert.strictEqual(alphaFor('red', 'high'), 0.95);
  });

  it('builds level-aware rgba strings', () => {
    assert.strictEqual(markRgba('yellow', 'standard'), 'rgba(254, 243, 199, 0.5)');
    assert.strictEqual(markRgba('red', 'standard'), 'rgba(255, 232, 241, 0.8)');
    assert.strictEqual(markRgba('purple', 'high'), 'rgba(242, 222, 251, 0.88)');
    assert.strictEqual(cssVar('yellow'), 'var(--hl-yellow)');
  });

  it('applyContrastLevel is a safe no-op without DOM', () => {
    assert.doesNotThrow(() => applyContrastLevel('high'));
  });
});

describe('surface policy (chip-derived, alpha-only)', () => {
  it('pins the lighter-fixed alpha combo', () => {
    assert.deepStrictEqual(LIGHTER_ALPHA, { base: 0.25, purple: 0.3, red: 0.35 });
    assert.strictEqual(lighterAlphaFor('yellow'), 0.25);
    assert.strictEqual(lighterAlphaFor('purple'), 0.3);
    assert.strictEqual(lighterAlphaFor('red'), 0.35);
    assert.strictEqual(lighterAlphaFor('gray'), 0.25);
  });

  it('derives every surface from the same chip rgb', () => {
    assert.strictEqual(surfaceRgba('red', 'heading', 'high'), 'rgba(255, 232, 241, 0.8)');
    assert.strictEqual(surfaceRgba('red', 'table', 'high'), 'rgba(255, 232, 241, 0.35)');
    assert.strictEqual(surfaceRgba('red', 'quote', 'standard'), 'rgba(255, 232, 241, 0.35)');
    assert.strictEqual(surfaceRgba('red', 'body', 'high'), 'rgba(255, 232, 241, 0.95)');
    assert.strictEqual(surfaceRgba('purple', 'table', 'standard'), 'rgba(242, 222, 251, 0.3)');
    assert.strictEqual(cssVarFor('blue', 'body'), 'var(--hl-blue)');
    assert.strictEqual(cssVarFor('blue', 'heading'), 'var(--hl-h-blue)');
    assert.strictEqual(cssVarFor('blue', 'table'), 'var(--hl-t-blue)');
    assert.strictEqual(cssVarFor('blue', 'quote'), 'var(--hl-q-blue)');
  });

  it('writes theme-aware var sets with dark mark/table readability', () => {
    assert.strictEqual(DARK_MARK_ALPHA, 0.1);
    assert.strictEqual(DARK_TABLE_ALPHA, 0.75);
    const light = varsForTheme('high', false);
    assert.strictEqual(light['--hl-red'], 'rgba(255, 232, 241, 0.95)');
    assert.strictEqual(light['--hl-t-red'], 'rgba(255, 232, 241, 0.35)');
    const dark = varsForTheme('standard', true);
    assert.strictEqual(dark['--hl-yellow'], 'rgba(133, 100, 4, 0.1)');
    assert.strictEqual(dark['--hl-blue'], 'rgba(30, 58, 138, 0.1)');
    assert.strictEqual(dark['--hl-t-red'], 'rgba(153, 27, 27, 0.75)');
    assert.strictEqual(dark['--hl-h-purple'], '#261733');
    assert.strictEqual(dark['--hl-q-gray'], '#242c38');
    assert.strictEqual(Object.keys(dark).length, 24);
  });
});

describe('normalizeColor (legacy convergence incl. fixture variants)', () => {
  const cases: [string | null | undefined, string | null][] = [
    ['rgba(255, 252, 225, 0.8)', 'yellow'],
    ['rgba(254, 243, 199, 0.5)', 'yellow'],
    ['rgba(220, 235, 255, 0.5)', 'blue'],
    ['rgba(215, 243, 225, 0.5)', 'green'],
    ['rgba(255, 232, 241, 0.8)', 'red'],
    ['rgba(242, 222, 251, 0.65)', 'purple'],
    ['rgba(246, 246, 246, 0.8)', 'gray'],
    ['rgb(243, 244, 246)', 'gray'],
    ['#e8f3fa', 'blue'],
    ['#e6fcee', 'green'],
    ['#fef3c7', 'yellow'],
    ['yellow', 'yellow'],
    ['#fff6ff', 'purple'],
    ['#aabbcc', null],
    ['', null],
    [null, null],
    [undefined, null],
  ];
  for (const [input, want] of cases) {
    it(`maps ${JSON.stringify(input)} to ${JSON.stringify(want)}`, () => {
      assert.strictEqual(normalizeColor(input), want);
    });
  }
});

describe('mark builder / stripper / mode rule', () => {
  it('emits name-based marks with no inline style', () => {
    assert.strictEqual(buildMark('green', '민법 제390조'), '<mark data-color="green">민법 제390조</mark>');
  });


  it('strips marks but keeps text (Slice 1 ban enforcement)', () => {
    assert.strictEqual(stripMarks('a<mark data-color="green">b</mark>c'), 'abc');
  });

  it('forbids marks for 정리 only', () => {
    assert.strictEqual(markEnabledFor('정리'), false);
    assert.strictEqual(markEnabledFor('형광펜'), true);
    assert.strictEqual(markEnabledFor('자유'), true);
  });
});

describe('CSS owns rendering via variables', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../index.css'), 'utf8');
  it('defines light defaults and dark overrides for all six', () => {
    for (const name of ['yellow', 'blue', 'green', 'red', 'purple', 'gray']) {
      assert.match(css, new RegExp(`--hl-${name}:\\s*rgba\\(`));
    }
    assert.match(css, /\.dark\s*\{[^}]*--hl-yellow/);
  });

  it('renders marks and cells from vars', () => {
    assert.match(css, /mark\[data-color="yellow"\][^{]*\{[^}]*var\(--hl-yellow\)/);
    assert.match(css, /td\[data-bg="yellow"\]/);
  });

  it('routes heading/table/quote surfaces to their own var sets', () => {
    assert.match(css, /h1 mark\[data-color="yellow"\][^{]*\{[^}]*var\(--hl-h-yellow\)/);
    assert.match(css, /h1\.colored-bg-yellow[^{]*\{[^}]*var\(--hl-h-yellow\)/);
    assert.match(css, /td\[data-bg="yellow"\][^{]*\{[^}]*var\(--hl-t-yellow\)/);
    assert.match(css, /blockquote\.colored-bg-yellow[^{]*\{[^}]*var\(--hl-q-yellow\)/);
    assert.match(css, /--hl-h-yellow:\s*rgba\(/);
    assert.match(css, /--hl-t-yellow:\s*rgba\(/);
    assert.match(css, /--hl-q-yellow:\s*rgba\(/);
    assert.match(css, /\.dark\s*\{[^}]*--hl-h-yellow/);
    assert.match(css, /\.dark\s*\{[^}]*--hl-t-yellow/);
    assert.match(css, /\.dark\s*\{[^}]*--hl-q-yellow/);
  });

  it('keeps dark tables white-texted with faint mark washes', () => {
    assert.match(css, /--hl-yellow:\s*rgba\(133,\s*100,\s*4,\s*0\.1\)/);
    assert.match(css, /--hl-t-red:\s*rgba\(153,\s*27,\s*27,\s*0\.75\)/);
    assert.match(css, /td\[data-bg="blue"\][^{]*\{[^}]*color:\s*#ffffff/);
    assert.match(css, /td\[data-bg\]\s*\*[^{]*\{[^}]*color:\s*#ffffff/);
  });

  it('gives marks rounded geometry with decoration-break', () => {
    assert.match(css, /box-decoration-break: clone;/);
    assert.match(css, /border-radius: 3px;/);
  });
});
