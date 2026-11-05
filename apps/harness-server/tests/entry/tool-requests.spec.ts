// 可信 Tool 请求供给者（R2-D36 第 2、3 点，Tool B 段）：五个来源（核验器、Catalog、会话快照、可信作用域绑定、
// 发行快照）每次现取；任一缺席或不符都答 unavailable 或 denied，跨租户被拒。供给的请求经 Tool 公开判定通过，
// 且定义、consumer、参数都是准入动作的原样。
import { Service, type Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionFaces, WorkSnapshot } from '@omne-harness/session-contract'
import { SessionService } from '@omne-harness/session-cordis-contract/cordis'
import type {
  ToolAvailability,
  ToolCatalog,
  ToolDefinition,
  ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  deriveDefinition,
  judgeToolDefinition,
  judgeToolInvokeRequest,
} from '@omne-harness/tool-contract/provider'
import { filesToolModule, shellToolModule } from '@omne-harness/tool-definitions'
import { sessionWorkIssuerOf } from '../../src/entry/principals.ts'
import { releaseOf } from '../../src/entry/tool-release.ts'
import { governanceOf } from '../../src/entry/tool-release-manifest.ts'
import {
  createReleaseToolRequests,
  releaseToolRequestsOf,
  type ReleaseToolRequests,
  type ToolRequestPorts,
} from '../../src/entry/tool-requests.ts'
import { toolRuntimeHolder } from '../../src/rows/tool-runtime/holder.ts'
import { RELEASE_TOOL_SCOPE } from '../../src/rows/tool-runtime/scope.ts'
import { TEST_CONSTRUCTION, entryOf, releaseFixture, tree } from '../rows/tool-host/support.ts'
import { fixtureTenant, okOf } from './support.ts'

const SCOPE = okOf(decodeScopeRef({ ref: 'session-scope:tool-b-test' }), 'scope')
const TENANT_A = fixtureTenant('a')
const TENANT_B = fixtureTenant('b')

function json(text: string): JsonValue {
  const read = readJsonText(text, {
    maxBytes: 4096,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 64,
    maxStringLength: 1024,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('fixture: not JSON')
  return read.value
}

async function world() {
  const fixture = await releaseFixture()
  const release = releaseOf(fixture.root)
  if (release.kind !== 'trusted') throw new Error('fixture: release snapshot unavailable')
  const definitions = new Map<string, ToolDefinition>()
  const facts = {
    Shell: okOf(shellToolModule.createAuthor(tree(TEST_CONSTRUCTION.Shell)), 'Shell').facts,
    Files: okOf(filesToolModule.createAuthor(tree(TEST_CONSTRUCTION.Files)), 'Files').facts,
  }
  for (const name of ['Shell', 'Files'] as const)
    definitions.set(
      name,
      okOf(
        judgeToolDefinition(
          deriveDefinition(governanceOf(entryOf(fixture.manifest, name)), facts[name]),
        ),
        'definition',
      ),
    )
  const issue = sessionWorkIssuerOf(fixture.env)
  const principalA = okOf(issue({ tenant: TENANT_A, session: 'ses-a' }), 'issue A')
  const principalB = okOf(issue({ tenant: TENANT_B, session: 'ses-b' }), 'issue B')
  const catalog: ToolCatalog<unknown> = {
    inspect: async input => {
      const definition = definitions.get(input.name)
      if (definition === undefined)
        return fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' })
      const availability: ToolAvailability = {
        kind: 'available',
        definition,
        executor: entryOf(fixture.manifest, input.name).module.executor,
        layer: { kind: 'official' },
      }
      return succeed(availability)
    },
    usage: async () => fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unused' }),
    search: async () => fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'unused' }),
  }
  const snapshot = {
    contextScopes: [{ generation: '1', scope: SCOPE.ref, operation: 'op-1', ended: null }],
  } as unknown as WorkSnapshot
  const bindings: ScopeBindingSource = {
    lookup: async scope =>
      scope.ref === SCOPE.ref ? { kind: 'bound', tenant: TENANT_A } : { kind: 'unbound' },
  }
  const ports: ToolRequestPorts = {
    verifier: () => fixture.root.get('principalVerifier'),
    catalog: () => catalog,
    readWork: async () => succeed(snapshot),
    scopeBinding: () => bindings,
    release: () => releaseOf(fixture.root),
  }
  return { fixture, ports, principalA, principalB, snapshot, definitions }
}

const EXECUTE = '{"command":"execute","params":{"script":"echo tool-b"}}'

function actionInput(principal: unknown, tenant = TENANT_A, name = 'Shell', args = EXECUTE) {
  return {
    principal,
    tenant,
    execution: 'exec-1',
    action: 'step-1/tool/0',
    original: {
      kind: 'tool_call',
      id: 'block-1',
      visibility: 'model',
      callId: 'call-1',
      name,
      arguments: json(args),
    },
    effectiveArguments: args,
    consumer: {
      owner: '@omne-harness/agent',
      work: 'exec-1',
      position: 'step-1/tool/0',
      purpose: 'action',
    },
  } as unknown as Parameters<ReturnType<typeof createReleaseToolRequests>['describe']>[0]
}

async function prepared(ports: ToolRequestPorts, principal: unknown, tenant = TENANT_A) {
  return preparedBy(createReleaseToolRequests(ports), principal, tenant)
}

async function preparedBy(source: ReleaseToolRequests, principal: unknown, tenant = TENANT_A) {
  const input = actionInput(principal, tenant)
  const described = await source.describe(input)
  if ('failure' in described) return described
  if (described.ok.kind === 'answered') throw new Error(`describe answered: ${described.ok.text}`)
  return source.prepare({
    ...input,
    definition: described.ok.definition,
    admission: { owner: 'test', record: 'admission', revision: '1', digest: 'd' },
  })
}

describe('the trusted Tool request source', () => {
  it('selects the command from the call: a known command routes there, any other call is answered with the guide', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests(ports)
    const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
    const request = async (args: string) => {
      const input = actionInput(principalA, TENANT_A, 'Shell', args)
      const described = await source.describe(input)
      if ('failure' in described || described.ok.kind === 'answered') return described
      return source.prepare({ ...input, definition: described.ok.definition, admission })
    }
    // The command codec judges the rest of the call when the tool runs, so a bad call still routes.
    expect(await request('{"command":"info","params":{}}')).toMatchObject({
      ok: { command: 'info' },
    })
    expect(await request('{"command":"info","params":[]}')).toMatchObject({
      ok: { command: 'info' },
    })
    // A call that names no command is not run: the source answers it with the guide (D-104).
    const unknown = await request('{"command":"nope"}')
    expect(unknown).toMatchObject({ ok: { kind: 'answered' } })
    const text = 'ok' in unknown && 'text' in unknown.ok ? unknown.ok.text : ''
    expect(text.split('\n')[0]).toBe('Shell: there is no command "nope".')
    expect(text).toContain('\nexecute {script, terminal?')
    expect(await request('{"script":"echo"}')).toMatchObject({
      ok: {
        kind: 'answered',
        text: expect.stringMatching(/^Shell: the arguments name no command\./),
      },
    })
    // A command is never read from the declared name.
    expect(await source.describe(actionInput(principalA, TENANT_A, 'Shell.execute'))).toMatchObject(
      {
        failure: { kind: 'unavailable' },
      },
    )
  })

  it('prepares the complete request of the admitted action, and it passes the public Tool judgement', async () => {
    const { ports, principalA, definitions } = await world()
    const answer = await prepared(ports, principalA)
    const request = okOf(answer, 'prepare') as ToolInvokeRequest
    expect(okOf(judgeToolInvokeRequest(request), 'judge')).toBeDefined()
    expect(request).toMatchObject({
      command: 'execute',
      arguments: {
        original: EXECUTE,
        effective: EXECUTE,
        complete: true,
      },
      requesterScope: SCOPE,
      scope: RELEASE_TOOL_SCOPE,
      workspace: null,
      resources: [],
      mode: 'foreground',
      consumer: { owner: '@omne-harness/agent', work: 'exec-1', purpose: 'action' },
    })
    expect(request.availability.definition.adoption).toEqual(definitions.get('Shell')?.adoption)
    expect(request.environment).toEqual(definitions.get('Shell')?.declarations.environment)
  })

  it('answers unavailable when the principal verifier is absent (authorization source missing)', async () => {
    const { ports, principalA } = await world()
    expect(await prepared({ ...ports, verifier: () => undefined }, principalA)).toMatchObject({
      failure: { kind: 'unavailable', owner: 'agentToolRequests' },
    })
  })

  it('answers denied for a principal the verifier does not trust', async () => {
    const { ports, principalA } = await world()
    expect(await prepared(ports, structuredClone(principalA))).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  it('denies a verified principal that names a session but was issued for another component (N3)', async () => {
    const { fixture, ports } = await world()
    const issuer = fixture.env
      .readTrusted(principalIssuerKey)
      .get(principalIssuerKey) as PrincipalIssuer
    const actor = okOf(issuer.issueSystem({ component: 'notSessionWork' }), 'actor')
    const other = okOf(
      issuer.issueActingForTenant({
        actor,
        tenant: TENANT_A,
        work: { owner: 'session', work: 'ses-a' },
      }),
      'principal',
    )
    expect(await prepared(ports, other)).toMatchObject({ failure: { kind: 'denied' } })
  })

  it('answers unavailable without the catalog', async () => {
    const { ports, principalA } = await world()
    expect(await prepared({ ...ports, catalog: () => undefined }, principalA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'tool catalog absent' },
    })
  })

  it('answers unavailable without the trusted scope binding, and denied for an unbound scope', async () => {
    const { ports, principalA } = await world()
    expect(await prepared({ ...ports, scopeBinding: () => undefined }, principalA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'execution scope binding absent' },
    })
    expect(
      await prepared(
        { ...ports, scopeBinding: () => ({ lookup: async () => ({ kind: 'unbound' }) }) },
        principalA,
      ),
    ).toMatchObject({ failure: { kind: 'denied', action: 'tool-request-scope' } })
  })

  it('answers unavailable when the session has no current context scope', async () => {
    const { ports, principalA, snapshot } = await world()
    const ended = {
      ...snapshot,
      contextScopes: [{ generation: '1', scope: SCOPE.ref, operation: 'op-1', ended: {} }],
    } as unknown as WorkSnapshot
    expect(
      await prepared({ ...ports, readWork: async () => succeed(ended) }, principalA),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(
      await prepared(
        { ...ports, readWork: async () => succeed({ ...snapshot, contextScopes: [] }) },
        principalA,
      ),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(await prepared({ ...ports, readWork: () => undefined }, principalA)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'session absent' },
    })
  })

  it('answers unavailable without a trusted release snapshot', async () => {
    const { ports, principalA } = await world()
    expect(
      await prepared(
        { ...ports, release: () => ({ kind: 'unavailable', diagnostic: 'test' }) },
        principalA,
      ),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'release snapshot unavailable' },
    })
  })

  it('refuses another tenant: a verified principal of tenant B for tenant A, and a scope bound to B', async () => {
    const { ports, principalB, principalA } = await world()
    expect(await prepared(ports, principalB, TENANT_A)).toMatchObject({
      failure: { kind: 'denied' },
    })
    const toB: ScopeBindingSource = { lookup: async () => ({ kind: 'bound', tenant: TENANT_B }) }
    expect(await prepared({ ...ports, scopeBinding: () => toB }, principalA)).toMatchObject({
      failure: { kind: 'denied', action: 'tool-request-scope' },
    })
  })

  it('answers unavailable for a name outside the release, and when the definition changed since describe', async () => {
    const { ports, principalA, definitions } = await world()
    const source = createReleaseToolRequests(ports)
    expect(await source.describe(actionInput(principalA, TENANT_A, 'Other'))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const input = actionInput(principalA)
    const other = definitions.get('Files')?.adoption
    if (other === undefined) throw new Error('fixture: Files definition')
    expect(
      await source.prepare({
        ...input,
        definition: other,
        admission: { owner: 'test', record: 'admission', revision: '1', digest: 'd' },
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

/**
 * A Session service on the root whose `work` face records the caller class it was read for (the
 * intercept configuration of the caller, as the Session provider reads it) and answers `snapshot`.
 */
function recordingSession(snapshot: WorkSnapshot, callers: unknown[]) {
  class RecordingSession extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      const config: unknown = this[Service.resolveConfig]()
      callers.push(
        typeof config === 'object' && config !== null ? Reflect.get(config, 'caller') : undefined,
      )
      return { readWork: async () => succeed(snapshot) } as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  return { name: 'fixture-session', apply: (ctx: Context) => void new RecordingSession(ctx) }
}

describe('the release composition releaseToolRequestsOf on a real Cordis root (R2-D189 N1)', () => {
  it('reads the session as the coordinator caller and the scope binding under executionScopeBinding', async () => {
    const { fixture, ports, principalA, snapshot } = await world()
    const callers: unknown[] = []
    await fixture.root.plugin(recordingSession(snapshot, callers))
    fixture.root.provide(toolCatalogKey, ports.catalog())
    fixture.root.provide(executionScopeBindingKey, ports.scopeBinding())
    // What the entry object `toolClock` hands over: its trusted verifier read (R2-D203 P-9).
    toolRuntimeHolder(fixture.root).verifier = ports.verifier
    const request = okOf(
      await preparedBy(releaseToolRequestsOf(fixture.root), principalA),
      'prepare',
    ) as ToolInvokeRequest
    expect(okOf(judgeToolInvokeRequest(request), 'judge')).toBeDefined()
    expect(request.requesterScope).toEqual(SCOPE)
    expect(callers.length).toBeGreaterThan(0)
    expect(new Set(callers)).toEqual(new Set(['coordinator']))
  })
})
