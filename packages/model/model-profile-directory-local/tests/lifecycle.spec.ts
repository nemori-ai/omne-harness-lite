import { BOUND_CREDENTIAL_REPLICA_READER, FACTORY_MODEL_CREDENTIAL } from '@omne-harness-lite/model-profile-directory/cordis'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { createCredentialBindingReader } from '../src/tx-reads.ts'
import { modelProfileDirectoryPlugin, localCredentialLookupPlugin } from '../src/cordis.ts'
import {
  setup,
  alice,
  scope,
  content,
  open,
  file,
  seedMemberships,
  boot,
  catalog,
  actualClock,
} from './support.ts'
import type {
  CredentialLookup,
  DirectoryDiagnostic,
} from '@omne-harness-lite/model-profile-directory'

function deferred() {
  let done: (() => void) | undefined
  const promise = new Promise<void>(resolve => {
    done = resolve
  })
  return {
    promise,
    resolve() {
      if (done === undefined) throw new Error('deferred not ready')
      done()
    },
  }
}
it('V3-12 actual dispose shuts admission, waits admitted method, preserves commit and borrowed providers', async () => {
  const storage = await open(file('drain'))
  await seedMemberships(storage)
  const admitted = deferred(),
    release = deferred(),
    closing = deferred(),
    events: DirectoryDiagnostic[] = []
  const assembly = await boot(storage, undefined, {
    record: event => {
      events.push(event)
      if (event.phase === 'close' && event.outcome === 'admission_closed') closing.resolve()
    },
  })
  const c = catalog(assembly),
    original = storage.write.bind(storage)
  const write = vi.spyOn(storage, 'write').mockImplementation(async fn => {
    admitted.resolve()
    await release.promise
    return original(fn)
  })
  try {
    const work = c.registerProfile(alice, scope, content())
    await admitted.promise
    const directory = assembly.fibers.at(-1)
    if (directory === undefined) throw new Error('directory fiber absent')
    let disposed = false
    const dispose = directory.dispose().then(() => {
      disposed = true
    })
    await closing.promise
    expect(disposed).toBe(false)
    expect(await c.listProfiles(alice)).toEqual({ failure: 'unavailable' })
    release.resolve()
    expect(await work).toHaveProperty('profile')
    await dispose
    expect(disposed).toBe(true)
    expect(events).toContainEqual({ operation: 'provider', phase: 'close', outcome: 'drained' })
    expect(
      await storage.read(async tx => tx.db.selectFrom('model_profile').selectAll().execute()),
    ).toHaveLength(1)
    expect(actualClock(assembly).now()).not.toBe('unavailable')
  } finally {
    release.resolve()
    write.mockRestore()
    await assembly.dispose()
    await storage.close()
  }
})
it('V3-16 tx reader rejects foreign/expired/overlapping real units and a caught defect still rolls back', async () => {
  const h = await setup('units'),
    other = await open(file('foreign'))
  try {
    await h.catalog.bindCredential(alice, alice, 'ref-a')
    const reader = createCredentialBindingReader(h.storage),
      foreign = createCredentialBindingReader(other)
    expect(await h.storage.atomic(unit => reader(unit, alice))).toHaveProperty(
      'binding.credentialRef',
      'ref-a',
    )
    const expired: StorageUnit[] = []
    await h.storage.atomic(async unit => {
      expired.push(unit)
    })
    const unit = expired[0]
    if (unit === undefined) throw new Error('unit missing')
    await expect(reader(unit, alice)).rejects.toBeInstanceOf(StorageDefect)
    await expect(
      h.storage.atomic(async u => {
        await u.mutate(tx =>
          tx.db
            .insertInto('directory_test_account')
            .values({ account_id: 'sentinel' })
            .execute()
            .then(() => undefined),
        )
        try {
          await foreign(u, alice)
        } catch (error) {
          expect(error).toBeInstanceOf(StorageDefect)
        }
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
    expect(
      await h.storage.read(async tx =>
        tx.db
          .selectFrom('directory_test_account')
          .selectAll()
          .where('account_id', '=', 'sentinel')
          .execute(),
      ),
    ).toEqual([])
    await expect(
      h.storage.atomic(async u => {
        await Promise.all([reader(u, alice), reader(u, alice)])
      }),
    ).rejects.toBeInstanceOf(StorageDefect)
  } finally {
    await other.close()
    await h.close()
  }
})
it('V3-16 four storage failures preserve category and strip dynamic message/cause', async () => {
  const h = await setup('errors')
  try {
    for (const error of [
      new StorageUnavailable('secret', { cause: 'secret' }),
      new UniqueViolation('unknown-secret-constraint', { cause: 'secret' }),
      new ReferenceViolation('missing-target', { cause: 'secret' }),
      new StorageDefect('secret', { cause: 'secret' }),
    ]) {
      const read = vi.spyOn(h.storage, 'read').mockRejectedValueOnce(error)
      if (error instanceof StorageUnavailable)
        expect(await h.read.listProfiles(alice)).toEqual({ failure: 'unavailable' })
      else {
        const result = await h.read.listProfiles(alice).catch((caught: unknown) => caught)
        expect(result).toBeInstanceOf(error.constructor)
        if (!(result instanceof Error)) throw new Error('expected error')
        expect(result.message).not.toContain('secret')
        expect(result.cause).toBeUndefined()
      }
      read.mockRestore()
    }
  } finally {
    await h.close()
  }
})
it('V3-12 configuration failure and required dependency absence use real Cordis lifecycle', async () => {
  const ctx = new Context()
  const pending = ctx.plugin(modelProfileDirectoryPlugin, {
    faceMode: 'management',
    officialManifest: { ordinal: 1, entries: [] },
  })
  expect(pending.state).toBe(0)
  await pending.dispose()
  await expect(
    bootAssembly({
      plugins: [{ plugin: localCredentialLookupPlugin, config: { mode: 'localCredentialOnly' } }],
    }),
  ).rejects.toThrow()
  const h = await setup('duplicate')
  try {
    await expect(
      h.assembly.ctx.plugin(modelProfileDirectoryPlugin, {
        faceMode: 'singleProcessCatalog',
        officialManifest: { ordinal: 1, entries: [] },
      }),
    ).rejects.toThrow()
  } finally {
    await h.close()
  }
})
it('P-1r storage-only factory lookup and borrowed-reader failure classification (port fixture; no CCL claim)', async () => {
  const h = await setup('lookup'),
    factory = vi.fn(async () => ({ body: new Uint8Array([7]) })),
    read = vi.fn(async () => ({ absent: true }) as const)
  const assembly = await bootAssembly({
    services: [{ name: 'storage', value: h.storage }, { name: BOUND_CREDENTIAL_REPLICA_READER, value: { readIn: read } }, ...(factory ? [{ name: FACTORY_MODEL_CREDENTIAL, value: { read: factory } }] : [])],
    plugins: [
      {
        plugin: localCredentialLookupPlugin,
        config: {
          mode: 'localCredentialOnly',
        },
      },
    ],
  })
  const lookup: unknown = assembly.ctx.get('credentialLookup')
  function isLookup(value: unknown): value is CredentialLookup {
    return (
      value !== null &&
      typeof value === 'object' &&
      'value' in value &&
      typeof value.value === 'function'
    )
  }
  if (!isLookup(lookup)) throw new Error('lookup missing')
  try {
    expect(await lookup.value(alice, 'official')).toEqual({
      scope: { layer: 'factory' },
      value: new Uint8Array([7]),
    })
    expect(await lookup.value(alice, 'custom')).toEqual({ failure: 'credentialUnavailable' })
    await h.catalog.bindCredential(alice, alice, 'ref-a')
    expect(await lookup.value(alice, 'official')).toEqual({ failure: 'credentialUnavailable' })
    expect(factory).toHaveBeenCalledTimes(1)
    read.mockRejectedValueOnce(new StorageUnavailable('secret'))
    expect(await lookup.value(alice, 'official')).toEqual({ failure: 'unavailable' })
    expect(factory).toHaveBeenCalledTimes(1)
    read.mockRejectedValueOnce(new StorageDefect('secret'))
    await expect(lookup.value(alice, 'official')).rejects.toBeInstanceOf(StorageDefect)
  } finally {
    await assembly.dispose()
    await h.close()
  }
})
