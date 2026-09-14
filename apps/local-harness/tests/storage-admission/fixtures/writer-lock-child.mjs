import { createLocalDiagnosticsDirectory } from '@omne-harness-lite/diagnostics'
import { createJsonlProvider } from '@omne-harness-lite/jsonl'

const [recordDirectory, diagnosticDirectory] = process.argv.slice(2)
if (
  recordDirectory === undefined ||
  diagnosticDirectory === undefined ||
  process.send === undefined
) {
  process.exitCode = 2
} else {
  const directory = await createLocalDiagnosticsDirectory({
    directory: diagnosticDirectory,
    maxDirectoryBytes: 128 * 1024,
    maxFiles: 2,
  })
  if (directory.status !== 'created') {
    process.send({ status: 'diagnostics_failed', detail: directory })
    process.exitCode = 3
  } else {
    const source = await directory.owner.create({
      instanceId: 'writer-lock-child',
      sourceId: 'writer-lock-child',
      level: 'debug',
      maxRecordBytes: 8 * 1024,
      maxActiveSpans: 4,
      maxBufferBytes: 32 * 1024,
      maxFileBytes: 64 * 1024,
    })
    if (source.status !== 'created') {
      process.send({ status: 'diagnostics_source_failed', detail: source })
      await directory.owner.close({ deadlineMs: 1_000 })
      process.exitCode = 4
    } else {
      const provider = createJsonlProvider(
        {
          coordinationDomain: 'local-harness-test-domain',
          directory: recordDirectory,
          bindings: [{ namespace: 'core', owners: ['session'], allowSystemScope: false }],
          limits: {
            maxBytes: 16_384,
            maxDepth: 32,
            maxNodes: 1_024,
            maxLineBytes: 32_768,
            maxPayloadBytes: 16_384,
            maxPendingCommits: 8,
            maxPendingBytes: 128_000,
          },
        },
        source.runtime.diagnostics,
      )
      const acquired = await provider.acquireWriter()
      if (acquired.status !== 'acquired') {
        process.send({ status: 'writer_failed', detail: acquired })
        await source.runtime.close({ deadlineMs: 1_000 })
        await directory.owner.close({ deadlineMs: 1_000 })
        process.exitCode = 5
      } else {
        process.send({ status: 'acquired', epoch: acquired.writer.writerEpoch })
        process.on('message', async message => {
          if (message !== 'close') return
          const writer = await acquired.writer.closeWriter()
          const runtime = await source.runtime.close({ deadlineMs: 1_000 })
          const owner = await directory.owner.close({ deadlineMs: 1_000 })
          process.send?.({ status: 'closed', writer, runtime, owner })
        })
      }
    }
  }
}
