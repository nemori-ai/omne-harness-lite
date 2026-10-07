import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { SessionLogBackingService } from '@omne-harness-lite/session-log/cordis'
import { ToolActionHistoryService } from '@omne-harness-lite/tool-admission/cordis'
import { ResourceRecoveryAuthorityService } from '@omne-harness-lite/execution-environments/cordis'
import { createToolImplementationRegistry } from '@omne-harness-lite/tool-execution-local'
import { implementationRegistry } from '@omne-harness-lite/tool-execution-local/cordis'
import { judgeContentBlock, type ToolResultBlock } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { compareInteger, type SessionLog } from '@omne-harness-lite/session-log'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { toolResultOf } from '@omne-harness-lite/tool-definition'
import {
  prepareToolJournalEntry,
  projectToolJournal,
  type ExecutionRef,
  type ExecutionTerminal,
  type StoredToolResult,
  type ToolJournalPayload,
  type ToolResultStorageDependencies,
  type ToolResultWriter,
} from '@omne-harness-lite/tool-execution-runtime'
import { openToolResultStorage } from '../src/index.ts'
import { toolResultFiles } from '../src/cordis.ts'

const scope = {
    tenant: unwrap(parseTenantId({ organization: 'result-org', account: 'result-user' })),
    session: unwrap(parseOpaqueIdentifier('result-session', 'SessionRef')),
  },
  ref: ExecutionRef = { ...scope, callId: unwrap(parseOpaqueIdentifier('result-call', 'CallId')) },
  origin = { run: 'result-run', attempt: 1, assistantMessage: 'assistant' },
  at = '2026-10-05T04:00:00Z',
  access = Object.freeze({}) as SessionAccess,
  recovery = Object.freeze({}) as RecoveryAccess,
  result: StoredToolResult = {
    ref,
    result: toolResultOf(
      '{"stays":"text"}',
      unwrap(parseOpaqueIdentifier('result-text', 'BlockId')),
    ),
  }

function installPorts(ctx: Context, dependencies: ToolResultStorageDependencies) {
  class Access extends SessionAccessService {
    authorize = dependencies.authorization.authorize
  }
  class Backing extends SessionLogBackingService {
    get ownerGeneration() {
      return dependencies.backing.ownerGeneration
    }
    borrow() {
      return dependencies.backing.borrow()
    }
  }
  class History extends ToolActionHistoryService {
    inspect = dependencies.history.inspect
  }
  class Recovery extends ResourceRecoveryAuthorityService {
    authorizeRecovery = dependencies.recoveryAuthority.authorizeRecovery
  }
  new Access(ctx)
  new Backing(ctx)
  new History(ctx)
  new Recovery(ctx)
}

/** Real SQL journal, codecs, projection and immutable files. Authority and cross-domain history are controlled ports. */
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'omne-result-provider-')),
    directory = join(parent, 'results'),
    log = await openSqlLogFixture({ dir: join(parent, 'logs') })
  let authorized = true,
    recoveryAllowed = true,
    generation = 'first-owner'
  const readSince = vi.fn(log.readSince),
    release = vi.fn(async () => {})
  const authorize = vi.fn<SessionAccessOperations['authorize']>(async (candidate, supplied) =>
    authorized && candidate === access && JSON.stringify(supplied) === JSON.stringify(scope)
      ? {
          kind: 'authorized',
          identity: {
            binding: 'controlled',
            principal: 'user',
            principalKind: 'human',
            scope,
            consumer: 'tool',
            contextKeys: [],
          },
        }
      : { kind: 'rejected', reason: 'notAuthorized' },
  )
  const dependencies: ToolResultStorageDependencies = {
    authorization: { authorize },
    backing: {
      get ownerGeneration() {
        return generation
      },
      borrow: () => ({ log: { ...log, readSince }, release }),
    },
    recoveryAuthority: {
      authorizeRecovery: async (candidate, supplied) =>
        recoveryAllowed &&
        candidate === recovery &&
        JSON.stringify(supplied) === JSON.stringify(scope)
          ? 'authorized'
          : 'notAuthorized',
    },
    history: {
      inspect(prefix, callId) {
        if (
          compareInteger(prefix.tail, prefix.entries.length) !== 0 ||
          prefix.entries.some(
            (entry, index) =>
              compareInteger(entry.position, index + 1) !== 0 ||
              JSON.stringify(entry.tenant) !== JSON.stringify(scope.tenant),
          )
        )
          return { kind: 'unavailable' }
        const tools = projectToolJournal(prefix.scope, prefix.entries)
        if ('invalid' in tools) return { kind: 'unavailable' }
        const execution = tools.executions.get(callId)
        if (!execution) return { kind: 'notFound' }
        const selected = execution.intent.value.selected!
        type Facts = Extract<
          ReturnType<ToolResultStorageDependencies['history']['inspect']>,
          { kind: 'known' }
        >['facts']
        const call: Facts['calls'][0] = {
          id: unwrap(parseOpaqueIdentifier('call-block', 'BlockId')),
          kind: 'tool_call',
          complete: true,
          visibility: { toHuman: true, toModel: true },
          callId,
          tool: selected.definition.name,
          arguments: {},
        }
        const facts: Facts = {
          origin,
          latestAttempt: 1,
          runState: 'open',
          calls: [call],
          route: { kind: 'execution', intentKey: execution.intent.entry.dedupeKey! },
          adoption: {
            key: 'adopted',
            tools: [
              {
                name: selected.definition.name,
                capability: selected.capability,
                asset: selected.asset,
                version: selected.version,
                definition: selected.definition,
              },
            ],
            report: {
              session: scope.session,
              runId: origin.run,
              attempt: 1,
              computedAt: 0 as Facts['adoption']['report']['computedAt'],
              snapshots: [],
              availability: [],
              mcpActions: [],
              endpointHoldings: [],
              effectivePermissions: {},
              skillGate: [],
            },
          },
          batch: {
            kind: 'complete',
            completion: {
              key: 'batch',
              gate: { kind: 'available' },
              items: [
                {
                  callId: call.callId,
                  effectiveCall: call,
                  conclusions: ['official'],
                  decision: { kind: 'allow', conclusion: 'official' },
                },
              ],
            },
          },
        }
        return { kind: 'known', facts }
      },
    },
  }
  let store = await openToolResultStorage({ directory, storage: 'results' }, dependencies)
  async function append(value: ToolJournalPayload) {
    const prepared = prepareToolJournalEntry({ origin, value })
    if ('invalid' in prepared) throw new Error('invalid store fixture')
    const prefix = await log.readSince(scope.session, 0)
    if ('failure' in prefix) throw new Error('unreadable store fixture')
    const committed = await log.append(
      scope.session,
      [prepared.entry],
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: prefix.tail },
    )
    if ('failure' in committed) throw new Error('store fixture append failed')
  }
  async function intent() {
    await append({
      revision: 1,
      ref,
      kind: 'execution_intended',
      origin,
      input: {},
      selected: {
        capability: 'tool:echo',
        asset: 'echo-asset',
        version: '1',
        adoption: 'adopted',
        definition: {
          name: 'echo',
          description: 'Echo',
          paradigm: 'single',
          origin: { kind: 'authored' },
          input: { type: 'object', properties: {}, description: 'Input' },
          permissions: { execute: { default: 'auto' } },
        },
      },
    })
  }
  async function end(
    terminal: ExecutionTerminal = { outcome: 'completed', result: result.result },
  ) {
    await append({ revision: 1, ref, kind: 'execution_started', at })
    const judgment = judgeContentBlock({
      id: 'delivery',
      kind: 'tool_result',
      callId: ref.callId,
      visibility: { toHuman: true, toModel: true },
      outcome: terminal.outcome,
      blocks: result.result.content,
    })
    if ('rejected' in judgment || judgment.ok.kind !== 'tool_result')
      throw new Error('invalid delivery fixture')
    await append({
      revision: 1,
      ref,
      kind: 'execution_ended',
      terminal,
      account: {
        callId: ref.callId,
        initiator: scope.tenant,
        externalEffect: 'unknown',
        cost: { total_usd: 0, items: [] },
        frames: 'unknown',
        wallClock: { startedAt: at, endedAt: at },
      },
      delivery: { pass: 'after', selectedChain: [], result: judgment.ok as ToolResultBlock },
    })
  }
  async function writer(): Promise<ToolResultWriter> {
    const bound = await store.operations.bindWriter(access, ref, 'results')
    if (bound.kind !== 'bound') throw new Error(`writer fixture: ${bound.reason}`)
    return bound.writer
  }
  return {
    get store() {
      return store
    },
    log,
    dependencies,
    authorize,
    readSince,
    release,
    parent,
    directory,
    append,
    intent,
    end,
    writer,
    revoke() {
      authorized = false
    },
    revokeRecovery() {
      recoveryAllowed = false
    },
    replaceOwner() {
      generation = 'second-owner'
    },
    async reopen(reader?: ToolResultStorageDependencies['reader']) {
      await store.close()
      store = await openToolResultStorage(
        { directory, storage: 'results' },
        { ...dependencies, ...(reader ? { reader } : {}) },
      )
    },
    async close() {
      await store.close()
      await log.close()
      await rm(parent, { recursive: true, force: true })
    },
  }
}

test('prepared author result is invisible until a confirmed terminal, then reads the original rather than delivery text', async () => {
  const f = await fixture()
  try {
    expect(await f.store.operations.bindWriter(access, ref, 'results')).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
    await f.intent()
    const writer = await f.writer()
    expect(await writer.recordResult(result)).toBe('recorded')
    expect(await writer.recordResult(result)).toBe('duplicate')
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
    expect(await f.store.operations.readForDelivery(recovery, ref)).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
    await f.end()
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'found',
      value: result,
    })
    expect(await f.store.operations.readForDelivery(recovery, ref)).toEqual({
      kind: 'found',
      value: result,
    })
  } finally {
    await f.close()
  }
})

test('raw bytes and attachment slots preserve exact bytes, metadata and immutable identity', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const writer = await f.writer(),
      raw = await writer.storeRaw(Buffer.from('raw original'), 'text/plain')
    expect(raw.kind).toBe('stored')
    if (raw.kind !== 'stored') throw new Error('raw unavailable')
    expect(await writer.storeRaw(Buffer.from('raw original'), 'text/plain')).toEqual(raw)
    expect(await writer.storeRaw(Buffer.from('different'), 'text/plain')).toEqual({
      kind: 'rejected',
      reason: 'conflict',
    })
    const attachment = await writer.putAttachment(
      'item',
      Buffer.from('attachment'),
      'text/plain',
      'note.txt',
    )
    expect(attachment.kind).toBe('stored')
    expect(
      await writer.putAttachment('item', Buffer.from('attachment'), 'text/plain', 'changed.txt'),
    ).toEqual({ kind: 'rejected', reason: 'conflict' })
    const read = await f.store.operations.readBytes(access, scope, raw.reference)
    expect(read).toEqual({ kind: 'read', bytes: new Uint8Array(Buffer.from('raw original')) })
    const value = { ...result, raw: raw.reference }
    expect(await writer.recordResult(value)).toBe('recorded')
    await f.end()
    expect(await f.store.operations.readForDelivery(recovery, ref)).toEqual({
      kind: 'found',
      value,
    })
    expect(await readdir(f.directory)).toHaveLength(5)
  } finally {
    await f.close()
  }
})

test('unknown references and inline raw bytes cannot be promoted into a stored result', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const writer = await f.writer()
    expect(
      await writer.recordResult({
        ...result,
        raw: { storage: 'results', key: 'a'.repeat(64), mediaType: 'text/plain', bytes: 3 },
      }),
    ).toEqual({ kind: 'rejected', reason: 'notFound' })
    expect(
      await writer.recordResult({
        ...result,
        result: { ...result.result, offload: { raw: { inline: 'YWJj', mediaType: 'text/plain' } } },
      }),
    ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(await readdir(f.directory)).toEqual([])
  } finally {
    await f.close()
  }
})

test('tenant authorization precedes existence checks and a reference cannot read bytes from another scope', async () => {
  const f = await fixture()
  try {
    const foreign = {
      ...ref,
      tenant: unwrap(parseTenantId({ organization: 'other-org', account: 'other-user' })),
    }
    expect(await f.store.operations.readResult(access, foreign)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(f.readSince).not.toHaveBeenCalled()
    await f.intent()
    const raw = await (await f.writer()).storeRaw(Buffer.from('secret'), 'text/plain')
    if (raw.kind !== 'stored') throw new Error('raw unavailable')
    expect(
      await f.store.operations.readBytes(
        access,
        { tenant: foreign.tenant, session: foreign.session },
        raw.reference,
      ),
    ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
    expect(
      await f.store.operations.readBytes(Object.freeze({}) as SessionAccess, scope, raw.reference),
    ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  } finally {
    await f.close()
  }
})

test('revocation during IO hides the result, while the call-bound receipt writer and authorized maintenance retain the existing obligation', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const writer = await f.writer()
    f.revoke()
    expect(await writer.recordResult(result)).toBe('recorded')
    await f.end()
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await f.store.operations.bindWriter(access, ref, 'results')).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await f.store.operations.readForDelivery(recovery, ref)).toEqual({
      kind: 'found',
      value: result,
    })
    f.revokeRecovery()
    expect(await f.store.operations.readForDelivery(recovery, ref)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await f.close()
  }
})

test('authorization is checked again after the backing read rather than exposing a revoked read', async () => {
  const f = await fixture()
  try {
    await f.intent()
    await (await f.writer()).recordResult(result)
    await f.end()
    f.readSince.mockImplementationOnce(async (...args) => {
      const value = await f.log.readSince(...args)
      f.revoke()
      return value
    })
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
  } finally {
    await f.close()
  }
})

test('maintenance bytes are restricted to references held by the won result of that call', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const writer = await f.writer(),
      raw = await writer.storeRaw(Buffer.from('raw'), 'text/plain'),
      orphan = await writer.putAttachment('orphan', Buffer.from('orphan'), 'text/plain')
    if (raw.kind !== 'stored' || orphan.kind !== 'stored') throw new Error('bytes unavailable')
    const value = { ...result, raw: raw.reference }
    await writer.recordResult(value)
    expect(await f.store.operations.readDeliveryBytes(recovery, ref, raw.reference)).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
    await f.end()
    expect(await f.store.operations.readDeliveryBytes(recovery, ref, raw.reference)).toEqual({
      kind: 'read',
      bytes: new Uint8Array(Buffer.from('raw')),
    })
    expect(await f.store.operations.readDeliveryBytes(recovery, ref, orphan.reference)).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
    expect(
      await f.store.operations.readDeliveryBytes(
        Object.freeze({}) as RecoveryAccess,
        ref,
        raw.reference,
      ),
    ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  } finally {
    await f.close()
  }
})

test('an interrupted first winner does not expose the orphaned author result prepared before it', async () => {
  const f = await fixture()
  try {
    await f.intent()
    await (await f.writer()).recordResult(result)
    await f.end({ outcome: 'unavailable', reason: 'owner_lost' })
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notFound',
    })
  } finally {
    await f.close()
  }
})

test('string terminals read normalized text rather than decoding JSON-looking author text', async () => {
  const f = await fixture()
  try {
    await f.intent()
    await (await f.writer()).recordResult(result)
    await f.end({ outcome: 'completed', result: '{"stays":"text"}' })
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'found',
      value: result,
    })
  } finally {
    await f.close()
  }
})

test('a confirmed structured terminal cannot select a different immutable prepared result', async () => {
  const f = await fixture()
  try {
    await f.intent()
    await (await f.writer()).recordResult(result)
    await f.end({
      outcome: 'completed',
      result: toolResultOf('other winner', unwrap(parseOpaqueIdentifier('other-block', 'BlockId'))),
    })
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'storageUnavailable',
    })
  } finally {
    await f.close()
  }
})

test('real byte tampering is detected against the immutable stored digest', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const raw = await (await f.writer()).storeRaw(Buffer.from('original'), 'text/plain')
    if (raw.kind !== 'stored') throw new Error('raw unavailable')
    await writeFile(join(f.directory, `${raw.reference.key}.bytes`), 'tampered')
    expect(await f.store.operations.readBytes(access, scope, raw.reference)).toEqual({
      kind: 'rejected',
      reason: 'storageUnavailable',
    })
  } finally {
    await f.close()
  }
})

test('closing releases its borrow, gates old writers, and a fresh owner reads the durable result', async () => {
  const f = await fixture()
  try {
    await f.intent()
    const writer = await f.writer()
    await writer.recordResult(result)
    await f.end()
    await f.reopen()
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(await writer.recordResult(result)).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'found',
      value: result,
    })
    f.replaceOwner()
    expect(await f.store.operations.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
  } finally {
    await f.close()
  }
})

test('storage availability never invents a reader tool when the configured reader is absent', async () => {
  const f = await fixture()
  try {
    expect(await f.store.operations.available(access, scope, 'results')).toEqual({
      kind: 'rejected',
      reason: 'storageUnavailable',
    })
    expect(await f.store.operations.available(access, scope, 'other')).toEqual({
      kind: 'rejected',
      reason: 'undeclaredStorage',
    })
  } finally {
    await f.close()
  }
})

test('availability follows the actual registered reader and withdrawal, while the reader uses the result read contract', async () => {
  const f = await fixture()
  try {
    const implementations = createToolImplementationRegistry(),
      selected = {
        capability: 'tool:read-result',
        asset: 'reader-asset',
        version: '1',
        adoption: 'reader-adopted',
        definition: {
          name: 'read_result',
          description: 'Read result bytes',
          paradigm: 'single' as const,
          origin: { kind: 'authored' as const },
          input: { type: 'object', properties: {}, description: 'Input' },
          permissions: { execute: { default: 'auto' as const } },
        },
      }
    let reference: Parameters<typeof f.store.operations.readBytes>[2] | undefined
    const executor = async () => {
      if (!reference) throw new Error('reader reference missing')
      const value = await f.store.operations.readBytes(access, scope, reference)
      if (value.kind !== 'read') throw new Error('reader unavailable')
      return Buffer.from(value.bytes).toString()
    }
    const withdraw = implementations.register({ ...selected, executor })
    await f.reopen({ selected, implementations })
    expect(await f.store.operations.available(access, scope, 'results')).toEqual({
      kind: 'available',
      storage: 'results',
      readerTool: 'read_result',
    })
    await f.intent()
    const raw = await (await f.writer()).storeRaw(Buffer.from('reader-original'), 'text/plain')
    if (raw.kind !== 'stored') throw new Error('raw unavailable')
    reference = raw.reference
    expect(await executor()).toBe('reader-original')
    const originalAuthorize = f.authorize.getMockImplementation()!
    f.authorize.mockImplementationOnce(originalAuthorize)
    f.authorize.mockImplementationOnce(async (...args) => {
      const result = await originalAuthorize(...args)
      withdraw()
      return result
    })
    expect(await f.store.operations.available(access, scope, 'results')).toEqual({
      kind: 'rejected',
      reason: 'storageUnavailable',
    })
    expect(await executor()).toBe('reader-original')
  } finally {
    await f.close()
  }
})

test('Cordis provides the core-defined result service and disposal closes this file owner rather than its shared log', async () => {
  const f = await fixture(),
    ctx = new Context()
  const fibers: { dispose(): Promise<void> }[] = []
  try {
    installPorts(ctx, f.dependencies)
    fibers.push(await ctx.plugin(implementationRegistry, {}))
    const fiber = ctx.plugin(toolResultFiles, { directory: f.directory, storage: 'results' })
    fibers.push(fiber)
    await fiber
    const service = ctx.toolResults
    expect(
      fiber.getEffects().filter(effect => effect.label === 'tool-result-files.close'),
    ).toHaveLength(1)
    expect(service).not.toHaveProperty('close')
    await f.intent()
    const bound = await service.bindWriter(access, ref, 'results')
    if (bound.kind !== 'bound') throw new Error('Cordis writer unavailable')
    expect(await bound.writer.recordResult(result)).toBe('recorded')
    await f.end()
    expect(await service.readResult(access, ref)).toEqual({ kind: 'found', value: result })
    await fiber.dispose()
    expect(ctx.get('toolResults')).toBeUndefined()
    expect(await bound.writer.recordResult(result)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(await service.readResult(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(await f.log.readSince(scope.session, 0)).toHaveProperty('tail', 3)
    const next = ctx.plugin(toolResultFiles, { directory: f.directory, storage: 'results' })
    fibers.push(next)
    await next
    expect(await ctx.toolResults.readResult(access, ref)).toEqual({ kind: 'found', value: result })
    await next.dispose()
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await f.close()
  }
})

test('Cordis rejects callback-bearing or invalid result store configuration before publishing a service', async () => {
  const f = await fixture(),
    ctx = new Context()
  installPorts(ctx, f.dependencies)
  const registry = await ctx.plugin(implementationRegistry, {})
  const fiber = ctx.plugin(toolResultFiles, {
    directory: f.directory,
    storage: 'results',
    writer: () => {},
  } as never)
  try {
    await expect(fiber).rejects.toThrow()
    expect(ctx.get('toolResults')).toBeUndefined()
    expect(f.release).not.toHaveBeenCalled()
  } finally {
    await fiber.dispose()
    await registry.dispose()
    await f.close()
  }
})
