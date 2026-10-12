import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('UF6-DIST loads built public exports in Node without source aliases or runtime services', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import * as format from '@omne-harness-lite/unix-format';
    assert.ok(import.meta.resolve('@omne-harness-lite/unix-format').endsWith('/dist/index.js'));
    assert.equal(format.formatNumberedLines(['😀a'], {start:-1,perLineCharLimit:1}), '    -1 | 😀 [truncated]');
    assert.equal(format.formatError('bad',{hint:''}), 'ERROR: bad\\nHINT: ');
    assert.deepEqual(Object.keys(format).sort(), ['DEFAULT_UNIX_FORMAT_OPTIONS', 'formatBulletList', 'formatCommandList', 'formatError', 'formatHold', 'formatKeyValue', 'formatNumberedLines', 'formatSection', 'formatSuccess', 'formatTable', 'formatUsage', 'resolveUnixFormatOptions'].sort());
    process.stdout.write('UF6-DIST passed');
  `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output).toBe('UF6-DIST passed')
})
