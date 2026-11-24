import { appendFileSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import { callEvidence, openCommandLedger, type CommandLedger } from '../src/ledger.ts'

const fileOf = () =>
  join(realpathSync(mkdtempSync(join(tmpdir(), 'loop-extension-ledger-unit-'))), 'tenant.jsonl')

async function opened(file: string): Promise<CommandLedger> {
  const ledger = await openCommandLedger(file)
  if (ledger === 'unavailable') throw new Error('the ledger did not open')
  return ledger
}

const intent = (passage: string) => ({
  tenant: 'tenant-1',
  passage,
  implementation: { owner: 'loop-extension', name: 'probe', revision: 'v1', digest: 'asset/probe' },
  mode: 'fresh' as const,
  scope: 'scope-1',
})
const process = { id: 'process-1', generation: 'g1' }
const resource = { kind: 'process', ref: 'process-1' } as unknown as ManagedResource
const end = { outcome: 'exit:0', stop: 'none' as const, stderrBytes: 12 }

async function recorded(ledger: CommandLedger, passage: string) {
  const record = await ledger.intend(intent(passage))
  if (record === 'unavailable') throw new Error('the intent was not written')
  return record
}

describe('the ledger of one tenant', () => {
  it('keeps each step of a call, and gives the same record back after it is opened again', async () => {
    const file = fileOf()
    const ledger = await opened(file)
    const call = await recorded(ledger, 'pass-1')
    expect(call).toEqual({
      ...intent('pass-1'),
      key: 'pass-1#1',
      ordinal: 1,
      state: 'intended',
      process: null,
      resources: [],
      end: null,
    })
    expect(await ledger.mark(call.key, { at: 'started', process })).toBe('recorded')
    expect(await ledger.mark(call.key, { at: 'resource', resource })).toBe('recorded')
    const running = { ...call, state: 'started', process, resources: [resource] }
    expect(ledger.get(call.key)).toEqual(running)
    expect(ledger.unfinished()).toEqual([running])
    expect(await ledger.mark(call.key, { at: 'ended', end })).toBe('recorded')
    const ended = { ...running, state: 'ended', end }
    expect(ledger.get(call.key)).toEqual(ended)
    expect(ledger.unfinished()).toEqual([])
    await ledger.close()
    const again = await opened(file)
    expect(again.get(call.key)).toEqual(ended)
    expect(again.unfinished()).toEqual([])
    await again.close()
  })

  it('numbers the runs of a passage, each passage on its own', async () => {
    const ledger = await opened(fileOf())
    const keys = []
    for (const passage of ['pass-1', 'pass-2', 'pass-1'])
      keys.push((await recorded(ledger, passage)).key)
    expect(keys).toEqual(['pass-1#1', 'pass-2#1', 'pass-1#2'])
    await ledger.close()
  })

  it('a settled call has an unknown outcome and the stop it was settled with, and is no longer unfinished', async () => {
    const file = fileOf()
    const ledger = await opened(file)
    const call = await recorded(ledger, 'pass-1')
    const other = await recorded(ledger, 'pass-2')
    expect(await ledger.mark(call.key, { at: 'settled', stop: 'confirmed' })).toBe('recorded')
    const settled = {
      ...call,
      state: 'settled',
      end: { outcome: 'unknown', stop: 'confirmed', stderrBytes: 0 },
    }
    await ledger.close()
    const again = await opened(file)
    expect(again.get(call.key)).toEqual(settled)
    expect(again.unfinished()).toEqual([other])
    await again.close()
  })

  it('records nothing for a call it does not know', async () => {
    const file = fileOf()
    const ledger = await opened(file)
    expect(await ledger.mark('pass-9#1', { at: 'started', process })).toBe('unavailable')
    expect(ledger.get('pass-9#1')).toBeUndefined()
    await ledger.close()
    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('two marks made at once both take effect', async () => {
    const ledger = await opened(fileOf())
    const call = await recorded(ledger, 'pass-1')
    await Promise.all([
      ledger.mark(call.key, { at: 'started', process }),
      ledger.mark(call.key, { at: 'resource', resource }),
    ])
    expect(ledger.get(call.key)).toMatchObject({ state: 'started', process, resources: [resource] })
    await ledger.close()
  })

  it('reads over a line of a call with no intent and over a last line the process died while writing', async () => {
    const file = fileOf()
    const ledger = await opened(file)
    const call = await recorded(ledger, 'pass-1')
    await ledger.close()
    writeFileSync(
      file,
      `${JSON.stringify({ at: 'started', key: 'pass-9#1', process })}\n${readFileSync(file, 'utf8')}`,
    )
    appendFileSync(file, '{"at":"ended","key":"pass-1#1","en')
    const again = await opened(file)
    expect(again.get('pass-9#1')).toBeUndefined()
    expect(again.unfinished()).toEqual([call])
    await again.close()
  })

  it('writes nothing more once it is closed', async () => {
    const ledger = await opened(fileOf())
    await ledger.close()
    expect(await ledger.intend(intent('pass-1'))).toBe('unavailable')
    expect(ledger.get('pass-1#1')).toBeUndefined()
  })

  it('is unavailable when its file cannot be opened', async () => {
    const plain = fileOf()
    writeFileSync(plain, '')
    expect(await openCommandLedger(join(plain, 'under-a-file.jsonl'))).toBe('unavailable')
  })
})

describe('the evidence of a call', () => {
  it('names the record and its state, with a digest that follows the record', async () => {
    const ledger = await opened(fileOf())
    const call = await recorded(ledger, 'pass-1')
    const evidence = callEvidence(call)
    expect(evidence).toEqual({
      owner: 'loop-extension',
      record: 'pass-1#1',
      revision: 'intended',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    })
    await ledger.mark(call.key, { at: 'started', process })
    const started = callEvidence(ledger.get(call.key) ?? call)
    expect(started.revision).toBe('started')
    expect(started.digest).not.toBe(evidence.digest)
    await ledger.close()
  })
})
