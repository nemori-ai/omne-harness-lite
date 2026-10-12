import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('XF7-DIST loads built public exports and both rejection rules in plain Node', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import * as format from '@omne-harness-lite/xml-format';
    assert.ok(import.meta.resolve('@omne-harness-lite/xml-format').endsWith('/dist/index.js'));
    const schema = {tag:'root',requiredFields:{x:{presentation:'attr'}}};
    assert.equal(format.formatXml({x:'😀'},schema), '<root x="😀"/>');
    assert.throws(()=>format.escapeXmlContent(String.fromCharCode(0)),TypeError);
    assert.throws(()=>format.formatXml({x:'one'},schema,{manualAttributes:{x:'two'}}),TypeError);
    assert.deepEqual(Object.keys(format).sort(), ['DEFAULT_INDENT_SIZE', 'MAX_INDENT_SIZE', 'applyFieldOverride', 'escapeXmlAttribute', 'escapeXmlContent', 'formatXml', 'isXmlFormattable', 'isXmlName', 'resolveFormattingOptions'].sort());
    process.stdout.write('XF7-DIST passed');
  `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output).toBe('XF7-DIST passed')
})
