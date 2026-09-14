import { access, chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalDiagnostics } from '../dist/index.js'
import type {
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticsRuntime,
  LocalDiagnosticsOptions,
} from '../dist/index.js'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-diagnostics/runtime-tests')

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
})

describe('O04/O05 configuration and local retention boundaries', () => {
  it('rejects invalid configuration before creating its directory', async () => {
    const parent = await mkdtemp(join(scratchRoot, 'invalid-'))
    const directory = join(parent, 'must-not-exist')
    const result = await createLocalDiagnostics(options(directory, 'source-invalid', { maxRecordBytes: 0 }))
    expect(result).toEqual({ status: 'invalid', code: 'INVALID_MAX_RECORD_BYTES' })
    await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' })
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
