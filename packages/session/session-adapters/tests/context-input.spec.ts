// AD-12 on real Cordis: the Context input and its translation protocol. What is checked: the
// plugin provides `sessionContextInput` only while `runtimeContext` is present, removes it on stop
// and runs again on a new Runtime Context provider; it refuses a command or a material of another
// tenant before it asks anyone; it prepares a registration change with `prepareRegistration` under
// the coordinator principal, never calls `applyCommit`, and turns a rejection into `invalid` and
// every other non-success into `unavailable`; the materials it encodes come back as the same
// change, step commit and scope end from the entries that the Session decision really writes.
//
// Runtime Context is the contract's memory double behind a Cordis service, with the test authority
// ports. The Session log is the memory transaction port of session-contract `./testing`.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type CommitInput,
  type ContextBlockKey,
  type NeedBinding,
  type RegistrationChange,
  type RuntimeContextOperations,
  type ScopeRef,
  type StatefulBlockDescriptor,
  type StepCommit,
} from '@omne-harness/runtime-context-contract'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import { RuntimeContextService } from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  initializationRegistrationCommit,
  type Adoption,
  type HistoryEntry,
  type InitializationGuardResult,
  type SessionAccess,
  type SessionCommand,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  adoption,
  createMemoryInitializationSource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { sessionContextInputKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  SESSION_CONTEXT_MATERIAL,
  contextChangeCommit,
  contextScopeEndCommit,
  contextStepCommit,
  createSessionContextInputPlugin,
  createSessionContextTranslation,
  encodeContextRegistrationChange,
  encodeContextStepCommit,
  encodeInitialContextRegistration,
  type ContextRegistrationMaterials,
  type SessionContextDefinitions,
} from '../src/cordis/context-input.ts'

// --- values --------------------------------------------------------------------------------------

const A = memoryAccess<unknown>('caller')
const B = memoryOtherAccess<unknown>('caller', 'session-b')

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}
function scopeRef(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}
const scopeA = scopeRef('session-scope:a')

const numberShape = {
  '~standard': {
    version: 1 as const,
    vendor: 'context-input-spec',
    validate: (value: unknown) =>
      typeof value === 'number' ? { value } : { issues: [{ message: 'Expected number' }] },
  },
}

const NOTES: ContextBlockKey = 'test.notes'
const DRAFT: ContextBlockKey = 'test.draft'

function stateful(
  key: ContextBlockKey,
  persistence: 'checkpointed' | 'untracked',
): StatefulBlockDescriptor<ContextBlockKey, unknown, unknown> {
  return {
    kind: 'stateful',
    key,
    schema: numberShape,
    required: false,
    consumers: ['model'],
    disclosure: 'plain',
    carriesPrevious: true,
    volatility: 'stable',
    writers: ['tool'],
    singleWriterPerStep: true,
    persistence,
    reduce: (previous, update) => Number(previous ?? 0) + Number(update),
    updateSchema: numberShape,
  }
}
function modelNeed(key: ContextBlockKey): NeedBinding {
  return {
    key,
    need: {
      name: key,
      shape: numberShape,
      consumer: 'model',
      purpose: 'test',
      necessity: 'optional',
    },
  }
}
function toolNeed(key: ContextBlockKey): NeedBinding {
  return {
    key,
    need: {
      name: `tool:${key}`,
      shape: numberShape,
      consumer: 'tool',
      purpose: 'test',
      necessity: 'optional',
    },
    translate: value => value,
    integrator: 'model',
  }
}

/** The exact adopted definition that the materials reference, with its bindings and declarations. */
const definition: Adoption = adoption('agent-definition')
const notesDeclaration = stateful(NOTES, 'checkpointed')
const objectShape = {
  '~standard': {
    version: 1 as const,
    vendor: 'context-input-spec',
    validate: (value: unknown) =>
      typeof value === 'object' && value !== null
        ? { value }
        : { issues: [{ message: 'Expected object' }] },
  },
}
/** DRAFT takes scope-level parameters, so a registration of it can carry a parameter value. */
const draftDeclaration = { ...stateful(DRAFT, 'untracked'), parameterSchema: objectShape }
const notesModel = modelNeed(NOTES)
const notesTool = toolNeed(NOTES)
const draftModel = modelNeed(DRAFT)
const sameAdoption = (left: Adoption, right: Adoption) =>
  left.owner === right.owner &&
  left.name === right.name &&
  left.revision === right.revision &&
  left.digest === right.digest
const definitions: SessionContextDefinitions = {
  binding: ref =>
    sameAdoption(ref.definition, definition)
      ? [notesModel, notesTool, draftModel].find(
          binding => binding.need.name === ref.need && binding.key === ref.key,
        )
      : undefined,
  declaration: ref =>
    sameAdoption(ref.definition, definition)
      ? new Map([
          [NOTES, notesDeclaration],
          [DRAFT, draftDeclaration],
        ]).get(ref.key)
      : undefined,
}

function ok<T>(outcome: { ok: T } | { failure: unknown }, what: string): T {
  if ('failure' in outcome) throw new Error(`${what}: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

const addNotes = (
  at: ScopeRef,
  tenant: TenantId,
  basedOn = 0,
): Extract<RegistrationChange, { kind: 'add' }> => ({
  kind: 'add',
  scope: at,
  tenant,
  key: NOTES,
  basedOn,
  creating: false,
  bindings: [notesModel, notesTool],
  parameters: undefined,
  required: false,
  declaration: notesDeclaration,
})

function changeCommand(
  access: SessionAccess<unknown>,
  name: string,
  declaration: Extract<SessionCommand, { kind: 'change' }>['input']['declaration'],
): Extract<SessionCommand, { kind: 'change' }> {
  return {
    kind: 'change',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId(name),
      declaration,
    },
  }
}
function registrationCommand(
  access: SessionAccess<unknown>,
  name: string,
  change: RegistrationChange,
  encodedWith = name,
) {
  const materials = ok(
    encodeContextRegistrationChange(
      { change, definition, operation: operationId(encodedWith) },
      definitions,
    ),
    'encode',
  )
  return changeCommand(access, name, {
    kind: 'context-registration',
    registration: evidence(`registration/${name}`),
    ...materials,
  })
}
function stepOf(at: ScopeRef, name: string, value: number): StepCommit {
  return {
    scope: at,
    step: { step: `${name}-step` },
    committed: [
      {
        key: NOTES,
        value,
        updates: [
          { origin: { origin: `${name}-origin` }, key: NOTES, update: value, writer: 'tool' },
        ],
      },
    ],
    pending: [{ origin: { origin: `${name}-pending` }, key: DRAFT, update: 1, writer: 'tool' }],
  }
}

// --- the Cordis fixture -------------------------------------------------------------------------

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})
async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

type PrepareScript = RuntimeContextOperations<unknown>['prepareRegistration']

/** A Runtime Context service over the memory double that records every holder call. */
function runtimeContextService(
  calls: { method: string; principal: unknown; input: unknown }[],
  script: { prepare?: PrepareScript } = {},
) {
  const ports = createTestAuthorityPorts<unknown>()
  ports.bind(scopeA, A.tenant)
  class RuntimeContext extends RuntimeContextService<unknown> {
    readonly memory = createMemoryRuntimeContext<unknown>({
      authority: ports.authority,
      bindings: ports.bindings,
    })
    constructor(scope: Context) {
      super(scope)
      scope.effect(() => () => void this.memory.close())
    }
    readonly registerProducer: RuntimeContextService<unknown>['registerProducer'] = (...args) =>
      this.memory.registerProducer(...args)
    readonly prepareRegistration: RuntimeContextService<unknown>['prepareRegistration'] = (
      principal,
      change,
    ) => {
      calls.push({ method: 'prepareRegistration', principal, input: change })
      return (script.prepare ?? this.memory.prepareRegistration)(principal, change)
    }
    readonly issueEligibility: RuntimeContextService<unknown>['issueEligibility'] = (...args) =>
      this.memory.issueEligibility(...args)
    readonly revokeEligibility: RuntimeContextService<unknown>['revokeEligibility'] = (...args) =>
      this.memory.revokeEligibility(...args)
    readonly applyCommit: RuntimeContextService<unknown>['applyCommit'] = (principal, input) => {
      calls.push({ method: 'applyCommit', principal, input })
      return this.memory.applyCommit(principal, input)
    }
    readonly beginReplay: RuntimeContextService<unknown>['beginReplay'] = (...args) =>
      this.memory.beginReplay(...args)
    readonly finishReplay: RuntimeContextService<unknown>['finishReplay'] = (...args) =>
      this.memory.finishReplay(...args)
    readonly bind: RuntimeContextService<unknown>['bind'] = id => this.memory.bind(id)
  }
  return RuntimeContext
}

const coordinatorOf = (tenant: TenantId, session: string) =>
  `coordinator:${textOf(tenant)}:${session}`

async function assembled(
  options: {
    prepare?: PrepareScript
    coordinator?: Parameters<typeof createSessionContextInputPlugin<unknown>>[0]['coordinator']
    definitions?: SessionContextDefinitions
  } = {},
) {
  const ctx = new Context()
  const calls: { method: string; principal: unknown; input: unknown }[] = []
  const principals: unknown[] = []
  const rc = await mount(
    ctx,
    runtimeContextService(calls, options.prepare === undefined ? {} : { prepare: options.prepare }),
  )
  const plugin = await mount(
    ctx,
    createSessionContextInputPlugin<unknown>({
      coordinator:
        options.coordinator ??
        (async input => {
          principals.push(input)
          return succeed(coordinatorOf(input.tenant, input.session))
        }),
      definitions: options.definitions ?? definitions,
    }),
  )
  const prepare = (
    access: SessionAccess<unknown>,
    command: Extract<SessionCommand, { kind: 'create' | 'change' | 'startRun' | 'reload' }>,
  ) => ctx.get(sessionContextInputKey)!.prepare(access, command)
  return { ctx, rc, plugin, calls, principals, prepare }
}
const provides = (ctx: Context) => ctx.get(sessionContextInputKey) !== undefined

// --- loading -------------------------------------------------------------------------------------

describe('loading and stopping on real Cordis', () => {
  it('provides sessionContextInput and removes the key when the plugin stops', async () => {
    const { ctx, plugin } = await assembled()
    expect(sessionContextInputKey).toBe('sessionContextInput')
    expect(provides(ctx)).toBe(true)
    await plugin.dispose()
    expect(provides(ctx)).toBe(false)
  })

  it('stays absent while Runtime Context is absent and appears when it arrives', async () => {
    const ctx = new Context()
    await mount(
      ctx,
      createSessionContextInputPlugin<unknown>({
        coordinator: async () => succeed('coordinator'),
        definitions,
      }),
    )
    expect(provides(ctx)).toBe(false)
    await mount(ctx, runtimeContextService([]))
    expect(provides(ctx)).toBe(true)
  })

  it('goes away with Runtime Context and prepares on the provider that replaces it', async () => {
    const { ctx, rc } = await assembled()
    await rc.dispose()
    expect(provides(ctx)).toBe(false)
    const calls: { method: string; principal: unknown; input: unknown }[] = []
    await mount(ctx, runtimeContextService(calls))
    const answer = await ctx
      .get(sessionContextInputKey)!
      .prepare(A, registrationCommand(A, 'after-swap', addNotes(scopeA, A.tenant)))
    expect(answer).toHaveProperty('ok')
    expect(calls.map(call => call.method)).toEqual(['prepareRegistration'])
  })

  it('answers unavailable through a handle held after the plugin stopped', async () => {
    const { ctx, plugin, calls, principals } = await assembled()
    const held = ctx.get(sessionContextInputKey)!
    await plugin.dispose()
    const answer = await held.prepare(A, registrationCommand(A, 'held', addNotes(scopeA, A.tenant)))
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'runtime-context' } })
    expect(calls).toEqual([])
    expect(principals).toEqual([])
  })
})

// --- preparing -----------------------------------------------------------------------------------

describe('preparing a registration change', () => {
  it('prepares under the coordinator principal and hands Session one material, never applyCommit', async () => {
    const { prepare, calls, principals } = await assembled()
    const command = registrationCommand(A, 'add-notes', addNotes(scopeA, A.tenant))
    const answer = ok(await prepare(A, command), 'prepare')
    expect(answer).toHaveLength(1)
    expect(answer[0]).toMatchObject({ owner: 'runtime-context', participant: 'context-input' })
    expect(calls.map(call => call.method)).toEqual(['prepareRegistration'])
    expect(calls[0]!.principal).toBe(coordinatorOf(A.tenant, A.session))
    expect(principals).toEqual([{ tenant: A.tenant, session: A.session }])
    // The change given to Runtime Context is the encoded one, functions restored.
    expect(calls[0]!.input).toEqual(addNotes(scopeA, A.tenant))
    expect((calls[0]!.input as { bindings: NeedBinding[] }).bindings[1]).toBe(notesTool)
  })

  it('refuses a command of another tenant or session than the access before it asks anyone', async () => {
    const { prepare, calls, principals } = await assembled()
    const theirs = registrationCommand(B, 'theirs', addNotes(scopeA, B.tenant))
    expect(await prepare(A, theirs)).toEqual(fail({ kind: 'denied', action: 'change' }))
    const otherSession = { ...A, session: B.session }
    const ours = registrationCommand(A, 'ours', addNotes(scopeA, A.tenant))
    expect(await prepare(otherSession, ours)).toEqual(fail({ kind: 'denied', action: 'change' }))
    expect(calls).toEqual([])
    expect(principals).toEqual([])
  })

  it('refuses a material that names another tenant than the access, before it asks anyone', async () => {
    const { prepare, calls, principals } = await assembled()
    // The command is A's, but the encoded change registers into B's tenant.
    const command = registrationCommand(A, 'smuggled', addNotes(scopeA, B.tenant))
    expect(await prepare(A, command)).toEqual(fail({ kind: 'denied', action: 'change' }))
    expect(calls).toEqual([])
    expect(principals).toEqual([])
  })

  it('refuses a commit identity that does not derive from this change operation', async () => {
    const { prepare, calls } = await assembled()
    const command = registrationCommand(A, 'replayed', addNotes(scopeA, A.tenant), 'another')
    expect(await prepare(A, command)).toMatchObject({
      failure: { kind: 'invalid', field: 'declaration' },
    })
    expect(calls).toEqual([])
  })

  it('answers invalid for materials that do not decode, and asks nobody', async () => {
    const { prepare, calls } = await assembled()
    const good = registrationCommand(A, 'bad', addNotes(scopeA, A.tenant))
    const declaration = good.input.declaration as Extract<
      typeof good.input.declaration,
      { kind: 'context-registration' }
    >
    const foreign = changeCommand(A, 'bad', {
      ...declaration,
      binding: { schema: adoption('another-protocol'), value: declaration.binding.value },
    })
    expect(await prepare(A, foreign)).toMatchObject({ failure: { kind: 'invalid' } })
    expect(calls).toEqual([])
  })

  it('answers unavailable, not invalid, when the adopted definitions cannot answer', async () => {
    const { prepare, calls, principals } = await assembled({
      definitions: {
        binding: () => {
          throw new Error('the definition store is down')
        },
        declaration: () => {
          throw new Error('the definition store is down')
        },
      },
    })
    const unreachable = { failure: { kind: 'unavailable', owner: 'context-definitions' } }
    const command = registrationCommand(A, 'store-down', addNotes(scopeA, A.tenant))
    expect(await prepare(A, command)).toMatchObject(unreachable)
    const create: Extract<SessionCommand, { kind: 'create' }> = {
      kind: 'create',
      input: {
        tenant: A.tenant,
        session: A.session,
        operation: operationId('create-store-down'),
        creation: creation({
          initialization: {
            sources: [
              {
                kind: 'context-registration',
                owner: 'context',
                item: 'notes',
                protocol: SESSION_CONTEXT_MATERIAL,
                input: ok(
                  encodeInitialContextRegistration(
                    { definition, key: NOTES, bindings: [notesModel], parameters: undefined },
                    definitions,
                  ),
                  'encode initial',
                ),
              },
            ],
            results: [],
          },
        }),
      },
    }
    expect(await prepare(A, create)).toMatchObject(unreachable)
    expect(calls).toEqual([])
    expect(principals).toEqual([])
  })

  it('turns a rejection into invalid with each reason', async () => {
    const { prepare } = await assembled({
      prepare: async () => ({ kind: 'rejected', rejections: [{ path: ['key'], reason: 'key' }] }),
    })
    const answer = await prepare(A, registrationCommand(A, 'rejected', addNotes(scopeA, A.tenant)))
    expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'declaration' } })
    expect(JSON.stringify(answer)).toContain('key at key')
  })

  it.each([
    ['a refusal', { kind: 'refused', reason: 'unauthorized' } as const],
    ['unavailable', { kind: 'unavailable', cause: 'authority' } as const],
    ['unknown', { kind: 'unknown', cause: 'scope-binding' } as const],
  ])('turns %s into unavailable, never a material', async (_name, reply) => {
    const { prepare } = await assembled({ prepare: async () => reply })
    const answer = await prepare(A, registrationCommand(A, 'down', addNotes(scopeA, A.tenant)))
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'runtime-context' } })
  })

  it('answers unavailable when Runtime Context throws or judged another change', async () => {
    const thrown = await assembled({
      prepare: async () => {
        throw new Error('down')
      },
    })
    expect(
      await thrown.prepare(A, registrationCommand(A, 'throws', addNotes(scopeA, A.tenant))),
    ).toMatchObject({ failure: { kind: 'unavailable', owner: 'runtime-context' } })
    const other = await assembled({
      prepare: async (_principal, change) => ({
        kind: 'prepared',
        judged: { change: { ...change, basedOn: change.basedOn + 1 }, coverage: 'full' },
        currentRevision: 0,
      }),
    })
    expect(
      await other.prepare(A, registrationCommand(A, 'judged', addNotes(scopeA, A.tenant))),
    ).toMatchObject({ failure: { kind: 'unavailable', owner: 'runtime-context' } })
  })

  it('follows the coordinator principal: denied is denied, unavailable is unavailable', async () => {
    const refused = await assembled({
      coordinator: async () => fail({ kind: 'denied', action: 'coordinator' }),
    })
    expect(
      await refused.prepare(A, registrationCommand(A, 'no-principal', addNotes(scopeA, A.tenant))),
    ).toEqual(fail({ kind: 'denied', action: 'change' }))
    expect(refused.calls).toEqual([])
    const down = await assembled({
      coordinator: async () => fail({ kind: 'unavailable', owner: 'assembly', diagnostic: 'down' }),
    })
    expect(
      await down.prepare(A, registrationCommand(A, 'down-principal', addNotes(scopeA, A.tenant))),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(down.calls).toEqual([])
  })
})

describe('preparing a step commit, a creation and the other commands', () => {
  const stepCommand = (
    access: SessionAccess<unknown>,
    name: string,
    tenant: TenantId,
    encodedWith = name,
  ) =>
    changeCommand(access, name, {
      kind: 'context-step-commit',
      basis: evidence(`basis/${name}`),
      ...ok(
        encodeContextStepCommit({
          tenant,
          stepCommit: stepOf(scopeA, name, 3),
          executionEnded: false,
          operation: operationId(encodedWith),
        }),
        'encode step',
      ),
    })

  it('checks a step commit without calling Runtime Context', async () => {
    const { prepare, calls } = await assembled()
    const answer = ok(await prepare(A, stepCommand(A, 'step', A.tenant)), 'step')
    expect(answer).toHaveLength(1)
    expect(answer[0]).toMatchObject({ owner: 'runtime-context', participant: 'context-input' })
    expect(await prepare(A, stepCommand(A, 'their-step', B.tenant))).toEqual(
      fail({ kind: 'denied', action: 'change' }),
    )
    expect(await prepare(A, stepCommand(A, 'moved-step', A.tenant, 'other'))).toMatchObject({
      failure: { kind: 'invalid' },
    })
    expect(calls).toEqual([])
  })

  it('refuses a creation whose registration source does not restore, and hands no material otherwise', async () => {
    const { prepare, calls } = await assembled()
    const materials = ok(
      encodeInitialContextRegistration(
        {
          definition,
          key: NOTES,
          bindings: [notesModel],
          parameters: undefined,
          declaration: notesDeclaration,
        },
        definitions,
      ),
      'encode initial',
    )
    const create = (
      input: ContextRegistrationMaterials,
    ): Extract<SessionCommand, { kind: 'create' }> => ({
      kind: 'create',
      input: {
        tenant: A.tenant,
        session: A.session,
        operation: operationId('create'),
        creation: creation({
          initialization: {
            sources: [
              {
                kind: 'context-registration',
                owner: 'context',
                item: 'notes',
                protocol: SESSION_CONTEXT_MATERIAL,
                input,
              },
            ],
            results: [],
          },
        }),
      },
    })
    expect(await prepare(A, create(materials))).toEqual(succeed([]))
    const later = ok(
      encodeContextRegistrationChange(
        { change: addNotes(scopeA, A.tenant), definition, operation: operationId('x') },
        definitions,
      ),
      'encode change',
    )
    expect(await prepare(A, create(later))).toMatchObject({
      failure: { kind: 'invalid', field: 'creation.initialization.sources[0]' },
    })
    expect(calls).toEqual([])
  })

  it('hands no material for a change of another declaration, startRun and reload', async () => {
    const { prepare, calls } = await assembled()
    const model = changeCommand(A, 'model', { kind: 'model', name: 'm', basis: evidence('m') })
    expect(await prepare(A, model)).toEqual(succeed([]))
    expect(calls).toEqual([])
  })
})

// --- the encoders ---------------------------------------------------------------------------------

describe('the encoders', () => {
  it('refuse a binding or a declaration that the adopted definition does not give back', () => {
    const copied = { ...notesTool }
    expect(
      encodeContextRegistrationChange(
        {
          change: { ...addNotes(scopeA, A.tenant), bindings: [copied] },
          definition,
          operation: operationId('c'),
        },
        definitions,
      ),
    ).toHaveProperty('failure')
    expect(
      encodeContextRegistrationChange(
        {
          change: { ...addNotes(scopeA, A.tenant), declaration: stateful(NOTES, 'checkpointed') },
          definition,
          operation: operationId('c'),
        },
        definitions,
      ),
    ).toHaveProperty('failure')
  })

  it('refuse a step value that is not JSON data', () => {
    const step = stepOf(scopeA, 'nan', Number.NaN)
    expect(
      encodeContextStepCommit({
        tenant: A.tenant,
        stepCommit: step,
        executionEnded: false,
        operation: operationId('n'),
      }),
    ).toHaveProperty('failure')
  })

  it('derive distinct commit identities per domain, scope, operation and key', () => {
    const operation = operationId('op')
    const texts = [
      contextChangeCommit({ scope: scopeA, operation, key: NOTES }).commit,
      contextChangeCommit({ scope: scopeA, operation, key: DRAFT }).commit,
      contextChangeCommit({ scope: scopeRef('session-scope:b'), operation, key: NOTES }).commit,
      contextStepCommit({ scope: scopeA, operation }).commit,
      contextScopeEndCommit({ scope: scopeA.ref, operation }).commit,
    ]
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts[3]).toBe(`["session-context-step","1","session-scope:a","${operation}"]`)
  })
})

// --- the translation on real Session entries ------------------------------------------------------

/** A JSON tree of a plain value, for entries this test writes by hand. */
function tree(plain: unknown): JsonValue {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(plain as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value: tree(value) })),
  }
}

/**
 * A session in the memory transaction port that goes through the real Session decision: a creation
 * with one registration source, its completion (initial SE07), a later registration change, a step
 * commit and, unless `archive` is false, the archive (SE27). Returns the history read after these
 * commits, the port, and the values that went in.
 */
async function sessionLog(options: Readonly<{ archive?: boolean }> = {}) {
  const access = memoryAccess<string>('tester')
  const base = { tenant: access.tenant, session: access.session }
  const source = createMemoryInitializationSource()
  const accessCheck = createPolicySessionAccessCheck<string>(() => ({
    kind: 'allowed',
    evidence: evidence('access'),
  }))
  const port = createMemorySessionTransactions<string>({ initialization: source, accessCheck })
  const initial = ok(
    encodeInitialContextRegistration(
      {
        definition,
        key: NOTES,
        bindings: [notesModel],
        parameters: undefined,
        declaration: notesDeclaration,
      },
      definitions,
    ),
    'encode initial',
  )
  const create: Extract<SessionCommand, { kind: 'create' }> = {
    kind: 'create',
    input: {
      ...base,
      operation: operationId('create'),
      creation: creation({
        initialization: {
          sources: [
            {
              kind: 'context-registration',
              owner: 'context',
              item: 'notes',
              protocol: SESSION_CONTEXT_MATERIAL,
              input: initial,
            },
          ],
          results: [],
        },
      }),
    },
  }
  const createFacts = initializationFixtureFacts(
    create,
    null,
    adoptedInitializationFixture(create),
    [],
  )
  source.controls.register(create, initializationFixtureGuard(createFacts))
  succeeded(
    await port.commit({
      access,
      command: create,
      guards: succeeded(await source.prepare(create), 'g'),
    }),
    'create',
  )
  const created = succeeded(await port.readWork(access), 'snapshot')
  const scopeText = created.contextScopes?.[0]?.scope
  if (scopeText === undefined) throw new Error('fixture: no scope')
  const scope = scopeRef(scopeText)

  const complete: Extract<SessionCommand, { kind: 'completeInitialization' }> = {
    kind: 'completeInitialization',
    input: {
      ...base,
      operation: operationId('complete-notes'),
      result: {
        owner: 'context',
        item: 'notes',
        result: { kind: 'ready', evidence: evidence('ready/notes') },
      },
    },
  }
  const initialCommit = initializationRegistrationCommit({
    ...base,
    createOperation: create.input.operation,
    owner: 'context',
    item: 'notes',
  })
  const outcome: InitializationGuardResult = {
    owner: 'context',
    item: 'notes',
    result: complete.input.result,
    consequence: {
      kind: 'context-registration',
      prepared: evidence('prepared/notes'),
      decision: {
        scope: scopeText,
        tenant: textOf(access.tenant),
        key: NOTES,
        commit: initialCommit,
        basedOn: 0,
        revision: 1,
        creating: true,
        required: true,
        ...initial,
      },
    },
  }
  const completeFacts = initializationFixtureFacts(complete, created, null, [outcome])
  source.controls.register(complete, initializationFixtureGuard(completeFacts))
  succeeded(
    await port.commit({
      access,
      command: complete,
      guards: succeeded(await source.prepare(complete), 'g'),
    }),
    'complete',
  )

  const later: RegistrationChange = {
    kind: 'add',
    scope,
    tenant: access.tenant,
    key: DRAFT,
    basedOn: 1,
    creating: false,
    bindings: [draftModel],
    parameters: { limit: 2, labels: ['a', 'b'] },
    required: false,
    declaration: draftDeclaration,
  }
  const laterOperation = operationId('add-draft')
  const laterMaterials = ok(
    encodeContextRegistrationChange(
      { change: later, definition, operation: laterOperation },
      definitions,
    ),
    'encode later',
  )
  succeeded(
    await port.commit({
      access,
      command: {
        kind: 'change',
        input: {
          ...base,
          operation: laterOperation,
          declaration: {
            kind: 'context-registration',
            registration: evidence('prepared/draft'),
            ...laterMaterials,
          },
        },
      },
      guards: [],
    }),
    'change registration',
  )

  const step = stepOf(scope, 'first', 5)
  const stepOperation = operationId('step-first')
  succeeded(
    await port.commit({
      access,
      command: {
        kind: 'change',
        input: {
          ...base,
          operation: stepOperation,
          declaration: {
            kind: 'context-step-commit',
            basis: evidence('basis/first'),
            ...ok(
              encodeContextStepCommit({
                tenant: access.tenant,
                stepCommit: step,
                executionEnded: true,
                operation: stepOperation,
              }),
              'encode step',
            ),
          },
        },
      },
      guards: [],
    }),
    'change step',
  )
  const archive = operationId('archive')
  const archiveNow = async () =>
    succeeded(
      await port.commit({
        access,
        command: {
          kind: 'control',
          input: { ...base, operation: archive, intent: { kind: 'archive' } },
        },
        guards: [],
      }),
      'archive',
    )
  if (options.archive !== false) await archiveNow()
  const history = succeeded(
    await port.history.begin({
      ...access,
      kinds: [
        'session.context-registration-changed',
        'session.recovery-input-adopted',
        'session.archived',
      ],
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    }),
    'history',
  )
  if (!history.exhausted) throw new Error('fixture: one page')
  return {
    access,
    port,
    scope,
    entries: history.entries,
    initialCommit,
    later,
    laterOperation,
    step,
    stepOperation,
    archive,
    archiveNow,
  }
}

describe('the translation of committed Session entries', () => {
  it('gives back the initial registration, the later change, the step commit and the scope end', async () => {
    const log = await sessionLog()
    const translation = createSessionContextTranslation(definitions)
    const inputs = log.entries.map(entry => ok(translation.commitOf(entry), entry.kind))
    const expected: CommitInput[] = [
      {
        kind: 'registration',
        commit: { commit: log.initialCommit },
        change: {
          kind: 'add',
          scope: log.scope,
          tenant: log.access.tenant,
          key: NOTES,
          basedOn: 0,
          creating: true,
          bindings: [notesModel],
          parameters: undefined,
          required: true,
          declaration: notesDeclaration,
        },
      },
      {
        kind: 'registration',
        commit: contextChangeCommit({
          scope: log.scope,
          operation: log.laterOperation,
          key: DRAFT,
        }),
        change: log.later,
      },
      {
        kind: 'step',
        commit: contextStepCommit({ scope: log.scope, operation: log.stepOperation }),
        tenant: log.access.tenant,
        stepCommit: log.step,
        executionEnded: true,
      },
      {
        kind: 'scope',
        commit: contextScopeEndCommit({ scope: log.scope.ref, operation: log.archive }),
        scope: log.scope,
        tenant: log.access.tenant,
        scopeEnded: true,
      },
    ]
    expect(inputs).toEqual(expected)
    // The functions come back from the adopted definition, not as copies.
    const first = inputs[0] as Extract<CommitInput, { kind: 'registration' }>
    expect(first.change.kind === 'add' && first.change.declaration).toBe(notesDeclaration)
    expect(new Set(translation.kinds)).toEqual(new Set(log.entries.map(entry => entry.kind)))
  })

  it('gives null for the end of a scope that it has no record of, and for other entries', async () => {
    const log = await sessionLog()
    const archived = log.entries.find(entry => entry.kind === 'session.archived')!
    const fresh = createSessionContextTranslation(definitions)
    expect(fresh.commitOf(archived)).toEqual(succeed(null))
    const other: HistoryEntry = { ...archived, kind: 'session.model-selected' }
    expect(fresh.commitOf(other)).toEqual(succeed(null))
  })

  it('fails, never guesses, on a record it cannot restore', async () => {
    const log = await sessionLog()
    const [initial, later] = log.entries
    const translation = createSessionContextTranslation(definitions)
    // An initial registration recorded under another scope than its SE07 decision names.
    const misplaced: HistoryEntry = {
      ...initial!,
      payload: rewrite(initial!.payload, 'scope', tree('session-scope:elsewhere')),
    }
    expect(translation.commitOf(misplaced)).toHaveProperty('failure')
    // A definition that no longer gives back the binding.
    const forgetful = createSessionContextTranslation({ ...definitions, binding: () => undefined })
    expect(forgetful.commitOf(initial!)).toHaveProperty('failure')
    // A later registration recorded under another scope than its material names.
    const moved: HistoryEntry = {
      ...later!,
      payload: rewrite(later!.payload, 'scope', tree('session-scope:elsewhere')),
    }
    expect(translation.commitOf(moved)).toHaveProperty('failure')
    // A step commit recorded under another scope than its head names.
    const step = log.entries.find(entry => entry.kind === 'session.recovery-input-adopted')!
    const strayStep: HistoryEntry = {
      ...step,
      payload: rewrite(step.payload, 'scope', tree('session-scope:elsewhere')),
    }
    expect(translation.commitOf(strayStep)).toHaveProperty('failure')
    // A payload that is not a JSON tree.
    expect(
      translation.commitOf({ ...later!, payload: { kind: 'object' } as never }),
    ).toHaveProperty('failure')
  })

  it('fails on a scope that two records name with two tenants', async () => {
    const log = await sessionLog()
    const step = log.entries.find(entry => entry.kind === 'session.recovery-input-adopted')!
    const translation = createSessionContextTranslation(definitions)
    ok(translation.commitOf(step), 'step')
    const theirs: HistoryEntry = {
      ...step,
      payload: rewrite(
        step.payload,
        'declaration',
        tree({
          kind: 'context-step-commit',
          basis: evidence('basis/theirs'),
          ...ok(
            encodeContextStepCommit({
              tenant: B.tenant,
              stepCommit: log.step,
              executionEnded: false,
              operation: log.stepOperation,
            }),
            'encode',
          ),
        }),
      ),
    }
    expect(translation.commitOf(theirs)).toHaveProperty('failure')
  })
})

describe('the scope-to-tenant derivative of the translation', () => {
  it('fails the end of a scope whose tenant it evicted, and keeps null for a scope it never saw', async () => {
    const log = await sessionLog()
    const [initial] = log.entries
    const step = log.entries.find(entry => entry.kind === 'session.recovery-input-adopted')!
    const archived = log.entries.find(entry => entry.kind === 'session.archived')!
    // A step commit of another scope: with room for one scope, it evicts the scope of the log.
    const other = scopeRef('session-scope:other')
    const elsewhere: HistoryEntry = {
      ...step,
      payload: rewrite(
        rewrite(step.payload, 'scope', tree(other.ref)),
        'declaration',
        tree({
          kind: 'context-step-commit',
          basis: evidence('basis/other'),
          ...ok(
            encodeContextStepCommit({
              tenant: log.access.tenant,
              stepCommit: { ...log.step, scope: other },
              executionEnded: false,
              operation: log.stepOperation,
            }),
            'encode',
          ),
        }),
      ),
    }
    const small = createSessionContextTranslation(definitions, { scopeTenants: 1 })
    ok(small.commitOf(initial!), 'initial')
    ok(small.commitOf(elsewhere), 'elsewhere')
    expect(small.commitOf(archived)).toHaveProperty('failure')
    // Read again from the start, as the holder does: the tenant is learnt again and the end applies.
    ok(small.commitOf(initial!), 'initial again')
    expect(ok(small.commitOf(archived), 'end')).toMatchObject({ kind: 'scope', scope: log.scope })
    // A scope that no record named still ends as null.
    expect(
      createSessionContextTranslation(definitions, { scopeTenants: 1 }).commitOf(archived),
    ).toEqual(succeed(null))
  })
})

/** The payload with one top-level member replaced. */
function rewrite(payload: JsonValue, key: string, value: JsonValue): JsonValue {
  if (payload.kind !== 'object') throw new Error('fixture: payload')
  return {
    kind: 'object',
    entries: payload.entries.map(entry => (entry.key === key ? { key, value } : entry)),
  }
}
