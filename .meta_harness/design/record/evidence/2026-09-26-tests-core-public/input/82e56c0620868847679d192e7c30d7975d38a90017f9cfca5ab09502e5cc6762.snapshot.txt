import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { SPEC_DIR } from './spec-fixtures.ts'

it('consumes built public exports and Schema without source aliases or runtime services', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { readFileSync } from 'node:fs';
    import { readJsonStrict, writeJsonLossless, judgeContentBlock, LosslessNumber, modalityOf, validate, isJsonNumber, jsonNumberSource, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks';
    const source = '{"id":"b","kind":"tool_call","visibility":{"toHuman":true,"toModel":true},"complete":true,"callId":"c","tool":"read_file","arguments":{"id":12345678901234567890}}';
    const read = readJsonStrict(source);
    if (!('ok' in read)) throw new Error('read');
    const judged = judgeContentBlock(read.ok);
    if (!('ok' in judged)) throw new Error('judge');
    if (writeJsonLossless(judged.ok) !== source) throw new Error('precision');
    if (!validate('AttachmentRef', {storage:'s',key:'k',mediaType:'application/pdf',bytes:new LosslessNumber('9007199254740993')}).valid) throw new Error('Schema number');
    if (modalityOf('video/mp4') !== 'video') throw new Error('modality');
    const decimal = readJsonStrict('0.1');
    if (!('ok' in decimal) || !isJsonNumber(decimal.ok) || jsonNumberSource(decimal.ok) !== '0.1' || writeJsonLossless(decimal.ok) !== '0.1' || isNonNegativeJsonInteger(decimal.ok)) throw new Error('number helpers');
    const schema = readFileSync(new URL(import.meta.resolve('@omne-harness-lite/content-blocks/schema')), 'utf8');
    process.stdout.write(schema);
  `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output).toBe(readFileSync(resolve(SPEC_DIR, 'content-blocks.schema.json'), 'utf8'))
})
