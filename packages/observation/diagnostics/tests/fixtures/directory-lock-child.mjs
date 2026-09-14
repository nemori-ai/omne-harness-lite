import { createLocalDiagnosticsDirectory } from '../../dist/index.js'

const directory = process.argv[2]
const result = await createLocalDiagnosticsDirectory({
  directory,
  maxDirectoryBytes: 64 * 1024,
  maxFiles: 4,
})

if (result.status !== 'created') {
  process.send?.({ status: result.status, code: result.code })
  process.exitCode = 1
} else {
  process.send?.({ status: 'created', state: result.owner.inspect() })
  await new Promise(resolve => {
    process.once('message', resolve)
  })
  const closed = await result.owner.close({ deadlineMs: 1_000 })
  process.send?.({ status: 'finished', closed })
}
