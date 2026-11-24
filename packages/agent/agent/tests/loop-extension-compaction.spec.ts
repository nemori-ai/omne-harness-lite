import { describe, expect, it } from 'vitest'
import type { Position } from '@omne-harness/agent-contract'
import { execution, ok } from './journal-support.ts'
import { alice } from './loop-support.ts'
import { compactionLoop } from './fixtures/compaction-loop.ts'
import {
  declare,
  implementations,
  observed,
  output,
  reminder,
  tenantView,
  type Behavior,
} from './extension-support.ts'

async function scene(position: Position, behavior: Behavior) {
  const view = tenantView()
  const extensions = implementations()
  view.enable(declare('probe', position))
  extensions.define('probe', behavior)
  const f = await compactionLoop(undefined, undefined, dependencies => ({
    ...dependencies,
    extensions: extensions.port,
    enabledExtensions: view.port,
  }))
  const load = async () =>
    ok(await f.dependencies.journal.load({ ...alice, execution: execution() }))
  return { f, extensions, load }
}

describe('before_compaction', () => {
  it('observed: the member reads the preparation that needs compaction, and the compaction goes on', async () => {
    const s = await scene('before_compaction', () => observed)
    ok(await s.f.current.runExecution())
    expect(s.extensions.invocations.map(item => item.input.passage)).toEqual([
      'step-1/main/before_compaction/call/0',
    ])
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      preparation: { kind: 'needs-compaction' },
    })
    expect(s.f.requests).toHaveLength(1)
    const read = await s.load()
    expect(read.checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
    expect(read.checkpoint.chain).toBeNull()
  })

  it('veto: no compaction task begins; the run fails as cannot-fit after compaction, and names the veto', async () => {
    const s = await scene('before_compaction', () =>
      output({ kind: 'veto', reason: 'keep the whole history' }),
    )
    ok(await s.f.current.runExecution())
    expect(s.f.requests).toEqual([])
    const read = await s.load()
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(s.f.finishes[0]?.failure).toMatchObject({
      kind: 'cannot-fit',
      reason: 'after-compaction',
    })
    expect(read.checkpoint.requestPreparation).toMatchObject({
      kind: 'cannot-fit',
      diagnostic: expect.stringContaining('keep the whole history'),
    })
    expect(read.checkpoint.chain).toBeNull()
  })
})

describe('after_compaction', () => {
  it('observed: the member reads the committed transition after the history adopted it, and the main request resumes', async () => {
    const s = await scene('after_compaction', () => observed)
    ok(await s.f.current.runExecution())
    expect(s.extensions.invocations[0]?.input.subject).toMatchObject({
      transition: { message: { role: 'compaction' }, task: expect.any(Object) },
    })
    expect(s.f.controls.journal.joint().map(item => item.caller?.kind)).toContain(
      'context-transition',
    )
    const read = await s.load()
    expect(read.checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
  })

  it('inject: the reminder is admitted and the main request still resumes', async () => {
    const s = await scene('after_compaction', () => output(reminder('the history was compacted')))
    ok(await s.f.current.runExecution())
    expect(
      s.f.controls.handoff.prepare.calls.some(
        call => call.request.kind === 'execution' && call.request.source.kind === 'reminder',
      ),
    ).toBe(true)
    expect((await s.load()).checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
  })

  it('a veto is not an output of this position: it is an error and the compaction stands', async () => {
    const s = await scene('after_compaction', () => output({ kind: 'veto', reason: 'undo' }))
    ok(await s.f.current.runExecution())
    expect((await s.load()).checkpoint.calls).toMatchObject([{ kind: 'model', purpose: 'main' }])
  })
})
