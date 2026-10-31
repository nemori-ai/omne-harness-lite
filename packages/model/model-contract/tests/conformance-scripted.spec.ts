import { describe, expect, it } from 'vitest'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
} from '@omne-harness/model-contract/conformance'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import {
  acknowledged,
  ackInput,
  dispatchesOf,
  ended,
  evidenceFor,
  hookOf,
  operationId,
  readOf,
  refusedAs,
  running,
  stateOf,
  targetOf,
  textBlock,
  versionId,
} from '../src/conformance/conformance-kit.ts'
import { sceneOf } from './conformance-support.ts'

describe('the scripted provider and transport under the conformance suite', () => {
  it('keep every obligation, and none is left as not applicable', async () => {
    const report = await checkModelProviderConformance({
      subject: createScriptedConformanceSubject,
      waitMs: 500,
    })
    expect(report.results.filter(result => result.status !== 'pass')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('report each obligation once, in the order that the suite lists them', async () => {
    const report = await checkModelProviderConformance({
      subject: createScriptedConformanceSubject,
      waitMs: 500,
    })
    expect(report.results.map(result => result.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  })
})

describe('the hooks of the scripted conformance subject', () => {
  it('give a principal that has a name and a subject of its own for each call', () => {
    const first = createScriptedConformanceSubject()
    const second = createScriptedConformanceSubject()
    expect(typeof first.principal.name).toBe('string')
    expect(first.principal.name).not.toBe('')
    expect(first.provider).not.toBe(second.provider)
    expect(first.tenant).not.toBe(first.otherTenant)
  })

  it('start a run that shows the dispatch as started with none of the output proven', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'run')
    const state = await stateOf(scene, call)
    expect(state).toMatchObject({ phase: 'running', firstContent: 'none-proven' })
    const [record] = await dispatchesOf(scene, call.call)
    expect(record).toMatchObject({
      send: 'started',
      firstContent: 'none-proven',
      terminal: null,
      account: null,
      materialization: null,
    })
    expect(record?.supplier.model).toBe(call.input.request.suppliers[0]?.model)
    expect(record?.intent).toBe(operationId(`intent-${record?.dispatch}`))
  })

  it('end a call once and leave it as it is when asked again', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'once')
    expect(call.state.settlement.version).toBe(versionId(call.call))
    expect(call.state.settlement.source).toEqual({
      owner: 'conformance',
      record: `settlement-${call.call}`,
      revision: '1',
      digest: `digest-settlement-${call.call}`,
    })
    await hookOf(
      scene,
      'settleCall',
    )({
      ...targetOf(scene, call.call),
      termination: { kind: 'interrupted', control: operationId('later') },
      parts: [textBlock('late', 'late')].map(block => ({
        kind: 'sealed' as const,
        block,
        trims: [],
      })),
      pageSize: 1,
      pageTargetBytes: 1024,
    })
    expect(await stateOf(scene, call)).toEqual(call.state)
  })

  it('give evidence that only that call takes, with a record that names the call and the label', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'evidence')
    const evidence = await evidenceFor(scene, call, 'mine')
    expect(evidence).toEqual({
      owner: 'conformance',
      record: `${call.call}-mine`,
      revision: '1',
      digest: `digest-${call.call}-mine`,
    })
    const foreign = { ...evidence, digest: 'digest-of-another-call' }
    refusedAs(
      await scene.subject.provider.runtime.consumption.acknowledge(
        ackInput(scene, call, operationId('foreign'), foreign),
      ),
      'handoff-invalid',
      'the acknowledgement with evidence from elsewhere',
    )
  })

  it('move cleanup on to released and stop it as blocked with a reason', async () => {
    const scene = sceneOf()
    const call = await ended(scene, 'cleanup')
    await acknowledged(scene, call)
    await hookOf(scene, 'advanceCleanup')(targetOf(scene, call.call))
    expect((await stateOf(scene, call)).custody).toMatchObject({
      kind: 'acknowledged',
      cleanup: 'released',
      diagnostic: null,
    })
    await hookOf(scene, 'blockCleanup')(targetOf(scene, call.call))
    expect((await stateOf(scene, call)).custody).toMatchObject({
      kind: 'acknowledged',
      cleanup: 'blocked',
      diagnostic: 'the cleanup cannot go on',
    })
  })

  it('give the result in pages of the size asked for', async () => {
    const scene = sceneOf()
    const call = await running(scene, 'pages')
    await hookOf(
      scene,
      'settleCall',
    )({
      ...targetOf(scene, call.call),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [textBlock('p1', 'a'), textBlock('p2', 'b'), textBlock('p3', 'c')].map(block => ({
        kind: 'sealed' as const,
        block,
        trims: [],
      })),
      pageSize: 1,
      pageTargetBytes: 1024,
    })
    const done = await stateOf(scene, call)
    if (done.phase !== 'settled') throw new Error('the call ended')
    const { page } = await readOf(scene, {
      ...call,
      version: done.settlement.version,
      state: done,
    })
    expect(page.parts.flatMap(part => (part.kind === 'sealed' ? [part.block.id] : []))).toEqual([
      'p1',
    ])
  })
})

describe('the transport of the scripted conformance subject', () => {
  it('ends its stream with a completed termination after the facts of the script', async () => {
    const { transport } = createScriptedConformanceSubject()
    if (transport === undefined) throw new Error('a transport')
    const scene = sceneOf()
    const request = scene.request
    const supplier = request.suppliers[0]
    if (supplier === undefined) throw new Error('a supplier')
    const prepared = await transport.transport.prepare(request, supplier, { resent: [] })
    if (!('ok' in prepared)) throw new Error('prepare')
    const materialized = await prepared.ok.materialize(new AbortController().signal)
    if (!('ok' in materialized)) throw new Error('materialize')
    expect(transport.sends()).toBe(0)
    const facts = []
    for await (const fact of materialized.ok.start(new AbortController().signal)) facts.push(fact)
    expect(transport.sends()).toBe(1)
    expect(facts).toEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'hello' },
      { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
    ])
    expect(Object.keys(materialized.ok.receipt).sort()).toEqual([
      'payloadDigest',
      'representation',
      'supplier',
    ])
    expect(materialized.ok.receipt.supplier).toEqual(supplier.adoption)
    expect(materialized.ok.receipt.representation).toEqual(request.representation)
    await materialized.ok.close()
    await prepared.ok.close()
  })

  it('counts a second start as a refused step and not as a send', async () => {
    const { transport } = createScriptedConformanceSubject()
    if (transport === undefined) throw new Error('a transport')
    const scene = sceneOf()
    const supplier = scene.request.suppliers[0]
    if (supplier === undefined) throw new Error('a supplier')
    const prepared = await transport.transport.prepare(scene.request, supplier, { resent: [] })
    if (!('ok' in prepared)) throw new Error('prepare')
    const materialized = await prepared.ok.materialize(new AbortController().signal)
    if (!('ok' in materialized)) throw new Error('materialize')
    const signal = new AbortController().signal
    for await (const fact of materialized.ok.start(signal)) void fact
    try {
      for await (const fact of materialized.ok.start(signal)) void fact
    } catch {
      // The refusal may be an error; the count is what the suite reads.
    }
    expect(transport.sends()).toBe(1)
  })
})
