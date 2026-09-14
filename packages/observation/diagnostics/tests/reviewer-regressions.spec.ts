import { createRequire, syncBuiltinESMExports } from 'node:module'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalDiagnostics } from '../dist/index.js'
import type {
  DiagnosticEnd,
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticsRuntime,
  LocalDiagnosticsOptions,
} from '../dist/index.js'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-diagnostics/reviewer-tests')
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
const nodeFsPromises = createRequire(import.meta.url)(
  'node:fs/promises',
) as typeof import('node:fs/promises')
type FlexibleCall = (...args: unknown[]) => unknown
const execFileAsync = promisify(execFile)

beforeAll(async () => {
  await mkdir(scratchRoot, { recursive: true })
})

function options(
  directory: string,
  sourceId: string,
  overrides: Partial<LocalDiagnosticsOptions> = {},
): LocalDiagnosticsOptions {
  return {
    instanceId: 'instance-review',
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

async function records(directory: string): Promise<readonly Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = []
  for (const file of await readdir(directory)) {
    const text = await readFile(join(directory, file), 'utf8')
    result.push(
      ...text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>),
    )
  }
  return result
}

async function waitForCode(
  directory: string,
  code: string,
): Promise<readonly Record<string, unknown>[]> {
  const deadline = Date.now() + 1_000
  do {
    const lines = await records(directory)
    if (lines.some(line => line.code === code)) return lines
    await new Promise(resolve => setTimeout(resolve, 5))
  } while (Date.now() < deadline)
  throw new Error(`diagnostic code ${code} was not written`)
}

function identity(): DiagnosticIdentity {
  return {
    tenantId: 'tenant-review',
    principal: { kind: 'user', user: { userId: 'user-review' } },
    operation: {
      namespace: 'diagnostics-review',
      principalId: 'user-review',
      operationId: 'operation-review',
    },
    causality: { session: { tenantId: 'tenant-review', sessionId: 'session-review' } },
  }
}

function point(code: string): DiagnosticPoint {
  return { component: 'diagnostics.review', phase: 'runtime', code, level: 'error' }
}

async function runtime(directory: string, sourceId: string): Promise<DiagnosticsRuntime> {
  const result = await createLocalDiagnostics(options(directory, sourceId))
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`creation failed: ${result.code}`)
  return result.runtime
}

async function waitFor(
  subject: DiagnosticsRuntime,
  predicate: (status: ReturnType<DiagnosticsRuntime['inspect']>) => boolean,
): Promise<ReturnType<DiagnosticsRuntime['inspect']>> {
  const deadline = Date.now() + 1_000
  do {
    const status = subject.inspect()
    if (predicate(status)) return status
    await new Promise(resolve => setTimeout(resolve, 5))
  } while (Date.now() < deadline)
  throw new Error('diagnostics status did not reach the expected state')
}

describe('D1-R2 close recovery after a write-triggered destroy', () => {
  it('retains and retries the fd after write EIO and the destroy close also fails', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r2-write-close-'))
    const subject = await runtime(directory, 'source-r2')
    await waitFor(subject, status => status.pendingBytes === 0)

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    const originalClose = nodeFs.close as unknown as FlexibleCall
    let failedDescriptor: number | undefined
    let writeFailed = false
    let closeFailed = false
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (writeFailed) return originalWrite(...args)
      writeFailed = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.write signature')
      process.nextTick(() => callback(Object.assign(new Error('R2_WRITE_SECRET'), { code: 'EIO' }), 0))
      return undefined
    }) as typeof nodeFs.write)
    const closeSpy = vi.spyOn(nodeFs, 'close').mockImplementation(((...args: unknown[]) => {
      if (closeFailed) return originalClose(...args)
      closeFailed = true
      failedDescriptor = args[0] as number
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.close signature')
      process.nextTick(() => callback(Object.assign(new Error('R2_CLOSE_SECRET'), { code: 'EIO' })))
      return undefined
    }) as typeof nodeFs.close)
    syncBuiltinESMExports()

    let retried: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    let beforeRetry: ReturnType<DiagnosticsRuntime['inspect']> | undefined
    try {
      subject.diagnostics.log(subject.diagnostics.scope(identity()), point('r2.write_failure'))
      await waitFor(subject, () => closeFailed)
      beforeRetry = subject.inspect()
      writeSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
      retried = await subject.close({ deadlineMs: 100 })
    } finally {
      writeSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
      if (failedDescriptor !== undefined && retried?.state.resource !== 'released') {
        await new Promise<void>(resolve => {
          originalClose(failedDescriptor, () => resolve())
        })
      }
    }

    expect(beforeRetry).toMatchObject({
      phase: 'degraded',
      resource: 'unknown',
      writeProgress: 'failed',
      lastErrorCode: 'EIO',
    })
    expect(retried).toMatchObject({
      status: 'closed',
      state: { phase: 'closed', resource: 'released' },
    })
  })
})

describe('D1-R3 scanned source cleanup ownership', () => {
  it('retains an old FileHandle whose first close fails and closes it on runtime retry', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r3-scan-close-'))
    const oldPath = join(directory, 'diagnostic-0000000000000001.jsonl')
    await writeFile(
      oldPath,
      `${JSON.stringify({
        formatVersion: 'omne-diagnostic/1',
        sourceId: 'old-r3',
        code: 'diagnostic.source_started',
      })}\n${JSON.stringify({
        formatVersion: 'omne-diagnostic/1',
        sourceId: 'old-r3',
        code: 'diagnostic.source_closed',
      })}\n`,
      { mode: 0o600 },
    )

    const originalOpen = nodeFsPromises.open
    let retained: Awaited<ReturnType<typeof nodeFsPromises.open>> | undefined
    const openSpy = vi.spyOn(nodeFsPromises, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args)
      if (String(args[0]) === oldPath) {
        retained = handle
        vi.spyOn(handle, 'close').mockRejectedValueOnce(
          Object.assign(new Error('R3_SCAN_CLOSE_SECRET'), { code: 'EIO' }),
        )
      }
      return handle
    })
    syncBuiltinESMExports()

    let result: Awaited<ReturnType<typeof createLocalDiagnostics>>
    try {
      result = await createLocalDiagnostics(options(directory, 'source-r3'))
    } finally {
      openSpy.mockRestore()
      syncBuiltinESMExports()
    }
    expect(result.status).toBe('created')
    if (result.status !== 'created' || retained === undefined) return

    let retried: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    try {
      expect(result.runtime.inspect()).toMatchObject({
        phase: 'degraded',
        resource: 'unknown',
      })
      retried = await result.runtime.close({ deadlineMs: 1_000 })
      expect(retried).toMatchObject({
        status: 'closed',
        state: { phase: 'closed', resource: 'released' },
      })
      await expect(retained.read(Buffer.alloc(1), 0, 1, 0)).rejects.toThrow()
    } finally {
      if (retried?.state.resource !== 'released') await retained.close().catch(() => {})
    }
  })
})

describe('D1-R5 hostile public projection inputs', () => {
  it('contains revoked Proxies at scope, log, and end without changing business identity', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r5-revoked-'))
    const subject = await runtime(directory, 'source-r5')
    const context = subject.diagnostics.scope(identity())
    const revokedIdentity = Proxy.revocable({}, {})
    const revokedPoint = Proxy.revocable({}, {})
    const revokedEnd = Proxy.revocable({}, {})
    revokedIdentity.revoke()
    revokedPoint.revoke()
    revokedEnd.revoke()

    const failures: unknown[] = []
    try {
      subject.diagnostics.scope(revokedIdentity.proxy as DiagnosticIdentity)
    } catch (error) {
      failures.push(error)
    }
    try {
      subject.diagnostics.log(context, revokedPoint.proxy as DiagnosticPoint)
    } catch (error) {
      failures.push(error)
    }
    const span = subject.diagnostics.startSpan(context, point('r5.span'))
    try {
      span.end(revokedEnd.proxy as DiagnosticEnd)
    } catch (error) {
      failures.push(error)
    }

    const marker = Object.freeze({ business: 'same-result' })
    expect(subject.diagnostics.within(context, () => marker)).toBe(marker)
    const businessError = new Error('R5_BUSINESS_ERROR')
    expect(() =>
      subject.diagnostics.within(context, () => {
        throw businessError
      }),
    ).toThrow(businessError)
    expect(failures).toEqual([])
    expect(subject.inspect()).toMatchObject({ activeSpans: 0 })
    expect(subject.inspect().gaps).toContainEqual(
      expect.objectContaining({ reason: 'invalid_projection', quality: 'counted' }),
    )
    await expect(subject.close({ deadlineMs: 100 })).resolves.toMatchObject({
      status: 'closed',
      state: { resource: 'released', activeSpans: 0 },
    })
    const files = await readdir(directory)
    expect(await readFile(join(directory, files[0]!), 'utf8')).not.toContain('R5_BUSINESS_ERROR')
  })
})

describe('D1-R4 ended span context retention', () => {
  it('lets the SDK span be collected while its public context remains reachable', async () => {
    const fixture = resolve(import.meta.dirname, 'fixtures/sdk-span-gc.mjs')
    const { stdout } = await execFileAsync(process.execPath, ['--expose-gc', fixture], {
      timeout: 5_000,
    })
    expect(JSON.parse(stdout) as Record<string, unknown>).toMatchObject({
      sdkSpanCollected: true,
      retainedContext: true,
    })
  })

  it('starts a correlated child from the immutable identity of an ended parent', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r4-ended-parent-'))
    const subject = await runtime(directory, 'source-r4-correlation')
    const context = subject.diagnostics.scope(identity())
    const parent = subject.diagnostics.startSpan(context, point('r4.parent'))
    const endedParentContext = parent.context
    parent.end({ code: 'r4.parent_done', outcome: 'ok' })
    const child = subject.diagnostics.startSpan(endedParentContext, point('r4.child'))
    child.end({ code: 'r4.child_done', outcome: 'ok' })
    await subject.close({ deadlineMs: 1_000 })

    const lines = await records(directory)
    const parentRecord = lines.find(line => line.code === 'r4.parent_done')
    const childRecord = lines.find(line => line.code === 'r4.child_done')
    expect(childRecord).toMatchObject({
      traceId: parentRecord?.traceId,
      parentSpanId: parentRecord?.spanId,
    })
  })
})

describe('D1-R6 persisted gap summaries', () => {
  it('writes the bounded buffer gap range and count after the real stream recovers', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r6-summary-'))
    const creation = await createLocalDiagnostics(
      options(directory, 'source-r6-summary', {
        maxRecordBytes: 1_024,
        maxBufferBytes: 1_024,
      }),
    )
    expect(creation.status).toBe('created')
    if (creation.status !== 'created') return
    const subject = creation.runtime
    await waitForCode(directory, 'diagnostic.source_started')

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    let delayed: unknown[] | undefined
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (delayed === undefined) {
        delayed = args
        return undefined
      }
      return originalWrite(...args)
    }) as typeof nodeFs.write)
    try {
      for (let index = 0; index < 20; index += 1) {
        subject.diagnostics.log(
          subject.diagnostics.scope({
            ...identity(),
            principal: { kind: 'user', user: { userId: `r6-user-${index}` } },
          }),
          point(`r6.buffer.${index}`),
        )
      }
      const gap = subject.inspect().gaps.find(item => item.reason === 'buffer_capacity')
      expect(BigInt(gap?.count ?? '0')).toBeGreaterThan(1n)
      expect(delayed).toBeDefined()
      if (delayed !== undefined) originalWrite(...delayed)
      writeSpy.mockRestore()
      syncBuiltinESMExports()

      const lines = await waitForCode(directory, 'diagnostic.gap')
      const summary = lines.find(line => line.code === 'diagnostic.gap')
      expect(summary).toMatchObject({
        component: 'diagnostics',
        phase: 'gap',
        gaps: expect.arrayContaining([
          {
            reason: 'buffer_capacity',
            firstSeq: gap?.firstSeq,
            lastSeq: gap?.lastSeq,
            count: gap?.count,
            quality: 'counted',
          },
        ]),
      })
    } finally {
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      if (delayed !== undefined && subject.inspect().pendingBytes > 0) originalWrite(...delayed)
      await subject.close({ deadlineMs: 1_000 })
    }
  })

  it('keeps a failed oversized summary bounded without scheduling retries', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r6-summary-failure-'))
    const creation = await createLocalDiagnostics(
      options(directory, 'source-r6-summary-failure', {
        level: 'error',
        maxRecordBytes: 512,
        maxBufferBytes: 512,
        maxActiveSpans: 1,
      }),
    )
    expect(creation.status).toBe('created')
    if (creation.status !== 'created') return
    const subject = creation.runtime
    await waitForCode(directory, 'diagnostic.source_started')
    const context = subject.diagnostics.scope({
      tenantId: null,
      principal: { kind: 'system', systemId: 'r6' },
      causality: {},
    })
    subject.diagnostics.log(context, {
      component: 'd',
      phase: 'p',
      code: 'r6.level',
      level: 'warn',
    })
    subject.diagnostics.log(context, {} as DiagnosticPoint)
    const active = subject.diagnostics.startSpan(context, {
      component: 'd',
      phase: 'p',
      code: 'r6.active',
      level: 'error',
    })
    subject.diagnostics.startSpan(context, {
      component: 'd',
      phase: 'p',
      code: 'r6.capacity',
      level: 'error',
    })

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    let delayed: unknown[] | undefined
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (delayed === undefined) {
        delayed = args
        return undefined
      }
      return originalWrite(...args)
    }) as typeof nodeFs.write)
    try {
      for (let index = 0; index < 8; index += 1) {
        subject.diagnostics.log(context, {
          component: 'd',
          phase: 'p',
          code: `r6.e${index}`,
          level: 'error',
        })
      }
      const beforeRecovery = subject.inspect()
      const beforeBufferGap = beforeRecovery.gaps.find(gap => gap.reason === 'buffer_capacity')
      expect(BigInt(beforeBufferGap?.count ?? '0')).toBeGreaterThan(0n)
      expect(delayed).toBeDefined()
      if (delayed !== undefined) originalWrite(...delayed)
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      const afterRecovery = await waitFor(subject, status => status.pendingBytes === 0)
      expect(BigInt(afterRecovery.attemptedThrough)).toBeGreaterThan(
        BigInt(beforeRecovery.attemptedThrough),
      )
      expect(
        BigInt(
          afterRecovery.gaps.find(gap => gap.reason === 'buffer_capacity')?.count ?? '0',
        ),
      ).toBeGreaterThan(BigInt(beforeBufferGap?.count ?? '0'))

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(subject.inspect().attemptedThrough).toBe(afterRecovery.attemptedThrough)
      expect((await records(directory)).some(line => line.code === 'diagnostic.gap')).toBe(false)
    } finally {
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      if (delayed !== undefined && subject.inspect().pendingBytes > 0) originalWrite(...delayed)
      active.end({ code: 'r6.active_done', outcome: 'cancelled' })
      await subject.close({ deadlineMs: 1_000 })
    }
  })
})
