import type {
  Admit,
  ConsumerRef,
  FixedModelRequest,
  ModelTransport,
  ResultCapacity,
  Supplier,
  Termination,
  TransportFact,
} from '@omne-harness/model-contract'
import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { describe, expect, it } from 'vitest'
import { patched, type Subject } from './conformance-support.ts'

type Log = {
  admitted: Admit<ScriptedPrincipal>[]
  prepared: { request: FixedModelRequest; supplier: Supplier }[]
  pages: { read: string; after: string }[]
  closed: { read: string }[]
}

/** The subject, with every admission and every preparation that the suite makes written down in `log`. */
function recorded(subject: Subject, log: Log): Subject {
  const given = subject.transport
  if (given === undefined) throw new Error('the scripted subject has a transport')
  const transport: ModelTransport = {
    prepare: (request, supplier) => {
      log.prepared.push({ request, supplier })
      return given.transport.prepare(request, supplier)
    },
  }
  const through = patched(subject, {
    calls: calls => ({
      ...calls,
      admit: input => {
        log.admitted.push(input)
        return calls.admit(input)
      },
    }),
    consumption: consumption => ({
      ...consumption,
      readNext: input => {
        log.pages.push({ read: input.read, after: input.after })
        return consumption.readNext(input)
      },
      closeRead: input => {
        log.closed.push({ read: input.read })
        return consumption.closeRead(input)
      },
    }),
  })
  return { ...through, transport: { ...given, transport } }
}

/** Runs the whole suite on subjects that `change` makes, and returns what the suite sent. */
async function sent(change: (subject: Subject) => Subject): Promise<Log> {
  const log: Log = { admitted: [], prepared: [], pages: [], closed: [] }
  await checkModelProviderConformance({
    subject: () => recorded(change(createScriptedConformanceSubject()), log),
    waitMs: 300,
  })
  return log
}

function firstAdmission(log: Log): Admit<ScriptedPrincipal> {
  const first = log.admitted[0]
  if (first === undefined) throw new Error('the suite admitted a call')
  return first
}

describe('the values that the conformance suite sends when the subject gives none', () => {
  it('sends a request that carries one supplier and nothing else, with no budget, meter or limits', async () => {
    const { request } = firstAdmission(await sent(subject => subject))
    expect(request).toMatchObject({
      fallback: false,
      toolChoice: 'none',
      parameters: [],
      system: [],
      messages: [],
      tools: [],
      parameterAdoptions: [],
    })
    expect(Object.keys(request).sort()).toEqual([
      'fallback',
      'messages',
      'parameterAdoptions',
      'parameters',
      'profile',
      'representation',
      'retryPolicy',
      'source',
      'suppliers',
      'system',
      'toolChoice',
      'tools',
    ])
    expect(request.suppliers).toHaveLength(1)
    const supplier = request.suppliers[0]
    if (supplier === undefined) throw new Error('a supplier')
    expect(supplier.credential).toEqual({ kind: 'factory' })
    expect(supplier.recipient).not.toBe('')
    expect(supplier.model).not.toBe('')
  })

  it('names every adoption by an owner, a name, a revision and a 64-character hexadecimal digest', async () => {
    const { request } = firstAdmission(await sent(subject => subject))
    for (const adoption of [
      request.profile,
      request.retryPolicy,
      request.representation,
      request.source,
      request.suppliers[0]?.adoption,
    ]) {
      expect(adoption).toMatchObject({ owner: 'conformance', revision: '1' })
      expect(adoption?.name).not.toBe('')
      expect(adoption?.digest).toMatch(/^[0-9a-f]{64}$/u)
    }
  })

  it('sends a consumer and a capacity that have every field', async () => {
    const first = firstAdmission(await sent(subject => subject))
    expect(first.consumer).toEqual({
      owner: 'conformance',
      work: 'work-1',
      position: 'position-1',
      purpose: 'purpose',
    })
    expect(first.capacity).toEqual({ bytes: '1000', blocks: '10', attachmentBytes: '0' })
  })

  it('asks for the page after the first and for the close of a read that other tenants never had', async () => {
    const log = await sent(subject => subject)
    expect(log.pages).toContainEqual({ read: 'mread_cf-hidden', after: '1' })
    expect(log.closed).toContainEqual({ read: 'mread_cf-hidden' })
  })

  it('prepares the transport with the request of the admissions and its own first supplier', async () => {
    const log = await sent(subject => subject)
    const prepared = log.prepared[0]
    expect(prepared?.request).toEqual(firstAdmission(log).request)
    expect(prepared?.supplier).toEqual(prepared?.request.suppliers[0])
  })
})

describe('the values that the subject gives to the conformance suite', () => {
  const consumer: ConsumerRef = { owner: 'mine', work: 'w', position: 'p', purpose: 'q' }
  const capacity: ResultCapacity = { bytes: '5', blocks: '2', attachmentBytes: '1' }

  it('are the consumer and the capacity that the provider receives in place of the defaults', async () => {
    const first = firstAdmission(await sent(subject => ({ ...subject, consumer, capacity })))
    expect(first.consumer).toBe(consumer)
    expect(first.capacity).toBe(capacity)
  })

  it('are the request that the provider receives in place of the default', async () => {
    const standard = firstAdmission(await sent(subject => subject)).request
    const mine: FixedModelRequest = { ...standard, fallback: true }
    const log = await sent(subject => ({ ...subject, request: mine }))
    expect(firstAdmission(log).request).toBe(mine)
  })

  it('are the request and the supplier that the transport is prepared with, when it names its own', async () => {
    const standard = firstAdmission(await sent(subject => subject)).request
    const supplier = standard.suppliers[0]
    if (supplier === undefined) throw new Error('a supplier')
    const mine: FixedModelRequest = { ...standard, fallback: true }
    const theirs: Supplier = { ...supplier, model: 'another-model' }
    const log = await sent(subject => {
      const given = subject.transport
      if (given === undefined) throw new Error('the scripted subject has a transport')
      return { ...subject, transport: { ...given, request: mine, supplier: theirs } }
    })
    expect(log.prepared[0]?.request).toBe(mine)
    expect(log.prepared[0]?.supplier).toBe(theirs)
  })
})

describe('what the conformance suite asks of the hooks', () => {
  /** The facts that the suite plays and the terminations that it ends calls with, in order. */
  async function asked() {
    const played: (readonly TransportFact[])[] = []
    const ends: { call: string; termination: Termination; blocks: number }[] = []
    await checkModelProviderConformance({
      subject: () => {
        const subject = createScriptedConformanceSubject()
        const { showFacts, settleCall } = subject.hooks ?? {}
        if (showFacts === undefined || settleCall === undefined)
          throw new Error('the scripted subject has showFacts and settleCall')
        return {
          ...subject,
          hooks: {
            ...subject.hooks,
            showFacts: async input => {
              played.push(input.facts)
              await showFacts(input)
            },
            settleCall: async input => {
              ends.push({
                call: input.call,
                termination: input.termination,
                blocks: input.parts.length,
              })
              await settleCall(input)
            },
          },
        }
      },
      waitMs: 300,
    })
    return { played, ends }
  }

  it('plays a fill into a block after it was sealed', async () => {
    const { played } = await asked()
    expect(played).toContainEqual([{ kind: 'block-delta', index: '0', delta: 'c' }])
  })

  it('plays arguments in pieces that are cut off by a trim before they are sealed', async () => {
    const { played } = await asked()
    const trimmed = played.find(facts => facts.some(fact => fact.kind === 'trim'))
    expect(trimmed?.map(fact => fact.kind)).toEqual([
      'block-open',
      'block-delta',
      'trim',
      'block-seal',
    ])
    expect(played).toContainEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'tool-arguments' },
      { kind: 'block-delta', index: '0', delta: '{"city":"Pa' },
    ])
    expect(trimmed?.map(fact => ('index' in fact ? fact.index : null))).toEqual([
      '0',
      '0',
      '0',
      '0',
    ])
    expect(trimmed).toContainEqual({ kind: 'trim', index: '0', removed: '', reason: 'length' })
    const sealed = trimmed?.find(fact => fact.kind === 'block-seal')
    expect(sealed?.kind === 'block-seal' && sealed.block).toMatchObject({
      kind: 'tool_call',
      arguments: {
        kind: 'object',
        entries: [{ key: 'a', value: { kind: 'number', lexeme: '1' } }],
      },
    })
  })

  it('asks to end each call once, because the hook leaves an ended call as it is', async () => {
    const { ends } = await asked()
    const byCall = Map.groupBy(ends, end => end.call)
    expect(ends.length).toBeGreaterThan(0)
    expect([...byCall.values()].every(list => list.length === 1)).toBe(true)
  })
})
