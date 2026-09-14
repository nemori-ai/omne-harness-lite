import { createRequire, syncBuiltinESMExports } from 'node:module'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalDiagnosticsDirectory } from '../dist/index.js'
import type {
  DiagnosticEnd,
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticsDirectoryCleanup,
  DiagnosticsRuntime,
  LocalDiagnosticSourceOptions,
  LocalDiagnosticSourceResult,
  LocalDiagnosticsDirectory,
  LocalDiagnosticsDirectoryOptions,
} from '../dist/index.js'

const scratchRoot = resolve(import.meta.dirname, '../../../../tmp/p1-diagnostics/reviewer-tests')
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
const nodeFsPromises = createRequire(import.meta.url)(
  'node:fs/promises',
) as typeof import('node:fs/promises')
type FlexibleCall = (...args: unknown[]) => unknown
const execFileAsync = promisify(execFile)
type TestOptions = LocalDiagnosticsDirectoryOptions & LocalDiagnosticSourceOptions
const owners = new Set<LocalDiagnosticsDirectory>()
const ownersByDirectory = new Map<string, LocalDiagnosticsDirectory>()
const cleanupsRetainedUntilTestProcessExit: DiagnosticsDirectoryCleanup[] = []
const ownersRetainedUntilTestProcessExit: LocalDiagnosticsDirectory[] = []

beforeAll(async () => {
  await mkdir(scratchRoot, { recursive: true })
})

afterEach(async () => {
  const ownerList = [...owners]
  const closing = await Promise.all(ownerList.map(owner => owner.close({ deadlineMs: 1_000 })))
  for (const [index, result] of closing.entries()) {
    if (result.status === 'blocked' && result.state.resource === 'unknown') {
      ownersRetainedUntilTestProcessExit.push(ownerList[index]!)
    }
  }
  owners.clear()
  ownersByDirectory.clear()
})

function options(
  directory: string,
  sourceId: string,
  overrides: Partial<TestOptions> = {},
): TestOptions {
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

function directoryOptions(options: TestOptions): LocalDiagnosticsDirectoryOptions {
  return {
    directory: options.directory,
    maxDirectoryBytes: options.maxDirectoryBytes,
    maxFiles: options.maxFiles,
  }
}

function sourceOptions(options: TestOptions): LocalDiagnosticSourceOptions {
  return {
    instanceId: options.instanceId,
    sourceId: options.sourceId,
    level: options.level,
    maxRecordBytes: options.maxRecordBytes,
    maxActiveSpans: options.maxActiveSpans,
    maxBufferBytes: options.maxBufferBytes,
    maxFileBytes: options.maxFileBytes,
  }
}

async function createLocalDiagnostics(options: TestOptions): Promise<LocalDiagnosticSourceResult> {
  let owner = ownersByDirectory.get(options.directory)
  if (owner === undefined) {
    const directory = await createLocalDiagnosticsDirectory(directoryOptions(options))
    if (directory.status === 'invalid') return directory
    if (directory.status === 'unavailable') {
      return Object.freeze({ status: 'unavailable', code: directory.code })
    }
    owner = directory.owner
    owners.add(owner)
    ownersByDirectory.set(options.directory, owner)
  }
  return owner.create(sourceOptions(options))
}

async function records(directory: string): Promise<readonly Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = []
  for (const file of (await readdir(directory)).filter(file => file.startsWith('diagnostic-'))) {
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
  it('closes the owned source after a pending write callback fails during end', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r2-write-end-'))
    const subject = await runtime(directory, 'source-r2-end')
    const directoryOwner = ownersByDirectory.get(directory)
    if (directoryOwner === undefined) throw new Error('directory owner missing')
    await waitFor(subject, status => status.pendingBytes === 0)

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    const originalClose = nodeFs.close as unknown as FlexibleCall
    let callback: FlexibleCall | undefined
    let sourceDescriptor: number | undefined
    let closeCalls = 0
    let openAfterFailure = false
    let repeated: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (callback !== undefined) return originalWrite(...args)
      sourceDescriptor = args[0] as number
      const candidate = args.at(-1)
      if (typeof candidate !== 'function') throw new Error('unexpected fs.write signature')
      callback = candidate as FlexibleCall
      return undefined
    }) as typeof nodeFs.write)
    const closeSpy = vi.spyOn(nodeFs, 'close').mockImplementation(((...args: unknown[]) => {
      closeCalls += 1
      return originalClose(...args)
    }) as typeof nodeFs.close)
    syncBuiltinESMExports()

    let firstClose: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    try {
      subject.diagnostics.log(subject.diagnostics.scope(identity()), point('r2.end_write_failure'))
      expect(callback).toBeTypeOf('function')
      const closing = subject.close({ deadlineMs: 1_000 })
      await waitFor(subject, status => BigInt(status.acceptedCount) >= 3n)
      expect(closeCalls).toBe(0)
      if (sourceDescriptor !== undefined) {
        await new Promise<void>((resolve, reject) => {
          nodeFs.fstat(sourceDescriptor!, error => {
            if (error !== null) reject(error)
            else resolve()
          })
        })
      }
      callback?.(Object.assign(new Error('R2_END_WRITE_SECRET'), { code: 'EIO' }), 0)
      firstClose = await closing
      await waitFor(subject, status => status.writeProgress === 'failed')
      const closeDeadline = Date.now() + 1_000
      while (closeCalls === 0 && Date.now() < closeDeadline) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      if (closeCalls > 0) {
        await waitFor(subject, status => status.resource === 'released')
        repeated = await subject.close({ deadlineMs: 1_000 })
      }
      if (sourceDescriptor !== undefined) {
        openAfterFailure = await new Promise(resolve => {
          nodeFs.fstat(sourceDescriptor!, error => resolve(error === null))
        })
      }
    } finally {
      writeSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
      if (closeCalls === 0 && sourceDescriptor !== undefined) {
        await new Promise<void>(resolve => {
          originalClose(sourceDescriptor!, () => resolve())
        })
      }
    }

    expect(firstClose).toMatchObject({
      status: 'blocked',
      state: { phase: 'closing', writeProgress: 'failed' },
    })
    expect({ closeCalls, openAfterFailure }).toEqual({ closeCalls: 1, openAfterFailure: false })
    expect(repeated).toMatchObject({
      status: 'closed',
      state: { phase: 'closed', resource: 'released' },
    })
    expect(directoryOwner.inspect()).toMatchObject({
      phase: 'active',
      lastErrorCode: null,
      resource: 'held',
    })
    const successor = await directoryOwner.create(
      sourceOptions(options(directory, 'source-r2-successor')),
    )
    expect(successor.status).toBe('created')
    if (successor.status === 'created') {
      await expect(successor.runtime.close({ deadlineMs: 1_000 })).resolves.toMatchObject({
        status: 'closed',
        state: { resource: 'released' },
      })
    }
  })

  it('does not close a reused fd after the underlying source close returned an error', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r2-write-close-'))
    const sentinel = join(directory, 'r2-sentinel')
    const subject = await runtime(directory, 'source-r2')
    await waitFor(subject, status => status.pendingBytes === 0)

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    const originalClose = nodeFs.close as unknown as FlexibleCall
    let failedDescriptor: number | undefined
    let reusedDescriptor: number | undefined
    let writeFailed = false
    let closeFailed = false
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (writeFailed) return originalWrite(...args)
      writeFailed = true
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.write signature')
      process.nextTick(() =>
        callback(Object.assign(new Error('R2_WRITE_SECRET'), { code: 'EIO' }), 0),
      )
      return undefined
    }) as typeof nodeFs.write)
    const closeSpy = vi.spyOn(nodeFs, 'close').mockImplementation(((...args: unknown[]) => {
      if (closeFailed) return originalClose(...args)
      closeFailed = true
      failedDescriptor = args[0] as number
      const callback = args.at(-1)
      if (typeof callback !== 'function') throw new Error('unexpected fs.close signature')
      originalClose(failedDescriptor, (closeError: NodeJS.ErrnoException | null) => {
        if (closeError !== null) {
          callback(closeError)
          return
        }
        nodeFs.open(sentinel, 'w', 0o600, (openError, descriptor) => {
          if (openError !== null) {
            callback(openError)
            return
          }
          reusedDescriptor = descriptor
          callback(Object.assign(new Error('R2_CLOSE_SECRET'), { code: 'EIO' }))
        })
      })
      return undefined
    }) as typeof nodeFs.close)
    syncBuiltinESMExports()

    let retried: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    let beforeRetry: ReturnType<DiagnosticsRuntime['inspect']> | undefined
    try {
      subject.diagnostics.log(subject.diagnostics.scope(identity()), point('r2.write_failure'))
      await waitFor(subject, () => closeFailed)
      beforeRetry = await waitFor(subject, status => status.resource === 'unknown')
      writeSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
      retried = await subject.close({ deadlineMs: 100 })
      expect(reusedDescriptor).toBe(failedDescriptor)
      if (reusedDescriptor !== undefined) {
        await new Promise<void>((resolve, reject) => {
          nodeFs.fstat(reusedDescriptor!, error => {
            if (error !== null) reject(error)
            else resolve()
          })
        })
      }
    } finally {
      writeSpy.mockRestore()
      closeSpy.mockRestore()
      syncBuiltinESMExports()
      if (reusedDescriptor !== undefined) {
        await new Promise<void>(resolve => {
          originalClose(reusedDescriptor!, () => resolve())
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
      status: 'blocked',
      state: { phase: 'closing', resource: 'unknown' },
    })
  })
})

describe('D1-R3 scanned source cleanup ownership', () => {
  it('retains an old FileHandle whose close result is unknown without retrying it', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r3-scan-close-'))
    const oldSourceId = 'old-r3'
    const oldHash = createHash('sha256').update(oldSourceId).digest('hex').slice(0, 16)
    const oldPath = join(directory, `diagnostic-${oldHash}.jsonl`)
    await writeFile(
      oldPath,
      `${JSON.stringify({
        formatVersion: 'omne-diagnostic/1',
        sourceId: oldSourceId,
        code: 'diagnostic.source_started',
      })}\n${JSON.stringify({
        formatVersion: 'omne-diagnostic/1',
        sourceId: oldSourceId,
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

    let result: Awaited<ReturnType<typeof createLocalDiagnosticsDirectory>>
    try {
      result = await createLocalDiagnosticsDirectory(
        directoryOptions(options(directory, 'source-r3')),
      )
    } finally {
      openSpy.mockRestore()
      syncBuiltinESMExports()
    }
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable' || result.cleanup === null || retained === undefined) return

    try {
      expect(result.cleanup.inspect()).toMatchObject({
        phase: 'closing',
        lock: 'held',
        scan: 'incomplete',
        resource: 'unknown',
      })
      const repeated = await result.cleanup.close({ deadlineMs: 1_000 })
      expect(repeated).toMatchObject({
        status: 'blocked',
        state: { lock: 'held', scan: 'incomplete', resource: 'unknown' },
      })
      await expect(retained.read(Buffer.alloc(1), 0, 1, 0)).resolves.toMatchObject({ bytesRead: 1 })
    } finally {
      await retained.close().catch(() => {})
      cleanupsRetainedUntilTestProcessExit.push(result.cleanup)
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
      const ownerState = ownersByDirectory.get(directory)?.inspect()
      expect(ownerState).toBeDefined()
      expect(BigInt(ownerState?.reservedBytes ?? '0')).toBe(BigInt(subject.inspect().pendingBytes))
      expect(BigInt(ownerState?.chargedBytes ?? '0')).toBeLessThanOrEqual(
        BigInt(options(directory, 'source-r6-summary').maxDirectoryBytes),
      )
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
        BigInt(afterRecovery.gaps.find(gap => gap.reason === 'buffer_capacity')?.count ?? '0'),
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

  it('writes the gap summary before clean end when close starts before write recovery', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r6-close-recovery-'))
    const creation = await createLocalDiagnostics(
      options(directory, 'source-r6-close-recovery', {
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
    let closed: Awaited<ReturnType<DiagnosticsRuntime['close']>> | undefined
    try {
      const context = subject.diagnostics.scope(identity())
      for (let index = 0; index < 20; index += 1) {
        subject.diagnostics.log(context, point(`r6.close_buffer.${index}`))
      }
      expect(
        BigInt(subject.inspect().gaps.find(gap => gap.reason === 'buffer_capacity')?.count ?? '0'),
      ).toBeGreaterThan(1n)
      expect(delayed).toBeDefined()

      const closing = subject.close({ deadlineMs: 1_000 })
      await new Promise(resolve => setImmediate(resolve))
      if (delayed !== undefined) originalWrite(...delayed)
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      closed = await closing
      expect(closed).toMatchObject({
        status: 'closed',
        state: { phase: 'closed', resource: 'released' },
      })

      const lines = await records(directory)
      const summaryIndex = lines.findIndex(line => line.code === 'diagnostic.gap')
      const endIndex = lines.findIndex(line => line.code === 'diagnostic.source_closed')
      expect(summaryIndex).toBeGreaterThanOrEqual(0)
      expect(endIndex).toBeGreaterThan(summaryIndex)
    } finally {
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      if (delayed !== undefined && closed?.state.resource !== 'released') originalWrite(...delayed)
      await subject.close({ deadlineMs: 1_000 })
    }
  })
})

describe('D1-R1 shared directory budgets', () => {
  it('includes an older live generation and its pending span end in the directory byte budget', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r1-directory-bytes-'))
    const limits = {
      maxRecordBytes: 1_024,
      maxBufferBytes: 2_048,
      maxFileBytes: 2_000,
      maxDirectoryBytes: 2_400,
      maxFiles: 4,
    } as const
    const ownerCreation = await createLocalDiagnosticsDirectory(
      directoryOptions(options(directory, 'source-r1-owner', limits)),
    )
    expect(ownerCreation.status).toBe('created')
    if (ownerCreation.status !== 'created') return
    owners.add(ownerCreation.owner)
    const oldCreation = await ownerCreation.owner.create(
      sourceOptions(options(directory, 'source-r1-old', limits)),
    )
    expect(oldCreation.status).toBe('created')
    if (oldCreation.status !== 'created') return
    const oldRuntime = oldCreation.runtime
    await waitForCode(directory, 'diagnostic.source_started')
    const oldContext = oldRuntime.diagnostics.scope(identity())
    const oldSpan = oldRuntime.diagnostics.startSpan(oldContext, point('r1.old_span'))

    const originalWrite = nodeFs.write as unknown as FlexibleCall
    let pendingOldSpan: unknown[] | undefined
    const writeSpy = vi.spyOn(nodeFs, 'write').mockImplementation(((...args: unknown[]) => {
      if (pendingOldSpan === undefined) {
        pendingOldSpan = args
        return undefined
      }
      return originalWrite(...args)
    }) as typeof nodeFs.write)
    let newRuntime: DiagnosticsRuntime | undefined
    try {
      oldSpan.end({ code: 'r1.old_span_done', outcome: 'ok' })
      await waitFor(oldRuntime, status => status.pendingBytes > 0)
      const newCreation = await ownerCreation.owner.create(
        sourceOptions(options(directory, 'source-r1-new', limits)),
      )
      expect(newCreation.status).toBe('created')
      if (newCreation.status !== 'created') return
      newRuntime = newCreation.runtime

      expect(pendingOldSpan).toBeDefined()
      if (pendingOldSpan !== undefined) originalWrite(...pendingOldSpan)
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      await waitForCode(directory, 'r1.old_span_done')

      const newContext = newRuntime.diagnostics.scope(identity())
      for (let index = 0; index < 30; index += 1) {
        oldRuntime.diagnostics.log(oldContext, point(`r1.old.${index}`))
        newRuntime.diagnostics.log(newContext, point(`r1.new.${index}`))
      }
      await waitFor(oldRuntime, status => status.pendingBytes === 0)
      await waitFor(newRuntime, status => status.pendingBytes === 0)

      const sizes = await Promise.all(
        (await readdir(directory)).map(
          async file => (await nodeFsPromises.stat(join(directory, file))).size,
        ),
      )
      expect(Math.max(...sizes)).toBeLessThanOrEqual(limits.maxFileBytes)
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(
        limits.maxDirectoryBytes,
      )
    } finally {
      writeSpy.mockRestore()
      syncBuiltinESMExports()
      if (pendingOldSpan !== undefined && oldRuntime.inspect().pendingBytes > 0) {
        originalWrite(...pendingOldSpan)
      }
      await oldRuntime.close({ deadlineMs: 1_000 })
      if (newRuntime !== undefined) await newRuntime.close({ deadlineMs: 1_000 })
    }
  })

  it('reserves maxFiles across concurrent factory creation', async () => {
    const directory = await mkdtemp(join(scratchRoot, 'r1-directory-files-'))
    const ownerCreation = await createLocalDiagnosticsDirectory(
      directoryOptions(
        options(directory, 'source-r1-owner', {
          maxFiles: 1,
        }),
      ),
    )
    expect(ownerCreation.status).toBe('created')
    if (ownerCreation.status !== 'created') return
    owners.add(ownerCreation.owner)
    const originalOpen = nodeFs.open as unknown as FlexibleCall
    const pendingOpens: unknown[][] = []
    const opened = new Promise<void>(resolveOpened => {
      vi.spyOn(nodeFs, 'open').mockImplementation(((...args: unknown[]) => {
        pendingOpens.push(args)
        resolveOpened()
        return undefined
      }) as typeof nodeFs.open)
    })
    syncBuiltinESMExports()

    let runtimes: DiagnosticsRuntime[] = []
    try {
      const first = ownerCreation.owner.create(
        sourceOptions(
          options(directory, 'source-r1-concurrent-a', {
            maxFiles: 1,
          }),
        ),
      )
      await opened
      const second = ownerCreation.owner.create(
        sourceOptions(
          options(directory, 'source-r1-concurrent-b', {
            maxFiles: 1,
          }),
        ),
      )
      expect(pendingOpens).toHaveLength(1)
      for (const pending of pendingOpens) originalOpen(...pending)
      const creations = await Promise.all([first, second])
      runtimes = creations.flatMap(result => (result.status === 'created' ? [result.runtime] : []))
      expect(creations).toContainEqual(
        expect.objectContaining({
          status: 'unavailable',
          code: 'RETENTION_CAPACITY',
        }),
      )
      expect(runtimes).toHaveLength(1)
      expect(runtimes[0]?.inspect().resource).toBe('held')
      expect(
        (await readdir(directory)).filter(file => file.startsWith('diagnostic-')),
      ).toHaveLength(1)
    } finally {
      vi.restoreAllMocks()
      syncBuiltinESMExports()
      await Promise.all(runtimes.map(subject => subject.close({ deadlineMs: 1_000 })))
    }
  })
})
