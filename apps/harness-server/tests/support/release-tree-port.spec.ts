import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onReleaseTree } from './release-tree.ts'

const probed = vi.hoisted(() => ({ ports: [] as number[], holders: [] as Server[] }))

vi.mock('./listening.ts', async original => {
  const real = await original<typeof import('./listening.ts')>()
  return {
    ...real,
    async freePort() {
      const port = await real.freePort()
      if (probed.ports.push(port) === 1)
        await new Promise<void>(bound => {
          probed.holders.push(createServer().listen(port, '127.0.0.1', bound))
        })
      return port
    },
  }
})

afterEach(() => {
  for (const holder of probed.holders.splice(0)) holder.close()
})

describe('the release tree and the port it probed', () => {
  it(
    'starts again on a new port when another socket took the port before the server bound it',
    { tags: ['slow'], timeout: 120_000 },
    async () => {
      let served: number | undefined
      const exitCode = await onReleaseTree(
        { script: () => ({ status: 500, contentType: 'text/plain', body: 'no model call' }) },
        async tree => {
          served = tree.port
        },
      )
      expect(exitCode).toBe(0)
      expect(probed.ports).toHaveLength(2)
      expect(served).toBe(probed.ports[1])
    },
  )
})
