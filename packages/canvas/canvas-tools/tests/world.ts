import { createCanvas } from '@omne-harness/canvas'
import {
  createMemoryStore,
  fakeAuthority,
  fakeClock,
  fakeKinds,
} from '@omne-harness/canvas/testing'
import {
  tenantIdSchema,
  type CallContext,
  type CanvasMovers,
  type CanvasOperations,
  type KindDeclaration,
  type KindName,
} from '@omne-harness/canvas-contract'
import {
  answerCanvas,
  attachCanvas,
  bindCanvas,
  canvasExecutor,
  canvasToolModule,
  createCanvasAuthor,
  type CanvasCallSource,
} from '@omne-harness/canvas-tools'
import { readJsonText } from '@omne-harness/json-text'
import { createIndependentToolScope } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { commandArguments, deriveDefinition } from '@omne-harness/tool-contract/provider'

const tenantText = (account: string) =>
  JSON.stringify({ organization: 'org_00000000000000000000000000', account })
export const TENANT = tenantText('acc_00000000000000000000000000')
export const OTHER = tenantText('acc_00000000000000000000000001')
export const SESSION = 'session-7'
export const CALL = 'call-1'

export const media = (ref: string) => ({ kind: 'media.object', ref })

export const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

export const kind = (name: string, admit?: KindDeclaration['admit']): KindDeclaration => ({
  name: name as KindName,
  label: name,
  summary: `${name} is a thing`,
  reference: `the identity of a ${name}`,
  ...(admit === undefined ? {} : { admit }),
})

/** The person a tenant is, as the access row builds the context: no tool call. */
export const personOf = (tenant: string): CallContext => ({
  tenant: tenantIdSchema.parse(tenant),
  subject: { person: tenant },
})

/** As the application tells who moved: a context with a tool call is the agent of that call's session. */
const movers: CanvasMovers = {
  async moverOf(ctx) {
    return ctx.call === undefined ? { kind: 'human' } : { kind: 'agent', session: SESSION }
  },
}

/** The real canvas over the memory store; the kind media.object is declared. */
export function domain() {
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const kinds = fakeKinds()
  kinds.declare(kind('media.object'))
  const config = {
    sheet: { width: 4800, height: 3200, grid: 8 },
    limits: { placed: 200, away: 500, batch: 50 },
    size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
    footprint: { width: 160, height: 80 },
    admitTimeoutMs: 50,
  }
  const canvas = createCanvas({ store, authority, movers, kinds, clock: fakeClock(), config })
  return { store, authority, kinds, canvas }
}

function scope() {
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  return created.ok
}

export function author(maximum = 65_536) {
  const created = createCanvasAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    { asset: { name: 'Canvas', adoption: canvasToolModule.executor }, requiredCapabilities: [] },
    created.ok.facts,
  )
  /** Cuts the params of the named command out of a whole call and parses them, as the binding does. */
  function decode(command: string, params: unknown) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { definition, registration, decode }
}

const tool = author()

/** The tool calls of one session agent of `tenant`, against the given canvas. */
export function caller(
  face: CanvasOperations | undefined,
  tenant = TENANT,
  overrides: Partial<CanvasCallSource> = {},
) {
  const bound = bindCanvas({
    tenant,
    call: CALL,
    face: () => face,
    context: async () => ({ tenant: tenantIdSchema.parse(tenant), subject: { work: SESSION } }),
    ...overrides,
  })
  const execution = attachCanvas(scope(), bound)

  async function run(command: string, params: unknown = {}) {
    const parsed = tool.decode(command, params)
    if ('failure' in parsed) return { failure: parsed.failure }
    return answerCanvas(parsed.ok as never, execution.context)
  }
  /** The value of a completed call: its first line and the JSON under it. */
  async function ok(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    const [head = '', ...rest] = answer.ok.split('\n')
    const text = rest.join('\n')
    return {
      head,
      text,
      value: (head.startsWith('done Canvas help') ? null : JSON.parse(text)) as any,
    }
  }
  async function failure(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if (!('failure' in answer))
      throw new Error(`expected a failure, got ${JSON.stringify(answer.ok)}`)
    return answer.failure as { kind: string; reason: string; operation?: string }
  }
  /** What the executor itself gives the call: the text, or a throw with the reason. */
  async function executed(command: string, params: unknown = {}) {
    const parsed = tool.decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    return canvasExecutor.execute(parsed.ok as never, null, execution.context)
  }
  return { bound, execution, run, ok, failure, executed }
}
