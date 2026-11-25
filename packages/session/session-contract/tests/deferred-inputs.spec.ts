import { describe, expect, it } from 'vitest'
import type {
  EntryId,
  InputId,
  RunId,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { decodeEntry, encodeEntry, type SessionEntry } from '../src/entries.ts'
import { reduce } from '../src/reduce.ts'
import { open, scene } from './scene.ts'

type Scene = ReturnType<typeof scene>
const id = (name: string) => name as InputId

const later = (s: Scene, name: string) =>
  s.commit({
    kind: 'accept',
    input: {
      ...s.base,
      operation: operationId(`accept-${name}`),
      value: { ...ordinaryInput(name), afterRun: true },
    },
  })

function apply(snapshot: WorkSnapshot, entry: SessionEntry) {
  const revision = String(BigInt(snapshot.revision) + 1n) as SessionRevision
  const origin = { owner: 'session', via: 'direct', source: evidence('deferred') }
  return reduce(snapshot, {
    revision,
    entries: [{ ...encodeEntry(entry, origin), id: 'deferred-1' as EntryId, revision }],
  })
}

const applied = (snapshot: WorkSnapshot, entry: SessionEntry): WorkSnapshot => {
  const result = apply(snapshot, entry)
  if (result.kind !== 'reduced') throw new Error(`not reduced: ${result.kind}`)
  return result.snapshot
}

function terminal(run: RunId, outcome: 'completed' | 'failed' | 'cancelled'): SessionEntry {
  return {
    kind: 'run.terminal',
    terminal: { run, outcome, evidence: evidence(`terminal/${outcome}`) },
    sequence: null,
    cause: null,
    disposition: null,
    bounded: null,
    end: null,
  }
}

async function during() {
  const s = await open()
  succeeded(await later(s, 'later'), 'accept later')
  const snapshot = await s.read()
  if (snapshot.run.kind !== 'active') throw new Error('expected an active Run')
  const idle = { ...snapshot, run: { ...snapshot.run, advance: null } }
  const started = s.port.controls
    .entriesOf(s.access.tenant, s.access.session)
    .map(row => decodeEntry(row))
    .flatMap(value => ('ok' in value && value.ok.kind === 'run.started' ? [value.ok] : []))[0]
  if (started === undefined) throw new Error('expected run.started')
  return { s, snapshot, idle, run: snapshot.run.run, started }
}

describe('the reducer keeps the inputs held back until a Run ends (等这一轮结束再发)', () => {
  it('holds an input sent during a Run for that Run, and treats one sent with no Run as ordinary', async () => {
    const { snapshot, run } = await during()
    expect(snapshot.deferredInputs).toEqual([{ input: 'later', run }])
    expect(snapshot.pending).toEqual(['first', 'later'])
    const fresh = scene()
    await fresh.create()
    succeeded(await later(fresh, 'alone'), 'accept alone')
    expect((await fresh.read()).deferredInputs ?? []).toEqual([])
  })

  it('releases them when their Run completes or is cancelled, and re-aims them at the next Run when it fails', async () => {
    const { idle, run } = await during()
    expect(applied(idle, terminal(run, 'completed')).deferredInputs).toEqual([])
    expect(applied(idle, terminal(run, 'cancelled')).deferredInputs).toEqual([])
    expect(applied(idle, terminal(run, 'failed')).deferredInputs).toEqual([
      { input: 'later', run: null },
    ])
  })

  it('leaves those of another Run and drops those no longer pending', async () => {
    const { idle, run } = await during()
    const other = 'run-other' as RunId
    const mixed = {
      ...idle,
      pending: [...idle.pending, id('elsewhere')],
      deferredInputs: [
        ...(idle.deferredInputs ?? []),
        { input: id('elsewhere'), run: other },
        { input: id('gone'), run },
      ],
    }
    expect(applied(mixed, terminal(run, 'completed')).deferredInputs).toEqual([
      { input: 'elsewhere', run: other },
    ])
  })

  it('aims a re-aimed input at the next Run that starts, and refuses a Run that starts from it', async () => {
    const { idle, run, started } = await during()
    const ended = applied(idle, terminal(run, 'failed'))
    const next = 'run-next' as RunId
    const fromFirst = { ...started, run: next, first: id('first'), predecessor: run }
    expect(applied(ended, fromFirst).deferredInputs).toEqual([{ input: 'later', run: next }])
    expect(apply(ended, { ...fromFirst, first: id('later') })).toMatchObject({
      kind: 'quarantined',
    })
  })
})
