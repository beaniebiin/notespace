import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLASH_COMMANDS,
  filterSlashCommands,
} from '../../components/SlashCommandMenu';

describe('filterSlashCommands', () => {
  it('returns everything on empty query', () => {
    assert.strictEqual(filterSlashCommands('').length, SLASH_COMMANDS.length);
    assert.strictEqual(filterSlashCommands('   ').length, SLASH_COMMANDS.length);
  });

  it('matches titles, keywords and hints', () => {
    const ids = filterSlashCommands('tab').map((c) => c.id);
    assert.ok(ids.includes('tab'));
    const cite = filterSlashCommands('인용').map((c) => c.id);
    assert.ok(cite.includes('cite'));
  });

  it('returns nothing for unrelated input', () => {
    assert.deepStrictEqual(filterSlashCommands('zzz-no-such-command'), []);
  });
});
