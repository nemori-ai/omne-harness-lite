import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createClientAssembly, type ClientAssemblyBindings } from '../src/assembly.ts'
import { ClientAssemblyStopped } from '../src/client-assembly.ts'
import { ClientStateUsageDefect } from '@omne-harness-lite/client-local-state'

test('preparation borrows the actual managed CLS only after complete startup', async () => {
  const root = await mkdtemp('/tmp/omne-cli-borrow-state-')
  const directory = join(root, 'auth')
  const assembly = createClientAssembly({ directory })
  try {
    const source = await assembly.borrowState()
    await assembly.ready
    const initial = await source.read()
    expect(initial.kind).toBe('read')
    if (initial.kind !== 'read') throw new Error('source unavailable')
    expect(
      await source.compareAndReplace(initial.snapshot.token, null, 'original-write'),
    ).toMatchObject({
      kind: 'installed',
    })
    expect(await (await assembly.borrowState()).read()).toMatchObject({
      kind: 'read',
      snapshot: { operationId: 'original-write' },
    })
    assembly.requestStop()
    await expect(assembly.borrowState()).rejects.toBeInstanceOf(ClientAssemblyStopped)
    await assembly.clientStopped
    // The app still owns this dependency until presentation releases its gate.
    expect((await source.read()).kind).toBe('read')
    assembly.releasePresentation()
    expect((await assembly.closed).complete).toBe(true)
    await expect(source.read()).rejects.toBeInstanceOf(ClientStateUsageDefect)
    await expect(assembly.borrowState()).rejects.toBeInstanceOf(ClientAssemblyStopped)
  } finally {
    assembly.requestStop()
    assembly.releasePresentation()
    await assembly.closed
    await rm(root, { recursive: true, force: true })
  }
})

test('state borrowing cannot expose a CLS from a failed startup prefix', async () => {
  const root = await mkdtemp('/tmp/omne-cli-borrow-failure-')
  const assembly = createClientAssembly({ directory: join(root, 'auth'), timeoutMs: 0 })
  try {
    const original = await assembly.ready.catch(error => error)
    await expect(assembly.borrowState()).rejects.toBe(original)
  } finally {
    assembly.requestStop()
    await assembly.clientStopped
    assembly.releasePresentation()
    await assembly.closed
    await rm(root, { recursive: true, force: true })
  }
})

test('an immediate stop rejects borrowing before any ready publication', async () => {
  const assembly = createClientAssembly({ directory: '/unused' })
  assembly.requestStop()
  try {
    await expect(assembly.borrowState()).rejects.toBeInstanceOf(ClientAssemblyStopped)
    await expect(assembly.ready).rejects.toBeInstanceOf(ClientAssemblyStopped)
  } finally {
    await assembly.clientStopped
    assembly.releasePresentation()
    await assembly.closed
  }
})

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
