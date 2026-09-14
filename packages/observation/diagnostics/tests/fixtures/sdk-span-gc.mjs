import { TracerProvider } from '@opentelemetry/sdk-trace'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDiagnostics } from '../../dist/index.js'

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
let runtime
let publicSpan
let retainedContext
try {
  const result = await createLocalDiagnostics({
    instanceId: 'instance-r4-gc',
    sourceId: 'source-r4-gc',
    directory,
    level: 'debug',
    maxRecordBytes: 8 * 1024,
    maxActiveSpans: 4,
    maxBufferBytes: 16 * 1024,
    maxFileBytes: 64 * 1024,
    maxDirectoryBytes: 128 * 1024,
    maxFiles: 4,
  })
  if (result.status !== 'created') throw new Error('diagnostics creation failed')
  runtime = result.runtime
  const root = runtime.diagnostics.scope({
    tenantId: 'tenant-r4',
    principal: { kind: 'user', user: { userId: 'user-r4' } },
    causality: {},
  })
  publicSpan = runtime.diagnostics.startSpan(root, {
    component: 'diagnostics.review',
    phase: 'runtime',
    code: 'r4.gc',
    level: 'info',
  })
  retainedContext = publicSpan.context
  publicSpan.end({ code: 'r4.gc_done', outcome: 'ok' })
  publicSpan = undefined
  await runtime.close({ deadlineMs: 1_000 })
  runtime = undefined
} finally {
  TracerProvider.prototype.getTracer = originalGetTracer
}

for (let attempt = 0; attempt < 100 && sdkSpan?.deref() !== undefined; attempt += 1) {
  globalThis.gc()
  await new Promise(resolve => setImmediate(resolve))
}

process.stdout.write(
  `${JSON.stringify({
    sdkSpanCollected: sdkSpan?.deref() === undefined,
    retainedContext: retainedContext !== undefined,
  })}\n`,
)
if (sdkSpan?.deref() !== undefined) process.exitCode = 1
