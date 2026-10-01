import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_PRESET_COLORS,
  isTabPresetColor,
  tabDotColor,
  tabPill,
} from '../../components/extensions/TabBlockUtils';

describe('tab color contract (Slice 3 palette shares this map)', () => {
  it('keeps five named presets', () => {
    assert.strictEqual(TAB_PRESET_COLORS.length, 5);
    assert.deepStrictEqual(
      TAB_PRESET_COLORS.map((p) => p.name),
      ['purple', 'blue', 'green', 'yellow', 'red']
    );
  });

  it('accepts presets and #rrggbb, rejects the rest', () => {
    assert.strictEqual(isTabPresetColor('purple'), true);
    assert.strictEqual(isTabPresetColor('#aabbcc'), false);
    assert.strictEqual(isTabPresetColor(null), false);
    assert.strictEqual(isTabPresetColor('redish'), false);
    assert.strictEqual(tabDotColor('purple'), '#a855f7');
    assert.strictEqual(tabDotColor('#aabbcc'), '#aabbcc');
    assert.strictEqual(tabDotColor('nope'), null);
    assert.strictEqual(tabDotColor(null), null);
  });

  it('renders preset pills as classes, custom colors as alpha inline styles', () => {
    assert.deepStrictEqual(tabPill('purple', true), { className: 'colored-bg-purple' });
    assert.deepStrictEqual(tabPill('#aabbcc', true), {
      className: '',
      style: { backgroundColor: '#aabbcc2E' },
    });
    assert.deepStrictEqual(tabPill('#aabbcc', false), {
      className: '',
      style: { backgroundColor: '#aabbcc14' },
    });
    assert.deepStrictEqual(tabPill(null, true), {
      className: 'bg-gray-100 dark:bg-gray-700',
    });
    assert.deepStrictEqual(tabPill(null, false), { className: '' });
  });
});
