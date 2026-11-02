// The default strategies inside a real operation group: a fixed history assembles into a request
// that the Model request preparation double accepts, planning respects pairing and the budget, and
// a later round that holds a continuation fact declares `continues` in its lineage.
import { describe, expect, it } from 'vitest'
import {
  createScriptedModelRequestPreparation,
  createScriptedTransport,
} from '@omne-harness/model-contract/testing'
import { decodeModelCallId, decodeModelOperationId } from '@omne-harness/model-contract'
import { judgeAdmit } from '@omne-harness/model-contract/provider'
import {
  decodeCommitOrder,
  type AdoptedRequestFact,
  type AssemblyResult,
  type RequestCandidate,
} from '@omne-harness/request-context-contract'
import {
  countingBasis,
  createAssemblyFixture,
  createScriptedInputMeter,
  fixtureBudget,
  type AssemblyFixture,
  type MemoryAdoptedSource,
} from '@omne-harness/request-context-contract/testing'
import {
  createDefaultCompactionPolicy,
  createDefaultRepresentationPolicy,
} from '@omne-harness/request-context'
import { assistantCall, historyRow, toolResult, userMessage } from './fixtures/messages.ts'

const policies = () => ({
  compaction: createDefaultCompactionPolicy(),
  representation: createDefaultRepresentationPolicy(),
})
const evidence = { owner: 'test', record: 'test', revision: '1', digest: 'd' }
const rows = () => [
  historyRow(0, userMessage(0, 'read it')),
  historyRow(1, assistantCall(1, 'c1')),
  historyRow(2, toolResult(2, 'c1', 'contents')),
  historyRow(3, userMessage(3, 'thanks')),
]

function candidateOf(result: AssemblyResult): RequestCandidate {
  if (result.kind !== 'candidate-before-extension' && result.kind !== 'candidate-fixable')
    throw new Error(`Expected a candidate, got ${result.kind}`)
  return result.candidate
}

/** Hands the assembled input to the Model request preparation double, as a coordinator would. */
async function prepareThroughModel(f: AssemblyFixture, candidate: RequestCandidate) {
  const transport = createScriptedTransport({
    receipt: {
      supplier: evidenceAdoption,
      representation: evidenceAdoption,
      payloadDigest: 'none',
    },
    facts: [],
    ending: { kind: 'terminated', termination: { kind: 'completed', reason: 'stop' } },
    rejection: null,
  })
  const model = f.sources.values().model
  const double = createScriptedModelRequestPreparation<string>({ transport: transport.transport })
  double.setAccess(f.call.access, 'allow')
  const required = candidate.modality
  if (required === null) throw new Error('A text history requires the text modality')
  const [supplier] = model.profile.definition.suppliers
  if (supplier === undefined) throw new Error('fixture')
  double.setPlan(
    { ...f.call.access, profile: model.profile, required, parameters: [] },
    {
      ok: {
        suppliers: [
          {
            adoption: supplier.adoption,
            recipient: supplier.recipient,
            model: supplier.model,
            credential: { kind: 'factory' },
          },
        ],
        parameterAdoptions: [],
      },
    },
  )
  return double.preparation.prepare({
    ...f.call.access,
    profile: model.profile,
    required,
    assembled: candidate.assembled,
  })
}
const evidenceAdoption = { owner: 'test', name: 'test', revision: '1', digest: 'd' }

describe('default strategies in a real operation group', () => {
  it('assembles a fixed history into a request the Model preparation accepts', async () => {
    const f = createAssemblyFixture({ policies: policies(), rows: rows() })
    const candidate = candidateOf(await f.operations().assemble(f.call))
    expect(candidate.assembled.messages.map(message => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ])
    // Text goes to the model as it is: the strategy chose the original for every block.
    expect(candidate.representations.map(choice => choice.choice)).toEqual([
      'original',
      'original',
      'original',
    ])
    const prepared = await prepareThroughModel(f, candidate)
    if (!('ok' in prepared)) throw new Error(`Preparation refused: ${JSON.stringify(prepared)}`)
    expect(prepared.ok.messages).toEqual(candidate.assembled.messages)
  })
  it('assembles a request whose adoptions the Model admit judgment accepts', async () => {
    const f = createAssemblyFixture({ policies: policies(), rows: rows() })
    const candidate = candidateOf(await f.operations().assemble(f.call))
    const prepared = await prepareThroughModel(f, candidate)
    if (!('ok' in prepared)) throw new Error(`Preparation refused: ${JSON.stringify(prepared)}`)
    // The double keeps the supplier fixtures as given; only the two minted adoptions are under test.
    const sha = (letter: string) => letter.repeat(64)
    const hexAdoption = (name: string, letter: string) => ({
      owner: 'test',
      name,
      revision: '1',
      digest: sha(letter),
    })
    const operation = decodeModelOperationId('mop_c27')
    const call = decodeModelCallId('mcall_c27')
    if ('failure' in operation || 'failure' in call) throw new Error('fixture')
    const judged = judgeAdmit({
      ...f.call.access,
      call: call.ok,
      operation: operation.ok,
      request: {
        ...prepared.ok,
        profile: hexAdoption('profile', 'a'),
        retryPolicy: hexAdoption('retry', 'b'),
        suppliers: prepared.ok.suppliers.map(supplier => ({
          ...supplier,
          adoption: hexAdoption('supplier', 'c'),
        })),
      },
      consumer: { owner: 'test', work: 'w', position: 'p', purpose: 'u' },
      capacity: { bytes: '1', blocks: '1', attachmentBytes: '0' },
    })
    expect(judged).toHaveProperty('ok')
    const hex = /^[0-9a-f]{64}$/u
    expect(candidate.assembled.representation.digest).toMatch(hex)
    expect(candidate.assembled.source.digest).toMatch(hex)
  })
  it('gives the same request for the same fixed input', async () => {
    const first = candidateOf(
      await createAssemblyFixture({ policies: policies(), rows: rows() })
        .operations()
        .assemble(createAssemblyFixture({ policies: policies(), rows: rows() }).call),
    )
    const f = createAssemblyFixture({ policies: policies(), rows: rows() })
    const second = candidateOf(await f.operations().assemble(f.call))
    expect(second.assembled).toEqual(first.assembled)
  })
  it('plans a compaction that keeps a call with its result and fits the budget', async () => {
    const f = createAssemblyFixture({
      rows: rows(),
      policies: {
        ...policies(),
        compaction: createDefaultCompactionPolicy({
          config: { retainBudget: { kind: 'tokens', retainTokens: '25' } },
        }),
      },
      preparation: {
        meter: createScriptedInputMeter(countingBasis, input => ({
          ok: fixtureBudget(String(input.assembled.messages.length * 10)),
        })),
      },
    })
    const planned = await f.operations().planCompaction(f.call)
    if (planned.kind !== 'planned') throw new Error(`Expected a plan, got ${planned.kind}`)
    const kept = new Set(planned.plan.retained.map(String))
    expect(kept.has('entry:1')).toBe(kept.has('entry:2'))
    expect(planned.plan.retained.length * 10).toBeLessThanOrEqual(25)
    expect(planned.plan.bound).toBe('3')
    expect(planned.first.kind).toBe('summarize')
    expect(f.preparation.outstanding()).toBe(0)
  })
  it('declares continues in the second round when the first request was fixed', async () => {
    const f = createAssemblyFixture({ policies: policies(), rows: rows() })
    const first = candidateOf(await f.operations().assemble(f.call))
    // Round 1 has no adopted fact, so it declares nothing to continue from.
    expect(f.preparation.calls().every(seen => seen.lineage?.continues === undefined)).toBe(true)
    const call = decodeModelCallId('mcall_fixed')
    const order = decodeCommitOrder('1')
    if ('failure' in call || 'failure' in order) throw new Error('fixture')
    const owner = { tenant: f.target.tenant, call: call.ok }
    const fact: AdoptedRequestFact = {
      coverage: first.coverage,
      target: f.target,
      call: owner,
      candidate: first.candidate,
      order: order.ok,
      committed: evidence,
      windowTokens: '1000',
      accounting: { kind: 'unsettled' },
      forecast: null,
      continuation: { ...first.continuation, call: owner, fixed: evidence },
    }
    const adopted = f.sources.adopted
    if (!isMemoryAdopted(adopted)) throw new Error('The fixture holds a memory adoption source')
    adopted.set(fact)
    candidateOf(await f.operations().assemble(f.call))
    expect(f.preparation.calls().some(seen => seen.lineage?.continues === call.ok)).toBe(true)
  })
})

function isMemoryAdopted(source: unknown): source is MemoryAdoptedSource<string> {
  return typeof source === 'object' && source !== null && 'set' in source
}
