import { createRequire, syncBuiltinESMExports } from 'node:module'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalDiagnostics } from '../dist/index.js'
import type {
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticsRuntime,
  LocalDiagnosticsOptions,
} from '../dist/index.js'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-diagnostics/runtime-tests')
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
type FlexibleWrite = (...args: unknown[]) => unknown

beforeAll(async () => {
  await mkdir(scratchRoot, { recursive: true })
})

function options(
  directory: string,
  sourceId = 'source-create',
  overrides: Partial<LocalDiagnosticsOptions> = {},
): LocalDiagnosticsOptions {
  return {
    instanceId: 'instance-test',
    sourceId,
    directory,
    level: 'debug',
    maxRecordBytes: 8 * 1024,
    maxActiveSpans: 4,
    maxBufferBytes: 16 * 1024,
    maxFileBytes: 64 * 1024,
    maxDirectoryBytes: 128 * 1024,
    maxFiles: 4,
    ...overrides,
  }
}

function identity(tenantId: string, userId: string): DiagnosticIdentity {
  return {
    tenantId,
    principal: { kind: 'user', user: { userId } },
    operation: {
      namespace: 'diagnostic-test',
      principalId: userId,
      operationId: `operation-${tenantId}`,
    },
    causality: { session: { tenantId, sessionId: `session-${tenantId}` } },
  }
}

function point(code: string, level: DiagnosticPoint['level'] = 'info'): DiagnosticPoint {
  return { component: 'diagnostics.test', phase: 'runtime', code, level }
}

async function createdRuntime(directory: string, sourceId: string): Promise<DiagnosticsRuntime> {
  const result = await createLocalDiagnostics(options(directory, sourceId))
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`diagnostics creation failed: ${result.code}`)
  return result.runtime
}

async function sourceFile(directory: string): Promise<string> {
  const files = await readdir(directory)
  expect(files).toHaveLength(1)
  return join(directory, files[0]!)
}

async function waitForCode(directory: string, code: string): Promise<readonly Record<string, unknown>[]> {
  const deadline = Date.now() + 1_000
  do {
    const lines: Record<string, unknown>[] = []
    for (const file of await readdir(directory)) {
      const text = await readFile(join(directory, file), 'utf8')
      lines.push(...text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>))
    }
    if (lines.some(line => line.code === code)) return lines
    await new Promise(resolve => setTimeout(resolve, 5))
  } while (Date.now() < deadline)
  throw new Error(`diagnostic code ${code} was not written within 1000ms`)
}

async function waitForStatus(runtime: DiagnosticsRuntime, predicate: (runtime: ReturnType<DiagnosticsRuntime['inspect']>) => boolean): Promise<ReturnType<DiagnosticsRuntime['inspect']>> {
  const deadline = Date.now() + 1_000
  do {
    const status = runtime.inspect()
    if (predicate(status)) return status
    await new Promise(resolve => setTimeout(resolve, 5))
  } while (Date.now() < deadline)
  throw new Error('diagnostics status did not reach the expected state within 1000ms')
}

describe('O05/O06 local source lifecycle', () => {
  it('creates an exclusive protected source and writes clean start/end records', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'create-'))
    const result = await createLocalDiagnostics(options(directory))

    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const closed = await result.runtime.close({ deadlineMs: 1_000 })
    expect(closed.status).toBe('closed')
    expect(closed.state.resource).toBe('released')

    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    expect((await stat(directory)).mode & 0o777).toBe(0o700)
    expect((await stat(join(directory, files[0]!))).mode & 0o777).toBe(0o600)
    const lines = (await readFile(join(directory, files[0]!), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as { code: string })
    expect(lines.map(line => line.code)).toEqual([
      'diagnostic.source_started',
      'diagnostic.source_closed',
    ])
  })

  it('keeps the exclusive creation descriptor instead of reopening the path for append', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'exclusive-descriptor-'))
    const originalOpen = nodeFs.open as unknown as FlexibleWrite
    const observedFlags: string[] = []
    const spy = vi.spyOn(nodeFs, 'open').mockImplementation(((...args: unknown[]) => {
      observedFlags.push(String(args[1]))
      return originalOpen(...args)
    }) as typeof nodeFs.open)
    syncBuiltinESMExports()
    try {
      const runtime = await createdRuntime(directory, 'source-exclusive-descriptor')
      await runtime.close({ deadlineMs: 1_000 })
    } finally {
      spy.mockRestore()
      syncBuiltinESMExports()
    }
    expect(observedFlags).toContain('wx')
    expect(observedFlags).not.toContain('a')
  })
})

describe('O01/O02 passive context behavior', () => {
  it('preserves body result, throw, and opaque Promise identity without then observers', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'within-'))
    const runtime = await createdRuntime(directory, 'source-within')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))

    const returned = Object.freeze({ returned: true })
    expect(runtime.diagnostics.within(context, () => returned)).toBe(returned)
    const marker = new Error('business-marker')
    expect(() => runtime.diagnostics.within(context, () => {
      throw marker
    })).toThrow(marker)

    let thenObservers = 0
    const pending = new Promise<never>(() => {})
    Object.defineProperty(pending, 'then', {
      configurable: true,
      get() {
        thenObservers += 1
        throw new Error('diagnostics must not inspect then')
      },
    })
    expect(runtime.diagnostics.within(context, () => pending)).toBe(pending)
    expect(thenObservers).toBe(0)

    const rejection = Promise.reject(marker)
    const ownerObservation = rejection.catch(error => error)
    expect(runtime.diagnostics.within(context, () => rejection)).toBe(rejection)
    expect(await ownerObservation).toBe(marker)
    await expect(runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({ status: 'closed' })
  })

  it('keeps two tenant contexts isolated across interleaved asynchronous work and root timers', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'contexts-'))
    const runtime = await createdRuntime(directory, 'source-contexts')
    const contextA = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    const contextB = runtime.diagnostics.scope(identity('tenant-b', 'user-b'))
    let release!: () => void
    const barrier = new Promise<void>(resolve => {
      release = resolve
    })

    const workA = runtime.diagnostics.within(contextA, async () => {
      await barrier
      expect(runtime.diagnostics.current()).toBe(contextA)
      runtime.diagnostics.log(contextA, point('tenant_a.complete'))
    })
    const workB = runtime.diagnostics.within(contextB, async () => {
      await barrier
      expect(runtime.diagnostics.current()).toBe(contextB)
      runtime.diagnostics.log(contextB, point('tenant_b.complete'))
    })
    expect(await new Promise(resolve => setTimeout(() => resolve(runtime.diagnostics.current()), 0))).toBeNull()
    release()
    await Promise.all([workA, workB])

    const lines = await waitForCode(directory, 'tenant_b.complete')
    const tenantA = lines.find(line => line.code === 'tenant_a.complete')
    const tenantB = lines.find(line => line.code === 'tenant_b.complete')
    expect(tenantA?.tenantId).toBe('tenant-a')
    expect(tenantB?.tenantId).toBe('tenant-b')
    expect(runtime.diagnostics.current()).toBeNull()
    await expect(runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({ status: 'closed' })
  })

  it('does not observe or wait for a large set of unresolved business Promises', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'pending-promises-'))
    const runtime = await createdRuntime(directory, 'source-pending-promises')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    let thenObservers = 0
    const pending: Promise<never>[] = []
    for (let index = 0; index < 10_000; index += 1) {
      const promise = new Promise<never>(() => {})
      Object.defineProperty(promise, 'then', {
        configurable: true,
        get() {
          thenObservers += 1
          throw new Error('diagnostics must not inspect business Promise settlement')
        },
      })
      pending.push(promise)
      expect(runtime.diagnostics.within(context, () => promise)).toBe(promise)
    }
    expect(thenObservers).toBe(0)
    expect(runtime.inspect().activeSpans).toBe(0)
    await expect(runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({
      status: 'closed',
      state: { activeSpans: 0, resource: 'released' },
    })
    expect(pending).toHaveLength(10_000)
    expect(thenObservers).toBe(0)
  })
})

describe('O03 safe projection', () => {
  it('does not invoke getters or retain unknown body/error fields and reports invalid projection', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'projection-'))
    const runtime = await createdRuntime(directory, 'source-projection')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    let getters = 0
    const unsafePoint = {
      ...point('unsafe.point'),
      get body() {
        getters += 1
        return 'BODY_SENTINEL'
      },
      error: Object.freeze({ message: 'SECRET_SENTINEL', stack: 'STACK_SENTINEL' }),
    } as DiagnosticPoint

    runtime.diagnostics.log(context, unsafePoint)
    expect(getters).toBe(0)
    expect(runtime.inspect().gaps).toContainEqual(expect.objectContaining({
      reason: 'invalid_projection',
      quality: 'counted',
    }))
    await runtime.close({ deadlineMs: 1_000 })
    const text = await readFile(await sourceFile(directory), 'utf8')
    expect(text).not.toContain('BODY_SENTINEL')
    expect(text).not.toContain('SECRET_SENTINEL')
    expect(text).not.toContain('STACK_SENTINEL')
  })

  it('rejects overlong/getter/toJSON/cyclic inputs and emits only fixed accepted fields', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'projection-matrix-'))
    const runtime = await createdRuntime(directory, 'source-projection-matrix')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    let getters = 0
    let toJsonCalls = 0
    const sentinel = 'SECRET_MATRIX_SENTINEL'

    const getterIdentity = {
      tenantId: 'tenant-a',
      get principal() {
        getters += 1
        return { kind: 'system', systemId: sentinel }
      },
      causality: {},
    } as unknown as DiagnosticIdentity
    const invalidContext = runtime.diagnostics.scope(getterIdentity)
    runtime.diagnostics.log(invalidContext, point('projection.invalid_context'))

    const cyclic: Record<string, unknown> = { ...point('projection.cyclic') }
    cyclic.body = cyclic
    const unsafe = {
      ...point('projection.unsafe'),
      body: sentinel,
      error: { message: sentinel, stack: sentinel },
      message: sentinel,
      rawArgs: [sentinel],
      headers: { authorization: sentinel },
      url: `https://invalid.example/?token=${sentinel}`,
      query: sentinel,
      target: sentinel,
      secret: sentinel,
      toJSON() {
        toJsonCalls += 1
        return { secret: sentinel }
      },
    } as DiagnosticPoint
    runtime.diagnostics.log(context, unsafe)
    runtime.diagnostics.log(context, cyclic as DiagnosticPoint)
    runtime.diagnostics.log(context, {
      ...point('projection.overlong'),
      diagnosticId: '界'.repeat(100),
    })
    runtime.diagnostics.log(context, {
      ...point('projection.overlong_counter'),
      position: {
        coordinationDomain: 'domain-a',
        writerEpoch: '1',
        commitId: 'commit-a',
        seq: '9'.repeat(10_000),
      },
    })

    const span = runtime.diagnostics.startSpan(context, point('projection.span'))
    span.end({
      get code() {
        getters += 1
        return sentinel
      },
      outcome: 'failed',
    })

    runtime.diagnostics.log(context, {
      ...point('projection.accepted'),
      diagnosticId: 'diagnostic-safe',
      position: { coordinationDomain: 'domain-a', writerEpoch: '1', commitId: 'commit-a', seq: '2' },
      logical: { coordinationDomain: 'domain-a', seq: '2', commitId: null },
      durable: { coordinationDomain: 'domain-a', seq: '1', commitId: 'commit-b' },
      measures: { durationMs: 1.25, queueDepth: 2, pendingBytes: 3, count: 4 },
    })

    expect(getters).toBe(0)
    expect(toJsonCalls).toBe(0)
    await waitForCode(directory, 'projection.accepted')
    await runtime.close({ deadlineMs: 1_000 })
    const text = await readFile(await sourceFile(directory), 'utf8')
    expect(text).not.toContain(sentinel)
    const lines = text.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines.find(line => line.kind === 'span')).toMatchObject({
      code: 'diagnostic.invalid_end',
      outcome: 'failed',
    })
    expect(lines.find(line => line.code === 'projection.accepted')).toMatchObject({
      diagnosticId: 'diagnostic-safe',
      position: { coordinationDomain: 'domain-a', writerEpoch: '1', commitId: 'commit-a', seq: '2' },
      logical: { coordinationDomain: 'domain-a', seq: '2', commitId: null },
      durable: { coordinationDomain: 'domain-a', seq: '1', commitId: 'commit-b' },
      measures: { durationMs: 1.25, queueDepth: 2, pendingBytes: 3, count: 4 },
    })
    const invalidGap = runtime.inspect().gaps.find(gap => gap.reason === 'invalid_projection')
    expect(BigInt(invalidGap?.count ?? '0')).toBeGreaterThanOrEqual(6n)
  })
})

describe('O02/O04 standard span behavior', () => {
  it('emits bounded parent/child OTel spans and counts span-capacity gaps', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'spans-'))
    const result = await createLocalDiagnostics(options(directory, 'source-spans', { maxActiveSpans: 2 }))
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const { runtime } = result
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    const parent = runtime.diagnostics.startSpan(context, point('span.parent'))
    const child = runtime.diagnostics.within(parent.context, () =>
      runtime.diagnostics.startSpan(parent.context, point('span.child')))
    const refused = runtime.diagnostics.startSpan(context, point('span.refused'))

    expect(runtime.inspect().activeSpans).toBe(2)
    expect(runtime.inspect().gaps).toContainEqual(expect.objectContaining({ reason: 'span_capacity' }))
    expect(refused.context).toBe(context)
    refused.end({ code: 'span.refused_done', outcome: 'failed' })
    child.end({ code: 'span.child_done', outcome: 'ok' })
    parent.end({ code: 'span.parent_done', outcome: 'unknown' })
    parent.end({ code: 'span.duplicate', outcome: 'failed' })
    expect(runtime.inspect().activeSpans).toBe(0)

    const lines = await waitForCode(directory, 'span.parent_done')
    const spanLines = lines.filter(line => line.kind === 'span')
    expect(spanLines).toHaveLength(2)
    const parentLine = spanLines.find(line => line.code === 'span.parent_done')
    const childLine = spanLines.find(line => line.code === 'span.child_done')
    expect(parentLine?.traceId).toBe(childLine?.traceId)
    expect(childLine?.parentSpanId).toBe(parentLine?.spanId)
    expect(parentLine).toMatchObject({ outcome: 'unknown', tenantId: 'tenant-a' })
    expect(lines.some(line => line.code === 'span.duplicate')).toBe(false)
    await expect(runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({ status: 'closed' })
  })
})

describe('O06 close ownership and generation guards', () => {
  it('blocks on an unfinished span, lets that original span end, and retries the same close responsibility', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'close-span-'))
    const runtime = await createdRuntime(directory, 'source-close-span')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    const span = runtime.diagnostics.startSpan(context, point('close.pending_span'))
    expect(runtime.inspect().activeSpans).toBe(1)

    const blocked = await runtime.close({ deadlineMs: 10 })
    expect(blocked).toMatchObject({
      status: 'blocked',
      state: { phase: 'closing', resource: 'held', activeSpans: 1 },
    })
    expect(runtime.diagnostics.current()).toBeNull()

    let afterCloseCalls = 0
    const marker = Object.freeze({ owner: 'business' })
    expect(runtime.diagnostics.within(context, () => {
      afterCloseCalls += 1
      return marker
    })).toBe(marker)
    expect(afterCloseCalls).toBe(1)
    span.end({ code: 'close.pending_span_done', outcome: 'cancelled' })

    const closed = await runtime.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({
      status: 'closed',
      state: { phase: 'closed', resource: 'released', activeSpans: 0 },
    })
    const beforeLate = await readFile(await sourceFile(directory), 'utf8')
    runtime.diagnostics.log(context, point('close.late_log'))
    runtime.diagnostics.startSpan(context, point('close.late_span')).end({
      code: 'close.late_span_done',
      outcome: 'ok',
    })
    const afterLate = await readFile(await sourceFile(directory), 'utf8')
    expect(afterLate).toBe(beforeLate)
    expect(runtime.inspect().gaps).toContainEqual(expect.objectContaining({ reason: 'closing' }))
  })

  it('keeps one delayed close responsibility across concurrent deadlines and releases no newer source', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'close-write-'))
    const oldRuntime = await createdRuntime(directory, 'source-close-write-old')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    let delayed: unknown[] | undefined
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (delayed === undefined) {
        delayed = args
        return undefined
      }
      return originalWrite(...args)
    }) as typeof nodeFs.write)
    let newRuntime: DiagnosticsRuntime | undefined
    try {
      const oldContext = oldRuntime.diagnostics.scope(identity('tenant-a', 'user-a'))
      oldRuntime.diagnostics.log(oldContext, point('close_write.old_pending'))
      const [first, second] = await Promise.all([
        oldRuntime.close({ deadlineMs: 10 }),
        oldRuntime.close({ deadlineMs: 20 }),
      ])
      expect(first).toMatchObject({ status: 'blocked', state: { phase: 'closing', resource: 'held' } })
      expect(second).toMatchObject({ status: 'blocked', state: { phase: 'closing', resource: 'held' } })

      newRuntime = await createdRuntime(directory, 'source-close-write-new')
      const newContext = newRuntime.diagnostics.scope(identity('tenant-b', 'user-b'))
      newRuntime.diagnostics.log(newContext, point('close_write.new_live'))
      await waitForCode(directory, 'close_write.new_live')

      if (delayed !== undefined) originalWrite(...delayed)
      await expect(oldRuntime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({
        status: 'closed',
        state: { resource: 'released' },
      })
      expect(newRuntime.inspect()).toMatchObject({ phase: 'active', resource: 'held' })
      oldRuntime.diagnostics.log(oldContext, point('close_write.old_late'))
      newRuntime.diagnostics.log(newContext, point('close_write.new_after_old_close'))
      const lines = await waitForCode(directory, 'close_write.new_after_old_close')
      expect(lines.some(line => line.code === 'close_write.old_late')).toBe(false)
    } finally {
      spy.mockRestore()
      if (delayed !== undefined && oldRuntime.inspect().resource !== 'released') originalWrite(...delayed)
      await oldRuntime.close({ deadlineMs: 1_000 })
      if (newRuntime !== undefined) await newRuntime.close({ deadlineMs: 1_000 })
    }
  })

  it('keeps a failed fd close unknown and retries that same descriptor responsibility', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'close-failure-'))
    const runtime = await createdRuntime(directory, 'source-close-failure')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalClose = nodeFs.close as unknown as FlexibleWrite
    let injected = false
    const spy = vi.spyOn(nodeFs, 'close').mockImplementation(((...args: unknown[]) => {
      if (injected) return originalClose(...args)
      injected = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.close signature')
      const error = Object.assign(new Error('SECRET_CLOSE_ERROR'), { code: 'EIO' })
      process.nextTick(() => callback(error))
      return undefined
    }) as typeof nodeFs.close)
    syncBuiltinESMExports()
    let blocked: Awaited<ReturnType<DiagnosticsRuntime['close']>>
    try {
      blocked = await runtime.close({ deadlineMs: 1_000 })
    } finally {
      spy.mockRestore()
      syncBuiltinESMExports()
    }
    expect(blocked).toMatchObject({
      status: 'blocked',
      state: {
        phase: 'closing',
        resource: 'unknown',
        lastErrorCode: 'EIO',
      },
    })
    const closed = await runtime.close({ deadlineMs: 1_000 })
    expect(closed).toMatchObject({
      status: 'closed',
      state: { phase: 'closed', resource: 'released' },
    })
    expect(await readFile(await sourceFile(directory), 'utf8')).not.toContain('SECRET_CLOSE_ERROR')
  })
})

describe('O04/O05 configuration and local retention boundaries', () => {
  it('rejects invalid configuration before creating its directory', async () => {
    const parent = await mkdtemp(join(scratchRoot, 'invalid-'))
    const directory = join(parent, 'must-not-exist')
    const result = await createLocalDiagnostics(options(directory, 'source-invalid', { maxRecordBytes: 0 }))
    expect(result).toEqual({ status: 'invalid', code: 'INVALID_MAX_RECORD_BYTES' })
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains an acquired descriptor when source preparation and its first cleanup both fail', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'prepare-failure-'))
    const originalClose = nodeFs.close as unknown as FlexibleWrite
    let descriptor: number | undefined
    const fchmodSpy = vi.spyOn(nodeFs, 'fchmod').mockImplementation(((...args: unknown[]) => {
      descriptor = args[0] as number
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.fchmod signature')
      process.nextTick(() => callback(Object.assign(new Error('SECRET_PREP_ERROR'), { code: 'EIO' })))
      return undefined
    }) as typeof nodeFs.fchmod)
    const closeSpy = vi.spyOn(nodeFs, 'close').mockImplementation(((...args: unknown[]) => {
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.close signature')
      process.nextTick(() => callback(Object.assign(new Error('SECRET_CLEANUP_ERROR'), { code: 'EIO' })))
      return undefined
    }) as typeof nodeFs.close)
    syncBuiltinESMExports()
    let result: Awaited<ReturnType<typeof createLocalDiagnostics>> | undefined
    try {
      result = await createLocalDiagnostics(options(directory, 'source-prepare-failure'))
    } finally {
      fchmodSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
    }
    expect(result).toBeDefined()
    if (result === undefined) return
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const beforeRetry = result.runtime.inspect()
    const afterRetry = await result.runtime.close({ deadlineMs: 1_000 })
    if (descriptor !== undefined) {
      await new Promise<void>(resolve => {
        ;(originalClose as FlexibleWrite)(descriptor, () => resolve())
      })
    }
    expect(beforeRetry).toMatchObject({
      phase: 'degraded',
      resource: 'unknown',
      lastErrorCode: 'SOURCE_OPEN_EIO',
    })
    expect(afterRetry).toMatchObject({ status: 'closed', state: { resource: 'released' } })
  })

  it('returns a visible degraded runtime when directory retention is already exhausted', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'retention-'))
    await chmod(directory, 0o700)
    await writeFile(join(directory, 'retained-source.jsonl'), 'x'.repeat(1_024), { mode: 0o600 })
    const result = await createLocalDiagnostics(options(directory, 'source-retention', {
      maxRecordBytes: 512,
      maxBufferBytes: 1_024,
      maxFileBytes: 1_024,
      maxDirectoryBytes: 1_024,
      maxFiles: 1,
    }))
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    expect(result.runtime.inspect()).toMatchObject({
      phase: 'degraded',
      resource: 'released',
      lastErrorCode: 'RETENTION_CAPACITY',
    })
    expect(result.runtime.inspect().gaps).toContainEqual(expect.objectContaining({
      reason: 'retention_capacity',
    }))
    await expect(result.runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({ status: 'closed' })
    expect(await readdir(directory)).toEqual(['retained-source.jsonl'])
  })

  it('keeps two factory instances and colliding source generations isolated', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'factories-'))
    const first = await createdRuntime(directory, 'source-first')
    try {
      const collision = await createLocalDiagnostics(options(directory, 'source-first'))
      expect(collision.status).toBe('created')
      if (collision.status === 'created') {
        expect(collision.runtime.inspect()).toMatchObject({
          phase: 'degraded',
          resource: 'released',
          lastErrorCode: 'SOURCE_EXISTS',
        })
        await collision.runtime.close({ deadlineMs: 1_000 })
      }

      const second = await createdRuntime(directory, 'source-second')
      const firstContext = first.diagnostics.scope(identity('tenant-a', 'user-a'))
      const secondContext = second.diagnostics.scope(identity('tenant-b', 'user-b'))
      first.diagnostics.log(firstContext, point('factory.first'))
      second.diagnostics.log(secondContext, point('factory.second'))
      await waitForCode(directory, 'factory.first')
      await waitForCode(directory, 'factory.second')
      await second.close({ deadlineMs: 1_000 })
      first.diagnostics.log(firstContext, point('factory.first_after_second_close'))
      await waitForCode(directory, 'factory.first_after_second_close')
    } finally {
      await first.close({ deadlineMs: 1_000 })
    }
  })

  it('does not let another host instance append the same source generation', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'cross-instance-collision-'))
    const firstResult = await createLocalDiagnostics(options(directory, 'shared-source', {
      instanceId: 'instance-a',
    }))
    expect(firstResult.status).toBe('created')
    if (firstResult.status !== 'created') return
    const collision = await createLocalDiagnostics(options(directory, 'shared-source', {
      instanceId: 'instance-b',
    }))
    expect(collision.status).toBe('created')
    if (collision.status !== 'created') return
    expect(collision.runtime.inspect()).toMatchObject({
      phase: 'degraded',
      resource: 'released',
      lastErrorCode: 'SOURCE_EXISTS',
    })
    expect(collision.runtime.diagnostics.newId()).not.toBe(firstResult.runtime.diagnostics.newId())
    await collision.runtime.close({ deadlineMs: 1_000 })
    await firstResult.runtime.close({ deadlineMs: 1_000 })
    expect(await readdir(directory)).toHaveLength(1)
  })

  it('reports an earlier diagnostic source without a clean end as crash-unknown', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'crash-unknown-'))
    await writeFile(join(directory, 'diagnostic-0000000000000000-deadbeefdeadbeef.jsonl'), `${JSON.stringify({
      formatVersion: 'omne-diagnostic/1',
      sourceId: 'old-source',
      seq: '1',
      component: 'diagnostics',
      phase: 'lifecycle',
      code: 'diagnostic.source_started',
    })}\n`, { mode: 0o600 })
    const runtime = await createdRuntime(directory, 'new-source')
    expect(runtime.inspect().gaps).toContainEqual(expect.objectContaining({
      reason: 'crash_unknown',
      count: null,
      quality: 'unknown',
    }))
    await runtime.close({ deadlineMs: 1_000 })
  })

  it('writes one ordinary low-traffic record without another log or close trigger', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'low-traffic-'))
    const runtime = await createdRuntime(directory, 'source-low-traffic')
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    runtime.diagnostics.log(context, point('low_traffic.single', 'error'))
    const lines = await waitForCode(directory, 'low_traffic.single')
    expect(lines.find(line => line.code === 'low_traffic.single')).toMatchObject({
      level: 'error',
      tenantId: 'tenant-a',
    })
    expect(runtime.inspect().resource).toBe('held')
    await runtime.close({ deadlineMs: 1_000 })
  })
})

describe('O04/O05 bounded output and actual write progress', () => {
  it('counts a projected record that exceeds the UTF-8 line cap without writing it', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'record-cap-'))
    const result = await createLocalDiagnostics(options(directory, 'source-record-cap', {
      maxRecordBytes: 512,
    }))
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const runtime = result.runtime
    const long = '界'.repeat(80)
    const context = runtime.diagnostics.scope({
      tenantId: long,
      principal: { kind: 'user', user: { userId: long } },
      operation: { namespace: long, principalId: long, operationId: long },
      causality: { session: { tenantId: long, sessionId: long } },
    })
    runtime.diagnostics.log(context, point('record_cap.error', 'error'))
    expect(runtime.inspect().gaps).toContainEqual(expect.objectContaining({
      reason: 'buffer_capacity',
      count: '1',
      quality: 'counted',
    }))
    expect(await readFile(await sourceFile(directory), 'utf8')).not.toContain('record_cap.error')
    await runtime.close({ deadlineMs: 1_000 })
  })

  it('counts repeated warn/error buffer overflow while a real write is delayed', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'buffer-cap-'))
    const result = await createLocalDiagnostics(options(directory, 'source-buffer-cap', {
      maxRecordBytes: 1_024,
      maxBufferBytes: 1_024,
    }))
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const runtime = result.runtime
    await waitForCode(directory, 'diagnostic.source_started')

    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    let delayed: unknown[] | undefined
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (delayed === undefined) {
        delayed = args
        return undefined
      }
      return originalWrite(...args)
    }) as typeof nodeFs.write)
    try {
      for (let index = 0; index < 20; index += 1) {
        runtime.diagnostics.log(
          runtime.diagnostics.scope(identity('tenant-a', `user-${index}`)),
          point(`buffer_cap.${index}`, index % 2 === 0 ? 'warn' : 'error'),
        )
      }
      const gap = runtime.inspect().gaps.find(item => item.reason === 'buffer_capacity')
      expect(gap?.quality).toBe('counted')
      expect(BigInt(gap?.count ?? '0')).toBeGreaterThan(1n)
      expect(delayed).toBeDefined()
    } finally {
      if (delayed !== undefined) originalWrite(...delayed)
      spy.mockRestore()
      await runtime.close({ deadlineMs: 1_000 })
    }
  })

  it('never grows the source past its file budget and counts every later error record', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'file-cap-'))
    const result = await createLocalDiagnostics(options(directory, 'source-file-cap', {
      maxRecordBytes: 512,
      maxBufferBytes: 1_024,
      maxFileBytes: 1_024,
      maxDirectoryBytes: 2_048,
    }))
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    const runtime = result.runtime
    const context = runtime.diagnostics.scope(identity('tenant-a', 'user-a'))
    for (let index = 0; index < 20; index += 1) {
      runtime.diagnostics.log(context, point(`file_cap.${index}`, 'error'))
    }
    await waitForStatus(runtime, state => state.pendingBytes === 0)
    const beforeClose = runtime.inspect()
    const gap = beforeClose.gaps.find(item => item.reason === 'retention_capacity')
    expect(gap?.quality).toBe('counted')
    expect(BigInt(gap?.count ?? '0')).toBeGreaterThan(1n)
    await runtime.close({ deadlineMs: 1_000 })
    expect((await stat(await sourceFile(directory))).size).toBeLessThanOrEqual(1_024)
  })

  it('reports a delayed real fs.write as stalled and resumes from actual callback progress', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'stalled-'))
    const runtime = await createdRuntime(directory, 'source-stalled')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    let delayed: unknown[] | undefined
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      delayed = args
      return undefined
    }) as typeof nodeFs.write)
    const now = performance.now()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(now)
    try {
      runtime.diagnostics.log(runtime.diagnostics.scope(identity('tenant-a', 'user-a')), point('write.stalled'))
      clock.mockReturnValue(now + 1_001)
      expect(runtime.inspect()).toMatchObject({
        writeProgress: 'stalled',
        resource: 'held',
      })
      expect(runtime.inspect().pendingIdleMs).toBeGreaterThanOrEqual(1_000)
      expect(delayed).toBeDefined()
      clock.mockRestore()
      if (delayed !== undefined) originalWrite(...delayed)
      await waitForCode(directory, 'write.stalled')
      expect(runtime.inspect()).toMatchObject({ writeProgress: 'idle', pendingBytes: 0 })
    } finally {
      clock.mockRestore()
      spy.mockRestore()
      await runtime.close({ deadlineMs: 1_000 })
    }
  })

  it('tracks partial fs.write callbacks through the complete readable line boundary', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'partial-'))
    const runtime = await createdRuntime(directory, 'source-partial')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    let partialCalls = 0
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (partialCalls > 0) return originalWrite(...args)
      partialCalls += 1
      const fd = args[0]
      const data = args[1]
      const callback = args.at(-1)
      if (typeof fd !== 'number' || (typeof data !== 'string' && !ArrayBuffer.isView(data)) || typeof callback !== 'function') {
        throw new Error('unexpected fs.write signature')
      }
      const buffer = typeof data === 'string'
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      return originalWrite(fd, buffer.subarray(0, Math.max(1, Math.floor(buffer.length / 2))), callback)
    }) as typeof nodeFs.write)
    try {
      runtime.diagnostics.log(runtime.diagnostics.scope(identity('tenant-a', 'user-a')), point('write.partial'))
      await waitForCode(directory, 'write.partial')
      expect(partialCalls).toBe(1)
      expect(runtime.inspect().writtenBytes).toBe(String((await stat(await sourceFile(directory))).size))
      expect(runtime.inspect()).toMatchObject({ pendingBytes: 0, writeProgress: 'idle' })
    } finally {
      spy.mockRestore()
      await runtime.close({ deadlineMs: 1_000 })
    }
  })

  it('contains a real EIO callback, exposes the safe code, and releases that stream', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'write-error-'))
    const runtime = await createdRuntime(directory, 'source-write-error')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    let failed = false
    const secret = 'SECRET_ERROR_MESSAGE_MUST_NOT_LEAK'
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (failed) return originalWrite(...args)
      failed = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.write signature')
      const error = Object.assign(new Error(secret), { code: 'EIO' })
      process.nextTick(() => callback(error, 0))
      return undefined
    }) as typeof nodeFs.write)
    const marker = Object.freeze({ business: 'unchanged' })
    try {
      expect((() => {
        runtime.diagnostics.log(runtime.diagnostics.scope(identity('tenant-a', 'user-a')), point('write.failed', 'error'))
        return marker
      })()).toBe(marker)
      const failedStatus = await waitForStatus(runtime, state => state.writeProgress === 'failed')
      expect(failedStatus).toMatchObject({
        phase: 'degraded',
        lastErrorCode: 'EIO',
      })
      expect(failedStatus.gaps).toContainEqual(expect.objectContaining({
        reason: 'write_unavailable',
        quality: 'unknown',
      }))
      await waitForStatus(runtime, state => state.resource === 'released')
      expect(await readFile(await sourceFile(directory), 'utf8')).not.toContain(secret)
    } finally {
      spy.mockRestore()
    }
    await expect(runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({ status: 'closed' })
  })

  it('does not expose an arbitrary backend error code as diagnostic content', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'unsafe-error-code-'))
    const runtime = await createdRuntime(directory, 'source-unsafe-error-code')
    await waitForCode(directory, 'diagnostic.source_started')
    const originalWrite = nodeFs.write as unknown as FlexibleWrite
    const sentinel = 'SECRET_BACKEND_CODE_SENTINEL'
    let failed = false
    const spy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (failed) return originalWrite(...args)
      failed = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.write signature')
      process.nextTick(() => callback(Object.assign(new Error(sentinel), { code: sentinel }), 0))
      return undefined
    }) as typeof nodeFs.write)
    try {
      runtime.diagnostics.log(
        runtime.diagnostics.scope(identity('tenant-a', 'user-a')),
        point('write.unsafe_error_code', 'error'),
      )
      const status = await waitForStatus(runtime, state => state.writeProgress === 'failed')
      expect(status.lastErrorCode).toBe('SONIC_ERROR')
    } finally {
      spy.mockRestore()
    }
    await runtime.close({ deadlineMs: 1_000 })
    expect(await readFile(await sourceFile(directory), 'utf8')).not.toContain(sentinel)
  })
})
