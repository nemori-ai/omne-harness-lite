import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('consumes the compiled protected subentry without an asset-model dependency', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks';
      import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime';
      const read = text => {
        const value = readJsonStrict(text);
        if ('failed' in value) throw new Error('test JSON');
        return value.ok;
      };
      const runtime = createSchemaRuntime([]);
      const source = '{"type":["integer","string"],"minimum":9007199254740993}';
      const schema = read(source);
      const validator = runtime.compile(schema);
      if (validator.validate(read('9007199254740992'))) throw new Error('rounded bound');
      if (validator.validate(read('1.00000000000000000001'))) throw new Error('rounded integer');
      if (!validator.validate(read('1e400')) || !validator.validate('x')) throw new Error('union');
      if (writeJsonLossless(schema) !== source) throw new Error('mutated Schema');
      try { import.meta.resolve('@omne-harness-lite/asset-model'); throw new Error('CB depends on AM'); }
      catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
      process.stdout.write('protected CB dist consumer passed');
      `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output).toBe('protected CB dist consumer passed')
})
