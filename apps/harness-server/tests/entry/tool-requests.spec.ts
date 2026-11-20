import { Service, type Context } from '@deepseek-ai/cordis'
import { switchWorkspaceToolModule } from '@omne-harness/workspace-tools'
import { describe, expect, it } from 'vitest'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { workspaceCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { WorkingDirectory } from '@omne-harness/session-adapters'
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
import {
  askToolModule,
  filesToolModule,
  shellToolModule,
  todoItemsToolModule,
  toolsToolModule,
} from '@omne-harness/tool-definitions'
import { sessionWorkIssuerOf } from '../../src/entry/principals.ts'
import { releaseOf } from '../../src/entry/tool-release.ts'
import { governanceOf } from '../../src/entry/tool-release-manifest.ts'
import {
  createReleaseToolRequests,
  releaseToolRequestsOf,
  TOOL_REQUESTS_OWNER,
  type ReleaseToolRequests,
  type ToolRequestPorts,
} from '../../src/entry/tool-requests.ts'
import { ToolOperatorSettingsImpl } from '../../src/rows/tool-host/operator-settings.ts'
import { toolRuntimeHolder } from '../../src/rows/tool-runtime/holder.ts'
import { runToolScope } from '../../src/rows/tool-runtime/scope.ts'
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
    Ask: okOf(askToolModule.createAuthor(tree(TEST_CONSTRUCTION.Ask)), 'Ask').facts,
    TodoItems: okOf(
      todoItemsToolModule.createAuthor(tree(TEST_CONSTRUCTION.TodoItems)),
      'TodoItems',
    ).facts,
    Tools: okOf(toolsToolModule.createAuthor(tree(TEST_CONSTRUCTION.Tools)), 'Tools').facts,
    SwitchWorkspace: okOf(
      switchWorkspaceToolModule.createAuthor(tree({ resultMaxBytes: 4096 })),
      'SwitchWorkspace',
    ).facts,
  }
  for (const name of ['Shell', 'Files', 'Ask', 'TodoItems', 'Tools', 'SwitchWorkspace'] as const)
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
    operatorSettings: () => ({}),
    interaction: async () => succeed({ humanInteraction: true }),
    workingDirectory: async () => succeed({ state: 'default', directory: '/srv/default' }),
  }
  return { fixture, ports, principalA, principalB, snapshot, definitions }
}

const EXECUTE = '{"command":"execute","intent":"test call","params":{"script":"echo tool-b"}}'
const LIST_TODOS = '{"command":"list","params":{}}'
const SEARCH_TOOLS = '{"command":"search","params":{"query":"echo"}}'

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

function parsedWorkspace(text: string) {
  const parsed = workspaceCodec.parse(text)
  return parsed.ok ? succeed(parsed.value) : fail('not a workspace')
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
    expect(await request('{"command":"info","params":{}}')).toMatchObject({
      ok: { command: 'info' },
    })
    expect(await request('{"command":"info","params":[]}')).toMatchObject({
      ok: { command: 'info' },
    })
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
    expect(await source.describe(actionInput(principalA, TENANT_A, 'Shell.execute'))).toMatchObject(
      {
        failure: { kind: 'unavailable' },
      },
    )
  })

  it('answers an execute without an intent with the usage, and never prepares it (C5)', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests(ports)
    const describe = (args: string) =>
      source.describe(actionInput(principalA, TENANT_A, 'Shell', args))
    const missing = await describe('{"command":"execute","params":{"script":"pnpm build"}}')
    expect(missing).toMatchObject({ ok: { kind: 'answered' } })
    const text = 'ok' in missing && 'text' in missing.ok ? missing.ok.text : ''
    expect(text.split('\n')[0]).toBe(
      'Shell: "execute" needs "intent": one line saying why you make this call.',
    )
    expect(text).toContain(
      'Usage: Shell {"command": "execute", "intent": "<one line: why you make this call>", "params": {script',
    )
    const multiline = await describe(
      '{"command":"execute","intent":"one\\ntwo","params":{"script":"pnpm build"}}',
    )
    expect(multiline).toMatchObject({
      ok: { kind: 'answered', text: expect.stringMatching(/^Shell: "intent" must be one line/) },
    })
  })

  it('fixes the label of the call from the envelope: intent, tool, command and preview (C2)', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests(ports)
    const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
    const labelOf = async (args: string) => {
      const input = actionInput(principalA, TENANT_A, 'Shell', args)
      const described = await source.describe(input)
      if ('failure' in described || described.ok.kind === 'answered') throw new Error('describe')
      const answer = await source.prepare({
        ...input,
        definition: described.ok.definition,
        admission,
      })
      return (okOf(answer, 'prepare') as ToolInvokeRequest).label
    }
    expect(
      await labelOf(
        '{"command":"execute","intent":"build the front end","params":{"script":"pnpm build\\nls"}}',
      ),
    ).toEqual({
      intent: 'build the front end',
      tool: 'Shell',
      command: 'execute',
      preview: 'pnpm build',
    })
    expect(await labelOf('{"command":"info","params":{}}')).toEqual({
      intent: null,
      tool: 'Shell',
      command: 'info',
      preview: '',
    })
  })

  it('reads the time limits from the Shell settings before admission (C6)', async () => {
    const { ports, principalA } = await world()
    const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
    const limitsOf = async (args: string, operator = ports.operatorSettings) => {
      const source = createReleaseToolRequests({ ...ports, operatorSettings: operator })
      const input = actionInput(principalA, TENANT_A, 'Shell', args)
      const described = await source.describe(input)
      if ('failure' in described || described.ok.kind === 'answered') throw new Error('describe')
      return source.prepare({ ...input, definition: described.ok.definition, admission })
    }
    const once = '{"command":"execute","intent":"build","params":{"script":"pnpm build"}}'
    const terminal =
      '{"command":"execute","intent":"build","params":{"script":"pnpm build","terminal":{"id":"t","generation":"g"}}}'
    const limits = (answer: Awaited<ReturnType<typeof limitsOf>>) =>
      (okOf(answer, 'prepare') as ToolInvokeRequest).limits
    expect(limits(await limitsOf(once))).toEqual({
      concurrency: null,
      scopeBudget: null,
      foregroundMs: null,
      backgroundAfterMs: 60_000,
    })
    const lowered = () => ({ backgroundAfterMs: 1500, foregroundMs: 9000 })
    expect(limits(await limitsOf(once, lowered))).toMatchObject({
      foregroundMs: 9000,
      backgroundAfterMs: 1500,
    })
    // A call that may not go to the background gets no threshold, only the foreground limit.
    expect(limits(await limitsOf(terminal, lowered))).toMatchObject({
      foregroundMs: 9000,
      backgroundAfterMs: null,
    })
    expect(await limitsOf(once, () => undefined)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await limitsOf(once, () => ({ backgroundAfterMs: 'soon' }))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await limitsOf(once, () => ({ nothing: 1 }))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('does not read operator settings for a tool that declares none', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests({
      ...ports,
      operatorSettings: () => {
        throw new Error('read')
      },
    })
    const input = actionInput(principalA, TENANT_A, 'Files', '{"command":"list","params":{}}')
    const described = await source.describe(input)
    if ('failure' in described || described.ok.kind === 'answered') throw new Error('describe')
    const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
    const answer = await source.prepare({
      ...input,
      definition: described.ok.definition,
      admission,
    })
    expect((okOf(answer, 'prepare') as ToolInvokeRequest).limits).toMatchObject({
      foregroundMs: null,
      backgroundAfterMs: null,
    })
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
      scope: runToolScope(TENANT_A, actionInput(principalA).consumer),
      workspace: null,
      directory: { path: '/srv/default', workspace: null },
      resources: [],
      mode: 'foreground',
      consumer: { owner: '@omne-harness/agent', work: 'exec-1', purpose: 'action' },
    })
    expect(request.availability.definition.adoption).toEqual(definitions.get('Shell')?.adoption)
    expect(request.environment).toEqual(definitions.get('Shell')?.declarations.environment)
  })

  it('pins the call to the working directory the coordinator reads for its session when the call is prepared', async () => {
    const { ports, principalA } = await world()
    const read: unknown[] = []
    const blog = 'wsp_00000000000000000000000001'
    const reading = (value: WorkingDirectory): ToolRequestPorts => ({
      ...ports,
      workingDirectory: async access => {
        read.push(access)
        return succeed(value)
      },
    })
    const attached = okOf(
      await prepared(
        reading({
          state: 'attached',
          workspace: blog,
          instance: 'wsi_blog',
          directory: '/srv/blog',
        }),
        principalA,
      ),
      'attached',
    ) as ToolInvokeRequest
    expect(attached.directory).toEqual({
      path: '/srv/blog',
      workspace: { id: okOf(parsedWorkspace(blog), 'workspace'), instance: 'wsi_blog' },
    })
    expect(okOf(judgeToolInvokeRequest(attached), 'judge').directory).toEqual(attached.directory)
    // It is read when the call is described, to answer a call that has none, and again to pin it.
    const access = { principal: principalA, tenant: TENANT_A, session: expect.any(String) }
    expect(read).toEqual([access, access])
  })

  it.each<[string, WorkingDirectory | null, string]>([
    [
      'the selected workspace cannot be used',
      { state: 'unusable', workspace: 'wsp_x', instance: 'wsi_x', reason: 'not-permitted' },
      'unavailable: the workspace selected for this session cannot be used now (reason: not-permitted). Nothing ran, and no other directory was used in its place. Tell the user. The call works again when the workspace can be used or when the session selects another one.',
    ],
    [
      'the working directory has no value, as after a rebuild until the next step begins',
      null,
      'unavailable: this session has no working directory in force now, because the server restarted during this step. Nothing ran. Make this call again in your next step.',
    ],
  ])(
    'answers the call, so the step goes on, and prepares nothing when %s',
    async (_name, value, text) => {
      const { ports, principalA } = await world()
      const source = createReleaseToolRequests({
        ...ports,
        workingDirectory: async () => succeed(value),
      })
      const input = actionInput(principalA)
      // Waiting here would wait for ever: the directory changes only when the next step begins.
      expect(await source.describe(input)).toEqual({ ok: { kind: 'answered', text } })
      const prepared = await source.prepare({
        ...input,
        definition: {} as never,
        admission: { owner: 'test', record: 'admission', revision: '1', digest: 'd' },
      })
      expect(prepared).toEqual({
        failure: {
          kind: 'unavailable',
          owner: TOOL_REQUESTS_OWNER,
          diagnostic: 'the call is answered, not run',
        },
      })
    },
  )

  it.each<[string, Outcome<WorkingDirectory | null, string>, string]>([
    [
      'the working directory cannot be read',
      fail('eligibility: unavailable'),
      'the working directory of the session is not readable: eligibility: unavailable',
    ],
    [
      'the working directory names a workspace that is not one',
      succeed({ state: 'attached', workspace: 'nope', instance: 'wsi_x', directory: '/srv/x' }),
      'the working directory names a workspace that is not one',
    ],
  ])('is unavailable, to be asked again, when %s', async (_name, answer, diagnostic) => {
    const { ports, principalA } = await world()
    const failure = { kind: 'unavailable', owner: TOOL_REQUESTS_OWNER, diagnostic }
    const reading = { ...ports, workingDirectory: async () => answer }
    expect(await createReleaseToolRequests(reading).describe(actionInput(principalA))).toEqual({
      failure,
    })
  })

  it.each([
    ['the forwarding tool', 'Tools', SEARCH_TOOLS],
    ['the workspace switch', 'SwitchWorkspace', '{"none":true}'],
  ])(
    'pins %s when the session has a directory, and never answers or fails it for the lack of one',
    async (_what, tool, call) => {
      const { ports, principalA } = await world()
      const directoryFor = async (answer: Outcome<WorkingDirectory | null, string>) => {
        const source = createReleaseToolRequests({ ...ports, workingDirectory: async () => answer })
        const input = actionInput(principalA, TENANT_A, tool, call)
        const described = okOf(await source.describe(input), 'describe')
        if (described.kind !== 'tool') throw new Error(`describe answered: ${described.text}`)
        const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
        const prepared = await source.prepare({
          ...input,
          definition: described.definition,
          admission,
        })
        return (okOf(prepared, 'prepare') as ToolInvokeRequest).directory
      }
      expect(await directoryFor(succeed({ state: 'default', directory: '/srv/default' }))).toEqual({
        path: '/srv/default',
        workspace: null,
      })
      const blog = {
        state: 'attached',
        workspace: 'wsp_00000000000000000000000001',
        instance: 'wsi_x',
        directory: '/srv/blog',
      }
      expect(await directoryFor(succeed(blog as WorkingDirectory))).toMatchObject({
        path: '/srv/blog',
        workspace: { instance: 'wsi_x' },
      })
      const unusable = { state: 'unusable', workspace: 'w', instance: 'i', reason: 'not-permitted' }
      for (const none of [succeed(null), succeed(unusable as WorkingDirectory), fail('read: x')])
        expect(await directoryFor(none)).toBeUndefined()
    },
  )

  it('does not read the working directory for a tool that works in no environment', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests({
      ...ports,
      workingDirectory: async () => {
        throw new Error('a tool without an environment has no directory')
      },
    })
    const input = actionInput(principalA, TENANT_A, 'TodoItems', LIST_TODOS)
    const described = okOf(await source.describe(input), 'describe')
    if (described.kind !== 'tool') throw new Error('describe answered')
    const request = okOf(
      await source.prepare({
        ...input,
        definition: described.definition,
        admission: { owner: 'test', record: 'admission', revision: '1', digest: 'd' },
      }),
      'prepare',
    ) as ToolInvokeRequest
    expect(request.environment).toBeNull()
    expect('directory' in request).toBe(false)
  })

  it('reads the wait mode from run_in_background in the call: true is a launch in the background, anything else the foreground', async () => {
    const { ports, principalA } = await world()
    const source = createReleaseToolRequests(ports)
    const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
    const modeOf = async (params: string) => {
      const args = `{"command":"execute","intent":"test call","params":${params}}`
      const input = actionInput(principalA, TENANT_A, 'Shell', args)
      const described = await source.describe(input)
      if ('failure' in described || described.ok.kind === 'answered') throw new Error('describe')
      const answer = await source.prepare({
        ...input,
        definition: described.ok.definition,
        admission,
      })
      return (okOf(answer, 'prepare') as ToolInvokeRequest).mode
    }
    expect(await modeOf('{"script":"sleep 9","run_in_background":true}')).toBe('background')
    expect(await modeOf('{"script":"sleep 9","run_in_background":false}')).toBe('foreground')
    expect(await modeOf('{"script":"sleep 9","run_in_background":"true"}')).toBe('foreground')
    expect(await modeOf('{"script":"sleep 9"}')).toBe('foreground')
    // A call that names the command but does not decode waits in the foreground; admission answers it.
    expect(await modeOf('[{"run_in_background":true}]')).toBe('foreground')
    // Admission, not the entry, refuses a terminal execution in the background.
    expect(await modeOf('{"script":"x","terminal":"t1","run_in_background":true}')).toBe(
      'background',
    )
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

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [{ title: 'Which port?', options: [{ label: '8081' }, { label: '3000' }] }],
  },
})
describe('the meta-capability host: Ask runs only while the session lets the model ask a person', () => {
  const admission = { owner: 'test', record: 'admission', revision: '1', digest: 'd' }
  type Interaction = Readonly<{ humanInteraction: boolean }> | null

  async function hosted(interaction: () => Interaction) {
    const { ports, principalA } = await world()
    const reads: unknown[] = []
    const source = createReleaseToolRequests({
      ...ports,
      interaction: async access => {
        reads.push(access)
        const value = interaction()
        return value === null ? fail('the publication is not there') : succeed(value)
      },
    })
    const call = (name: string, args: string) => actionInput(principalA, TENANT_A, name, args)
    return { source, call, reads, principalA }
  }

  it('routes ask while the interaction is open, and reads it for the call session', async () => {
    const { source, call, reads, principalA } = await hosted(() => ({ humanInteraction: true }))
    const input = call('Ask', ASK)
    const described = await source.describe(input)
    if ('failure' in described || described.ok.kind !== 'tool') throw new Error('not a tool')
    expect(
      await source.prepare({ ...input, definition: described.ok.definition, admission }),
    ).toMatchObject({ ok: { command: 'ask' } })
    expect(reads[0]).toEqual({ principal: principalA, tenant: TENANT_A, session: 'ses-a' })
  })

  it('answers ask with its reason while the interaction is closed, and never runs it', async () => {
    const { source, call } = await hosted(() => ({ humanInteraction: false }))
    expect(await source.describe(call('Ask', ASK))).toEqual({
      ok: {
        kind: 'answered',
        text: 'Ask: the command "ask" is not available now. This session does not let you ask a person (collaboration mode). Continue without the answer, or stop and report what you need.',
      },
    })
  })

  it('judges again at prepare: an interaction closed after describe is not run', async () => {
    let open = true
    const { source, call } = await hosted(() => ({ humanInteraction: open }))
    const input = call('Ask', ASK)
    const described = await source.describe(input)
    if ('failure' in described || described.ok.kind !== 'tool') throw new Error('not a tool')
    open = false
    expect(
      await source.prepare({ ...input, definition: described.ok.definition, admission }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('answers unavailable when the interaction cannot be read, and does not read it for other tools', async () => {
    const { source, call, reads } = await hosted(() => null)
    expect(await source.describe(call('Ask', ASK))).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic:
          'the human interaction of the session is unreadable: the publication is not there',
      },
    })
    reads.length = 0
    expect(await source.describe(call('Shell', EXECUTE))).toMatchObject({ ok: { kind: 'tool' } })
    expect(await source.describe(call('Ask', '{"command":"nope"}'))).toMatchObject({
      ok: { kind: 'answered' },
    })
    expect(reads).toEqual([])
  })
})

describe('the release composition releaseToolRequestsOf on a real Cordis root (N1)', () => {
  it('reads the session as the coordinator caller and the scope binding under executionScopeBinding', async () => {
    const { fixture, ports, principalA, snapshot } = await world()
    const callers: unknown[] = []
    await fixture.root.plugin(recordingSession(snapshot, callers))
    fixture.root.provide(toolCatalogKey, ports.catalog())
    const looked: string[] = []
    const bindings: ScopeBindingSource = {
      lookup: async scope => {
        looked.push(scope.ref)
        return okOf(succeed(ports.scopeBinding()), 'bindings')!.lookup(scope)
      },
    }
    fixture.root.provide(executionScopeBindingKey, bindings)
    new ToolOperatorSettingsImpl(fixture.root, {})
    toolRuntimeHolder(fixture.root).verifier = ports.verifier
    const source = releaseToolRequestsOf(fixture.root)
    // This root has no service to read the working directory from: a call that needs one waits.
    expect(await preparedBy(source, principalA)).toEqual({
      failure: {
        kind: 'unavailable',
        owner: TOOL_REQUESTS_OWNER,
        diagnostic:
          'the working directory of the session is not readable: the Session or Runtime Context services are absent',
      },
    })
    const input = actionInput(principalA, TENANT_A, 'TodoItems', LIST_TODOS)
    const described = okOf(await source.describe(input), 'describe')
    if (described.kind !== 'tool') throw new Error('describe answered')
    const request = okOf(
      await source.prepare({
        ...input,
        definition: described.definition,
        admission: { owner: 'test', record: 'admission', revision: '1', digest: 'd' },
      }),
      'prepare',
    ) as ToolInvokeRequest
    expect(okOf(judgeToolInvokeRequest(request), 'judge')).toBeDefined()
    expect(request.requesterScope).toEqual(SCOPE)
    expect(looked).toEqual([SCOPE.ref])
    expect(callers.length).toBeGreaterThan(0)
    expect(new Set(callers)).toEqual(new Set(['coordinator']))
  })
})
