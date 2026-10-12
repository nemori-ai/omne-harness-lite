import { Worker } from 'node:worker_threads'
import { SnapshotFailure, StorageDefect } from '@omne-harness-lite/storage'

/**
 * Internal fixed entry. Cancellation never treats a request or message as exit.
 * Source execution uses Node24 type stripping; distributed execution uses emitted JS.
 */
export async function checkPhysicalSnapshot(file: string): Promise<void> {
  const url = new URL(
    import.meta.url.endsWith('.ts') ? './inspection-worker.ts' : './inspection-worker.js',
    import.meta.url,
  )
  const worker = new Worker(url, { workerData: { file }, execArgv: [], stdout: true, stderr: true })
  let result: unknown
  let messages = 0
  let failed = false
  const code = await new Promise<number>(resolve => {
    worker.on('message', value => {
      messages += 1
      result = value
    })
    worker.on('messageerror', () => {
      failed = true
    })
    worker.on('error', () => {
      failed = true
    })
    worker.once('exit', resolve)
  })
  if (
    failed ||
    code !== 0 ||
    messages !== 1 ||
    typeof result !== 'object' ||
    result === null ||
    Object.keys(result).length !== 1 ||
    !('status' in result)
  )
    throw new StorageDefect('snapshot worker did not close with one valid result')
  switch (result.status) {
    case 'ok':
      return
    case 'invalid-data':
      throw new SnapshotFailure('invalid-data')
    case 'unavailable':
      throw new SnapshotFailure('unavailable')
    default:
      throw new StorageDefect('snapshot worker reported an internal defect')
  }
}
