import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createClientAssembly, type ClientAssemblyBindings } from '../src/assembly.ts'

test('a missing managed dependency fails startup without pretending a complete assembly', async () => {
  let applied = false
  const assembly = createClientAssembly(
    { directory: '/unused' },
    {
      storage: {
        name: 'missing-storage-factory-dependency',
        assemblyLifecycle: 1,
        inject: ['missingFactoryResource'],
        apply() {
          applied = true
        },
      },
    },
  )
  await expect(assembly.ready).rejects.toThrow('dependency is missing')
  await assembly.clientStopped
  assembly.releasePresentation()
  const closed = await assembly.closed
  expect(applied).toBe(false)
  expect(closed.rows).toEqual([])
  expect(closed.complete).toBe(false)
  expect(closed.assemblyErrors).toContain('assembly-protocol-failed')
})

test('an unmanaged override fails before resource work and remains an assembly failure', async () => {
  let applied = false
  const bindings = {
    storage: {
      name: 'unmanaged',
      apply() {
        applied = true
      },
    },
  }
  const assembly = createClientAssembly(
    { directory: '/unused' },
    bindings as unknown as ClientAssemblyBindings,
  )
  await expect(assembly.ready).rejects.toThrow('managed binding')
  await assembly.clientStopped
  assembly.releasePresentation()
  const closed = await assembly.closed
  expect(applied).toBe(false)
  expect(closed.complete).toBe(false)
  expect(closed.assemblyErrors).toContain('assembly-protocol-failed')
})

test('rejected client config retains the actual CLS presentation gate and records startup failure', async () => {
  const root = await mkdtemp('/tmp/omne-cli-config-')
  const assembly = createClientAssembly({ directory: join(root, 'state'), timeoutMs: 0 })
  try {
    await expect(assembly.ready).rejects.toThrow()
    await assembly.clientStopped
    let finished = false
    void assembly.closed.then(() => {
      finished = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(finished).toBe(false)
    assembly.releasePresentation()
    const closed = await assembly.closed
    expect(closed.complete).toBe(false)
    expect(closed.assemblyErrors).toContain('assembly-protocol-failed')
    expect(closed.rows.map(row => row.id)).toEqual(['transport', 'localState', 'storage'])
  } finally {
    assembly.requestStop()
    assembly.releasePresentation()
    await assembly.closed
    await rm(root, { recursive: true, force: true })
  }
})
