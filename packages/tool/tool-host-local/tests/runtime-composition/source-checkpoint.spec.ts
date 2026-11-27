import { expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import {
  resolveToolInvocationRef,
  type FixedToolRequest,
  type ToolCallId,
} from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  defineToolWaitContract,
  type CheckpointedToolExecutor,
  type ToolEntrySource,
  type ToolSourceCall,
  type ToolSourceResume,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolDecisionBridge,
  testingSourceEntry,
} from '@omne-harness/tool-contract/testing'
import { createLocalEntrySources } from '../../src/entry-sources.ts'
import type { ToolEnvironmentValue } from '../../src/author-environment.ts'
import { accessOf, fiberedRegistry, tenantA } from '../binding-values.ts'
import { adoption } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 1_024,
  }
}

const ask = unbox(
  defineToolWaitContract({
    kind: 'ask',
    adoption: adoption('peer-input'),
    request: schema('peer-input-request'),
    response: schema('peer-input-response'),
    expiry: 'forbidden',
  }),
)
const entry = testingSourceEntry({ name: 'peer__book', category: 'mcp', commands: ['run'] })
const result = (text: string) => ({
  content: [
    {
      kind: 'text' as const,
      id: 'peer.result',
      visibility: { toHuman: true, toModel: true },
      text,
    },
  ],
  data: { kind: 'none' as const },
  original: { kind: 'none' as const },
  attachments: [],
})

// A checkpoint source that asks one question; what it saw of each segment is kept.
function asking() {
  const executed: ToolSourceCall<string>[] = []
  const resumed: ToolSourceResume<string>[] = []
  const source: ToolEntrySource<string, ContentBlock> = {
    prefix: 'peer__',
    list: async () => succeed({ entries: [entry], withheld: [] }),
    select: (_access, name) => (name === entry.definition.name ? entry : undefined),
    checkpoint: {
      declaration: {
        schema: { id: 'peer-state', revision: '1', digest: 'sha256:peer-state' },
        codec: adoption('peer-state-codec'),
        maxBytes: 64,
      },
      waits: [ask],
    },
    async execute(call) {
      executed.push(call)
      return {
        kind: 'suspended',
        state: new TextEncoder().encode('{"round":1}'),
        wait: {
          kind: 'ask',
          key: 'day',
          contract: ask,
          request: { kind: 'string', value: 'which day?' },
        },
        closedResult: 'Nobody said which day.',
      }
    },
    async resume(call) {
      resumed.push(call)
      return result('booked') as never
    },
  }
  return { source, executed, resumed }
}

// The segments the host builds for the source, handed to a host whose tool gives text: the source's result becomes text.
function segmentsOf(source: ToolEntrySource<string, ContentBlock>) {
  const sourced = createLocalEntrySources<string, unknown, ContentBlock>({
    sources: () => [source],
    hold: () => () => undefined,
    codec: createToolMessageResultCodec(4096) as never,
  })
  const fixed = {
    availability: {
      kind: 'available',
      definition: entry.definition,
      executor: entry.executor,
      layer: { kind: 'tenant', tenant: tenantA },
    },
    command: 'run',
  } as FixedToolRequest
  const { registry } = fiberedRegistry(null)
  const asSomeone = accessOf(tenantA)
  const selected = unbox(
    sourced.registry(registry).selectAndPin(asSomeone, fixed, 'c' as ToolCallId),
  )
  const registration = readToolRegistration(selected.loaded.implementation)
  const segments =
    registration?.kind === 'commands' ? registration.operations[0]?.[1].segments : null
  if (segments === null || segments === undefined)
    throw new Error('the source entry has no segments')
  const texted: CheckpointedToolExecutor<string, string, ToolEnvironmentValue> = {
    checkpoint: segments.checkpoint,
    initial: async (args, environment, context) => {
      const segment = await segments.initial({ kind: 'object', entries: [] }, environment, context)
      return 'ok' in segment && segment.ok.kind === 'completed'
        ? succeed({ kind: 'completed', value: JSON.stringify(segment.ok.value) })
        : (segment as never)
    },
    resume: async (input, environment, context) => {
      const segment = await segments.resume(input, environment, context)
      return 'ok' in segment && segment.ok.kind === 'completed'
        ? succeed({ kind: 'completed', value: 'resumed' })
        : (segment as never)
    },
  }
  return { texted, declaration: segments.checkpoint }
}

it('a call of a checkpoint source parks on its wait without a slot, and resumes once from the same checkpoint with the facts of its call (C108, TL-78)', async () => {
  const { source, executed, resumed } = asking()
  const { texted } = segmentsOf(source)
  const decisions = createMemoryToolDecisionBridge<unknown>()
  const world = await fixture(
    undefined,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    { waits: [ask], decisions, executor: texted },
  )
  try {
    const reference = accepted(await world.api.invoke(world.invocation('asked')))
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const access = { tenant: world.tenantA, principal: 'alice', call: parts.call }
    const recovery = async () => unbox(await world.root.toolCommands.loadRecovery(access))
    await expect
      .poll(async () => (await recovery()).waits[0]?.phase, { timeout: 3_000 })
      .toBe('open')
    const executor = () => {
      const diagnostics = world.plugins.diagnostics().executor
      if (diagnostics === null) throw new Error('the world has no executor')
      return diagnostics
    }
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    expect((await recovery()).state.phase).toBe('suspended')
    expect(executed.map(call => [call.principal, call.invocation])).toEqual([['alice', parts.call]])
    const wait = (await recovery()).waits[0]?.intent.wait
    if (wait === undefined) throw new Error('no wait')
    await decisions.controls.decide({
      tenant: world.tenantA,
      call: parts.call,
      wait,
      value: { kind: 'answer', value: { kind: 'string', value: 'Tuesday' } },
    })
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect
      .poll(async () => (await recovery()).state.phase, { timeout: 3_000 })
      .toBe('settled')
    expect(resumed).toHaveLength(1)
    expect(resumed[0]).toMatchObject({
      principal: 'alice',
      invocation: parts.call,
      response: { kind: 'answer', value: 'Tuesday' },
    })
    expect(new TextDecoder().decode(resumed[0]?.checkpoint)).toBe('{"round":1}')
    expect((await recovery()).invocations.map(start => start.kind)).toEqual(['start', 'resume'])
  } finally {
    await world.close()
  }
})
