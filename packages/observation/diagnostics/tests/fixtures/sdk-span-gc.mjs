import { TracerProvider } from '@opentelemetry/sdk-trace'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDiagnosticsDirectory } from '../../dist/index.js'

const originalGetTracer = TracerProvider.prototype.getTracer
let sdkSpan
TracerProvider.prototype.getTracer = function (...args) {
  const tracer = originalGetTracer.apply(this, args)
  return {
    startSpan(...spanArgs) {
      const span = tracer.startSpan(...spanArgs)
      sdkSpan = new WeakRef(span)
      return span
    },
  }
}

const directory = await mkdtemp(join(tmpdir(), 'diagnostics-sdk-span-gc-'))
let retainedContext
let retainedRuntime
let retainedOwner
try {
  ;({ context: retainedContext, runtime: retainedRuntime, owner: retainedOwner } = await exercise())
} finally {
  TracerProvider.prototype.getTracer = originalGetTracer
}

async function exercise() {
  const directoryResult = await createLocalDiagnosticsDirectory({
    directory,
    maxDirectoryBytes: 128 * 1024,
    maxFiles: 4,
  })
  if (directoryResult.status !== 'created') throw new Error('diagnostics directory creation failed')
  const owner = directoryResult.owner
  const result = await owner.create({
    instanceId: 'instance-r4-gc',
    sourceId: 'source-r4-gc',
    level: 'debug',
    maxRecordBytes: 8 * 1024,
    maxActiveSpans: 4,
    maxBufferBytes: 16 * 1024,
    maxFileBytes: 64 * 1024,
  })
  if (result.status !== 'created') throw new Error('diagnostics creation failed')
  const runtime = result.runtime
  const root = runtime.diagnostics.scope({
    tenantId: 'tenant-r4',
    principal: { kind: 'user', user: { userId: 'user-r4' } },
    causality: {},
  })
  let publicSpan = runtime.diagnostics.startSpan(root, {
    component: 'diagnostics.review',
    phase: 'runtime',
    code: 'r4.gc',
    level: 'info',
  })
  const context = publicSpan.context
  publicSpan.end({ code: 'r4.gc_done', outcome: 'ok' })
  publicSpan = undefined
  return { context, runtime, owner }
}

for (let attempt = 0; attempt < 100; attempt += 1) {
  globalThis.gc()
  await new Promise(resolve => setImmediate(resolve))
}

const sdkSpanCollected = sdkSpan?.deref() === undefined
await retainedRuntime.close({ deadlineMs: 1_000 })
await retainedOwner.close({ deadlineMs: 1_000 })
process.stdout.write(
  `${JSON.stringify({
    sdkSpanCollected,
    retainedContext: retainedContext !== undefined,
  })}\n`,
)
if (!sdkSpanCollected) process.exitCode = 1
