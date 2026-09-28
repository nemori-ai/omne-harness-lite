import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFacts } from '../../../../tools/model-probe/src/network.mjs'
import { estimateReservation } from '../../../../tools/model-probe/src/budget.mjs'
import { decimalCost, prepare } from './fixtures/qwen/probe-six/run.mjs'

test('frozen six-case wire bytes match the source manifest identities', async () => {
  const root = new URL('./fixtures/qwen/probe-six/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
  assert.equal(manifest.cases.length, 6)
  assert.deepEqual(
    manifest.cases.map(item => item.file.slice(0, 2)),
    ['08', '09', '10', '11', '38', '39'],
  )
  for (const item of manifest.cases) {
    const wire = await readFile(new URL(item.file, root))
    assert.equal(createHash('sha256').update(wire).digest('hex'), item.sha256)
    const body = JSON.parse(wire)
    assert.equal(body.model, item.model)
    assert.deepEqual(body.provider, {
      order: ['alibaba'],
      allow_fallbacks: false,
      require_parameters: true,
    })
    assert.equal(body.stream, false)
    assert.equal(body.max_tokens, 16)
  }
})

test('real network parseFacts retains scientific cost lexemes exactly', () => {
  for (const [raw, expected] of [
    ['1.234567890123456789e-7', '0.0000001234567890123456789'],
    ['6.25E+2', '625'],
    ['0.0000000000000000000000009', '0.0000000000000000000000009'],
  ]) {
    const parsed = parseFacts(`{"usage":{"cost":${raw},"prompt_tokens":17}}`)
    assert.equal(decimalCost(parsed.usage.cost), expected)
    assert.equal(parsed.usage.prompt_tokens, 17)
  }
  for (const source of [undefined, '-1e-7', 'NaN', '1e1001', ''])
    assert.equal(decimalCost(source), undefined)
})

test('reservation uses the full exact endpoint context and highest input rate', () => {
  assert.equal(
    estimateReservation(
      { prompt: '0.000002', input_cache_write: '0.0000025', completion: '0.000006' },
      1_000_000,
      16,
    ),
    '2.500096000000000000',
  )
})

test('a changed endpoint snapshot is rejected offline before any paid effect', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qwen-six-probe-'))
  try {
    const fake = join(directory, 'catalog.json')
    await writeFile(fake, '{"format":1,"cards":[]}\n')
    await assert.rejects(prepare(fake), /snapshot differs/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
