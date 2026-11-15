import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReaderEnv, ReaderEnvelope, ReaderReply } from '../src/worker/reader-protocol.ts'
import { makeWorkspace, type Workspace } from './support.ts'

let workspace: Workspace
beforeEach(async () => {
  workspace = await makeWorkspace()
})
afterEach(async () => {
  await workspace.remove()
})

async function openReader(file: string): Promise<ReaderReply> {
  const env: ReaderEnv = { file, domain: 'domain-a', lockWaitMs: 1000, generation: 1 }
  const worker = new Worker(new URL('../src/worker/reader.ts', import.meta.url), {
    workerData: env,
  })
  try {
    return await new Promise<ReaderReply>((resolve, reject) => {
      worker.on('message', (envelope: ReaderEnvelope) => resolve(envelope.reply))
      worker.on('error', reject)
      worker.postMessage({ generation: 1, seq: 1, token: 't', request: { kind: 'open' } })
    })
  } finally {
    await worker.terminate()
  }
}

describe('read connection opens read-only (SPEC 9.5)', () => {
  it('does not create a database file for a path that has none', async () => {
    const file = join(workspace.root, 'absent.sqlite')
    const reply = await openReader(file)
    expect(reply.kind).toBe('open_failed')
    expect(existsSync(file)).toBe(false)
  })
})
