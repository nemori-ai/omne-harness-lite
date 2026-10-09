import { assertContentSchemaTransition } from './schema-transition.ts'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { FIXTURE_DIR } from './spec-fixtures.ts'

it('consumes built public exports and Schema without source aliases or runtime services', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { readFileSync } from 'node:fs';
    import { readJsonStrict, copyJsonValue, writeJsonLossless, judgeContentBlock, LosslessNumber, modalityOf, validate, isJsonNumber, jsonNumberSource, isNonNegativeJsonInteger, toOpaqueJson } from '@omne-harness-lite/content-blocks';
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
    const original = { ordinary: 0.1, zero: -0, exact: new LosslessNumber('9007199254740993'), nested: [null, { value: true }], opaque: toOpaqueJson({ exact: new LosslessNumber('1e400') }) };
    const copied = copyJsonValue(original);
    if (!('ok' in copied) || copied.ok === original || copied.ok.ordinary !== 0.1 || !Object.is(copied.ok.zero, -0) || !LosslessNumber.is(copied.ok.exact)) throw new Error('snapshot number representations');
    if (!Object.isFrozen(copied.ok) || copied.ok.nested === original.nested || !Object.isFrozen(copied.ok.nested[1]) || Object.isFrozen(original.nested)) throw new Error('snapshot ownership');
    if (writeJsonLossless(copied.ok.opaque) !== '{"exact":1e400}') throw new Error('opaque exchange representation');
    original.nested[1].value = false;
    if (copied.ok.nested[1].value !== true || !Object.hasOwn(copied.ok.nested, '0') || copied.ok.nested[0] !== null || Object.hasOwn(copied.ok, 'absent')) throw new Error('snapshot original mutation or missing/null confusion');
    let invoked = 0;
    const accessor = { get value() { invoked++; return null; } };
    const custom = { toJSON() { invoked++; return null; } };
    const cyclic = {}; cyclic.self = cyclic;
    for (const input of [accessor, custom, cyclic, undefined]) if (copyJsonValue(input).failed !== 'not_json') throw new Error('non-JSON snapshot rejection');
    if (invoked !== 0) throw new Error('snapshot invoked caller code');
    const schema = readFileSync(new URL(import.meta.resolve('@omne-harness-lite/content-blocks/schema')), 'utf8');
    process.stdout.write(schema);
  `,
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' },
  )
  expect(output).toBe(
    readFileSync(resolve(import.meta.dirname, '../schema/content-blocks.schema.json'), 'utf8'),
  )
  assertContentSchemaTransition(
    Buffer.from(output),
    readFileSync(resolve(FIXTURE_DIR, 'content-before-admission.schema.json')),
  )
})
