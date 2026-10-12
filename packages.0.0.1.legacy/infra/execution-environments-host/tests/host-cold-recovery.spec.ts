// @module-tag slow
// SIGKILL destroys the creator. Recovery uses original durable coordinates, never a new execution.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { hostProviderFixture } from './host-provider-fixture.ts'
import { createHostEnvironment } from '../dist/host.js'
import type { ManagedResource } from '@omne-harness-lite/execution-environments'

test.each(['command', 'terminal'])(
  'cold %s owner is stopped from original index after creator SIGKILL, with no replay',
  { tags: ['slow'], timeout: 20000 },
  async mode => {
    const host = await hostProviderFixture(),
      marker = join(host.directory, 'once')
    const child = fork(
      fileURLToPath(new URL('./host-crash-child.mjs', import.meta.url)),
      [join(host.directory, 'host.sqlite'), marker, mode],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    let diagnostics = ''
    child.stderr?.on('data', part => {
      diagnostics += String(part)
    })
    const original = new Promise<{ resources: ManagedResource[] }>((resolve, reject) => {
      child.once('message', message => resolve(message as { resources: ManagedResource[] }))
      child.once('error', reject)
      child.once('exit', () =>
        reject(new Error(`Creator exited before native start: ${diagnostics}`)),
      )
    })
    let cold: ReturnType<typeof createHostEnvironment> | undefined
    try {
      const launched = await original
      const exit = once(child, 'exit')
      child.kill('SIGKILL')
      await exit
      expect(await readFile(marker, 'utf8')).toBe('x')
      cold = createHostEnvironment({
        name: 'real-host',
        storage: host.storage,
        access: host.access,
      })
      const indexed = await cold.listRecoveryResources(host.scope)
      expect(indexed.kind).toBe('resources')
      if (indexed.kind !== 'resources') throw new Error('Missing cold resource index')
      expect(indexed.values.map(value => value.key).sort()).toEqual(
        launched.resources.map(value => value.key).sort(),
      )
      for (const resource of indexed.values)
        expect(await cold.recover(resource)).toEqual({ status: 'confirmedStopped' })
      expect(await cold.listRecoveryResources(host.scope)).toEqual({
        kind: 'resources',
        values: [],
      })
      for (const resource of indexed.values)
        expect(await cold.recover(resource)).toEqual({ status: 'confirmedStopped' })
      expect(await readFile(marker, 'utf8')).toBe('x')
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit')
        child.kill('SIGKILL')
        await exit
      }
      await cold?.retire()
      await host.close()
    }
  },
)

test(
  'SIGKILL between original publication receipts recognizes a partial batch without replay or overwriting external writes',
  { tags: ['slow'], timeout: 20000 },
  async () => {
    const host = await hostProviderFixture(),
      marker = join(host.directory, 'batch-cut')
    const child = fork(
      fileURLToPath(new URL('./host-crash-child.mjs', import.meta.url)),
      [join(host.directory, 'host.sqlite'), marker, 'batch'],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    )
    let diagnostics = ''
    child.stderr?.on('data', part => {
      diagnostics += String(part)
    })
    const original = new Promise<{ resources: ManagedResource[] }>((resolve, reject) => {
      child.once('message', message => resolve(message as { resources: ManagedResource[] }))
      child.once('error', reject)
      child.once('exit', () => reject(new Error(`Creator exited before cut: ${diagnostics}`)))
    })
    let cold: ReturnType<typeof createHostEnvironment> | undefined
    try {
      const launched = await original
      const exit = once(child, 'exit')
      child.kill('SIGKILL')
      await exit
      expect(await readFile(marker + '-a', 'utf8')).toBe('first')
      await expect(readFile(marker + '-b')).rejects.toMatchObject({ code: 'ENOENT' })
      cold = createHostEnvironment({
        name: 'real-host',
        storage: host.storage,
        access: host.access,
      })
      const indexed = await cold.listRecoveryResources(host.scope)
      if (indexed.kind !== 'resources') throw new Error('Cold batch index unavailable')
      expect(indexed.values).toEqual(launched.resources)
      expect(await cold.recover(indexed.values[0]!)).toMatchObject({
        status: 'confirmedStopped',
        evidence: { kind: 'fileBatch', state: 'partial', matchingPrepared: [marker + '-a'] },
      })
      expect(
        (await readdir(host.directory)).filter(name => name.startsWith('.omne-stage')),
      ).toEqual([])
      await writeFile(marker + '-a', 'external-new')
      expect(await cold.recover(indexed.values[0]!)).toMatchObject({
        status: 'confirmedStopped',
        evidence: { state: 'conflict', conflicting: [marker + '-a'] },
      })
      expect(await readFile(marker + '-a', 'utf8')).toBe('external-new')
      await expect(readFile(marker + '-b')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit')
        child.kill('SIGKILL')
        await exit
      }
      await cold?.retire()
      await host.close()
    }
  },
)
