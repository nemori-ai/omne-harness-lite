import { expect, it, vi } from 'vitest'
import { buildReadMaterials, readRequest } from './read-support.ts'
import { createProvider, makeWorkspace, recordingLeases, registration } from './support.ts'

const fault = vi.hoisted(() => ({ rejectReader: false }))

vi.mock('node:worker_threads', async importOriginal => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: class extends actual.Worker {
      constructor(...args: ConstructorParameters<typeof actual.Worker>) {
        if (fault.rejectReader && String(args[0]).includes('/worker/reader.'))
          throw Object.assign(new Error('EAGAIN'), { code: 'ERR_WORKER_INIT_FAILED' })
        super(...args)
      }
    },
  }
})

it('returns a failed read and releases its lease and budget when a reader cannot start', async () => {
  const workspace = await makeWorkspace()
  const leases = recordingLeases()
  const built = await buildReadMaterials(workspace)
  const provider = await createProvider(
    workspace,
    built,
    { readQueuePerDomain: 1, readQueueGlobal: 1, readQueueTimeoutMs: 100 },
    leases,
  )
  try {
    expect(await provider.storage.registerCombination(registration(built))).toHaveProperty(
      'kind',
      'registered',
    )
    fault.rejectReader = true
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(await provider.storage.read(readRequest('page'))).toMatchObject({
        kind: 'unavailable',
        reason: 'read_failed',
      })
      const readerLeases = leases.admitted.filter(name => name.includes('/reader/'))
      expect(readerLeases).toHaveLength(attempt + 1)
      expect(leases.released).toEqual(readerLeases)
    }
    fault.rejectReader = false
    expect(await provider.storage.read(readRequest('page'))).toHaveProperty('kind', 'read')
    expect(await provider.control.close({ initiator: 'assembly' })).toEqual({ kind: 'closed' })
    provider.control.assemblyReportSettled()
    expect([...leases.released].sort()).toEqual([...leases.admitted].sort())
  } finally {
    fault.rejectReader = false
    await provider.control.close({ initiator: 'disposal' })
    await workspace.remove()
  }
})
