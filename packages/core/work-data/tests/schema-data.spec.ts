import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseData } from '../dist/index.js'
import type { DataTypes, JsonObject } from '../dist/index.js'

const limits = { maxBytes: 100_000, maxDepth: 24, maxNodes: 1_000 }
const session = { tenantId: 'tenant', sessionId: 'session' }
const agent = { ...session, incarnationId: 'incarnation' }
const user = { userId: 'user' }
const membership = { tenantId: 'tenant', userId: 'user' }
const definitionRef = { ownerTenantId: 'owner', definitionId: 'definition' }
const definition = { definition: definitionRef, version: 'v1' }
const run = { session, runId: 'run' }
const step = { run, stepId: 'step' }
const work = { tenantId: 'tenant', workId: 'work' }
const media = { tenantId: 'tenant', mediaId: 'media' }
const resource = { tenantId: 'tenant', kind: 'directory', resourceId: 'resource', version: 'v1' }
const binding = {
  implementationId: 'implementation',
  generation: 'generation',
  configurationRevision: 'configuration',
  environment: resource,
  parserVersion: 'parser-v1',
}
const action = {
  tenantId: 'tenant',
  callId: 'call',
  attemptId: 'attempt',
  owner: step,
  definition,
  toolKey: 'tool',
  commandKey: 'command',
  declarationVersion: 'declaration-v1',
  binding,
  params: { path: 'file.txt' },
  resources: [resource],
  permissions: ['files.write'],
  confirmation: 'before_effect',
  grantorKinds: ['user'],
  impact: 'writes a file',
}
const call = { owner: step, callId: 'call', attemptId: 'attempt' }
const request = { tenantId: 'tenant', requestId: 'request' }
const authorization = {
  version: 'v1',
  permissions: ['files.write'],
  resourceResolver: { resolverId: 'files', version: 'v1' },
  confirmation: 'before_effect',
  grantorKinds: ['user'],
  impactTemplate: 'writes {path}',
}
const unsupportedBackground = { mode: 'unsupported' }
const supportedBackground = {
  mode: 'supported',
  executionOwnerProtocol: { protocolId: 'execution', version: 'v1' },
  requiredResources: ['process'],
  reconnectProtocol: { protocolId: 'reconnect', version: 'v1' },
  form: 'independent_execution',
  automatic: { thresholdMs: 1_000, stopMarginMs: 50 },
}
const command = {
  commandKey: 'write',
  inputSchema: true,
  outputSchema: false,
  authorization,
  effect: 'write',
  cancellation: 'supported',
  background: unsupportedBackground,
  requiredSkills: [definition],
  environmentCapabilities: ['filesystem'],
}

const valid: { readonly [K in keyof DataTypes]: unknown } = {
  OpaqueId: 'id',
  SessionRef: session,
  AgentRef: agent,
  UserRef: user,
  MembershipRef: membership,
  DefinitionRef: definitionRef,
  DefinitionVersion: definition,
  RunRef: run,
  StepRef: step,
  WorkRef: work,
  WorkOwner: step,
  MediaRef: media,
  MediaMetadata: { media, sha256: 'a'.repeat(64), byteLength: 0, mimeType: 'text/plain', filename: 'file.txt' },
  ResourceRef: resource,
  SecretRef: { kind: 'secret_version', tenantId: 'tenant', secretId: 'secret', version: 'v1' },
  Binding: binding,
  Action: action,
  CallRef: call,
  RequestRef: request,
  Money: { integer: '-100', scale: 2, currency: 'USD' },
  OperationRef: { namespace: 'session', principalId: 'user', operationId: 'operation' },
  Decision: { request, contentVersion: 'content-v1', outcomeVersion: 'outcome-v1', actor: user, outcome: 'approve' },
  Input: { session, inputId: 'input', revision: 0, content: [{ blockId: 'block', kind: 'text', text: 'hello' }], busyBehavior: 'queue', literal: false },
  ContentBlock: { blockId: 'block', kind: 'tool_call', call, action },
  AuthorizationDeclaration: authorization,
  Command: command,
  ToolDefinition: { definition, toolKey: 'tool', commands: [command] },
  BackgroundDeclaration: supportedBackground,
  InputBlock: { blockId: 'block', kind: 'image', media, delivery: 'agent_attachment' },
}

describe('A30/A31 formal schema-backed data parsing', () => {
  it('validates every one of the 29 public DataTypes against its exact $defs entry', () => {
    const names = Object.keys(valid) as (keyof DataTypes)[]
    expect(names).toHaveLength(29)
    for (const name of names) {
      const result = parseData(name, valid[name], limits)
      expect(result, name).toMatchObject({ ok: true })
      if (result.ok && typeof result.value === 'object' && result.value !== null) {
        expect(Object.isFrozen(result.value), name).toBe(true)
      }
    }
  })

  it.each([
    ['AgentRef', { tenantId: 'tenant', sessionId: 'session' }, '/incarnationId'],
    ['SessionRef', { ...session, extra: true }, '/extra'],
    ['Money', { integer: '01', scale: 0, currency: 'USD' }, '/integer'],
    ['Decision', { request, contentVersion: 'c', outcomeVersion: 'o', actor: user, outcome: 'approve', answer: null }, '/answer'],
    ['BackgroundDeclaration', { mode: 'unsupported', requiredResources: [] }, ''],
    ['Command', { ...command, commandKey: 'help' }, '/commandKey'],
  ] satisfies readonly (readonly [keyof DataTypes, unknown, string])[])('rejects invalid %s at a stable path', (name, value, path) => {
    const result = parseData(name, value, limits)
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'schema', path }] })
  })

  it('retains strict JSON rejection before schema validation without invoking an accessor', () => {
    let calls = 0
    const value = Object.defineProperty({ tenantId: 'tenant' }, 'sessionId', {
      enumerable: true,
      get() {
        calls += 1
        return 'session'
      },
    })
    expect(parseData('SessionRef', value, limits)).toMatchObject({ ok: false, issues: [{ code: 'invalid_json', path: '/sessionId' }] })
    expect(calls).toBe(0)
  })

  it('rejects an unknown runtime type name without falling back to a top-level oneOf', () => {
    const result = parseData('Unknown' as keyof DataTypes, session, limits)
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'schema', path: '' }] })
  })

  it('does not mutate or freeze the caller input', () => {
    const input = { ...session }
    const result = parseData('SessionRef', input, limits)
    expect(result.ok).toBe(true)
    expect(Object.isFrozen(input)).toBe(false)
    if (result.ok) expect(result.value).not.toBe(input)
  })

  it.each([
    ['WorkOwner', work],
    ['Decision', { request, contentVersion: 'c', outcomeVersion: 'o', actor: user, outcome: 'answer', answer: { text: 'yes' } }],
    ['Decision', { request, contentVersion: 'c', outcomeVersion: 'o', actor: user, outcome: 'reject' }],
    ['Action', { ...action, confirmation: 'provisional', provisionalContract: resource }],
    ['AuthorizationDeclaration', { ...authorization, confirmation: 'provisional', provisionalContract: resource }],
    ['BackgroundDeclaration', unsupportedBackground],
    ['BackgroundDeclaration', {
      mode: 'supported',
      executionOwnerProtocol: supportedBackground.executionOwnerProtocol,
      requiredResources: supportedBackground.requiredResources,
      reconnectProtocol: supportedBackground.reconnectProtocol,
      form: 'independent_execution',
    }],
    ['ContentBlock', { blockId: 'text', kind: 'text', text: '' }],
    ['ContentBlock', { blockId: 'image', kind: 'image', media, delivery: 'model_native' }],
    ['ContentBlock', { blockId: 'audio', kind: 'audio', media, delivery: 'agent_attachment' }],
    ['ContentBlock', { blockId: 'video', kind: 'video', media, delivery: 'model_native' }],
    ['ContentBlock', { blockId: 'file', kind: 'file', media, delivery: 'agent_attachment' }],
    ['ContentBlock', { blockId: 'call', kind: 'tool_call', call, action }],
    ['ContentBlock', { blockId: 'result', kind: 'tool_result', call, outcome: 'unknown', value: null }],
    ['ContentBlock', { blockId: 'receipt', kind: 'deferred_receipt', call, request, continuationId: 'continuation', status: 'pending' }],
    ['InputBlock', { blockId: 'image', kind: 'image', media, delivery: 'model_native' }],
    ['InputBlock', { blockId: 'audio', kind: 'audio', media, delivery: 'model_native' }],
    ['InputBlock', { blockId: 'video', kind: 'video', media, delivery: 'model_native' }],
    ['InputBlock', { blockId: 'file', kind: 'file', media, delivery: 'model_native' }],
  ] satisfies readonly (readonly [keyof DataTypes, unknown])[])('accepts the %s union variant fixed by the formal schema', (name, value) => {
    expect(parseData(name, value, limits), `${name}: ${JSON.stringify(value)}`).toMatchObject({ ok: true })
  })

  it('does not coerce schema values, insert defaults, or remove extra properties', () => {
    const wrongScale = { integer: '100', scale: '2', currency: 'USD' }
    const extra = { ...session, extra: true }
    expect(parseData('Money', wrongScale, limits)).toMatchObject({ ok: false, issues: [{ code: 'schema', path: '/scale' }] })
    expect(parseData('SessionRef', extra, limits)).toMatchObject({ ok: false, issues: [{ code: 'schema', path: '/extra' }] })
    expect(wrongScale.scale).toBe('2')
    expect(extra.extra).toBe(true)
  })
})

describe('A30 frozen schema resources', () => {
  it.each([
    ['agent-runtime-identity.schema.json', '37393c0774f7a71ee6bf663388a2ec27821740f98b19d487b1299d39829aca74'],
    ['core-work.schema.json', '1c11b06bb94756cfea6f162173c9f4070be71bf44eb09f8ddeb3e199d579c203'],
  ])('keeps source and dist %s byte-identical to the formal artifact', async (filename, expected) => {
    for (const directory of ['src/schemas', 'dist/schemas']) {
      const bytes = await readFile(new URL(`../${directory}/${filename}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected)
    }
  })

  it('packages the exact union of schema $defs consumed by DataTypes', async () => {
    const identity = JSON.parse(await readFile(new URL('../dist/schemas/agent-runtime-identity.schema.json', import.meta.url), 'utf8')) as JsonObject
    const core = JSON.parse(await readFile(new URL('../dist/schemas/core-work.schema.json', import.meta.url), 'utf8')) as JsonObject
    const names = new Set([...Object.keys(identity.$defs as JsonObject), ...Object.keys(core.$defs as JsonObject)])
    expect(names.size).toBe(29)
    expect([...names].sort()).toEqual(Object.keys(valid).sort())
  })
})
