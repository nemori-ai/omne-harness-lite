import { stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { createLocalDiagnosticsDirectory } from '../../dist/index.js'

const directory = process.argv[2]
const factory = await createLocalDiagnosticsDirectory({
  directory,
  maxDirectoryBytes: 4 * 1_024,
  maxFiles: 2,
})
if (factory.status !== 'created') throw new Error(`factory failed: ${factory.code}`)
const created = await factory.owner.create({
  instanceId: 'short-write-child',
  sourceId: 'short-write-source',
  level: 'debug',
  maxRecordBytes: 512,
  maxActiveSpans: 4,
  maxBufferBytes: 1_024,
  maxFileBytes: 2 * 1_024,
})
if (created.status !== 'created') throw new Error(`source failed: ${created.code}`)

const waitFor = async predicate => {
  const deadline = Date.now() + 1_000
  do {
    const status = created.runtime.inspect()
    if (predicate(status)) return status
    await new Promise(resolve => setTimeout(resolve, 5))
  } while (Date.now() < deadline)
  throw new Error('short write child timed out')
}
await waitFor(status => status.pendingBytes === 0)

const nodeFs = createRequire(import.meta.url)('node:fs')
const originalWrite = nodeFs.write
let shortWrite = false
nodeFs.write = (...args) => {
  if (shortWrite) return originalWrite(...args)
  shortWrite = true
  const callback = args.at(-1)
  const length = args[3]
  if (typeof callback !== 'function' || typeof length !== 'number') {
    throw new Error('unexpected fs.write signature')
  }
  const partialArgs = [...args]
  partialArgs[3] = Math.max(1, Math.floor(length / 2))
  partialArgs[partialArgs.length - 1] = (error, written) => {
    if (error !== null) callback(error, written)
    else callback(Object.assign(new Error('SHORT_WRITE_SECRET'), { code: 'EIO' }), written)
  }
  return originalWrite(...partialArgs)
}
syncBuiltinESMExports()

const context = created.runtime.diagnostics.scope({
  tenantId: 'tenant-short',
  principal: { kind: 'user', user: { userId: 'user-short' } },
  causality: {},
})
created.runtime.diagnostics.log(context, {
  component: 'diagnostics.directory',
  phase: 'write',
  code: 'directory.short_write',
  level: 'error',
})
await waitFor(status => status.writeProgress === 'failed')
const before = factory.owner.inspect()
const sourceFile = (await readdir(directory)).find(file => file.startsWith('diagnostic-'))
if (sourceFile === undefined) throw new Error('source file missing')
const actualBytes = (await stat(join(directory, sourceFile))).size
const close = await created.runtime.close({ deadlineMs: 100 })
const after = factory.owner.inspect()
nodeFs.write = originalWrite
syncBuiltinESMExports()

await new Promise((resolve, reject) => {
  process.send?.(
    {
      shortWrite,
      before,
      close,
      after,
      actualBytes,
    },
    error => {
      if (error !== null) reject(error)
      else resolve()
    },
  )
})
process.disconnect?.()
