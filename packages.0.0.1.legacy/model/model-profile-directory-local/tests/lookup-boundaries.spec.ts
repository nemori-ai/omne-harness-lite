// Draft only. Prove on original source after P2 has finished before any product extraction.
import { expect, it, vi } from 'vitest'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { StorageDefect, StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import type { CredentialLookup } from '@omne-harness-lite/model-profile-directory'
import {
  BOUND_CREDENTIAL_REPLICA_READER,
  FACTORY_MODEL_CREDENTIAL,
} from '@omne-harness-lite/model-profile-directory/cordis'
import { localCredentialLookupPlugin, modelProfileDirectoryPlugin } from '../src/cordis.ts'
import { setup, alice, actualClock, memberships, reading } from './support.ts'

function isLookup(value: unknown): value is CredentialLookup {
  return (
    value !== null &&
    typeof value === 'object' &&
    'value' in value &&
    typeof value.value === 'function'
  )
}

// Actual binding storage, unit and lifecycle; replica/factory bodies are explicit port fixtures.
// This does not prove credential-custodian supply or cross-process replica ownership.
for (const mode of [
  'value',
  'commit-unavailable',
  'commit-defect',
  'replica-empty',
  'replica-wrong-type',
] as const) {
  it(`holds a bound replica until the actual outer atomic terminates and rejects malformed bodies: ${mode}`, async () => {
    const h = await setup(`lookup-${mode}`)
    let restore: () => void = () => {}
    let assembly: Awaited<ReturnType<typeof bootAssembly>> | undefined
    try {
      await h.catalog.bindCredential(alice, alice, 'ref-a')
      const body = new Uint8Array([7, 8])
      const replica = vi.fn(async (unit: StorageUnit, tenant: unknown, ref: unknown) => {
        unit.assertStorage(h.storage)
        expect(tenant).toEqual(alice)
        expect(ref).toBe('ref-a')
        return {
          body:
            mode === 'replica-empty'
              ? new Uint8Array()
              : mode === 'replica-wrong-type'
                ? 'invalid-port-body'
                : body,
        }
      })
      const factory = vi.fn(async () => ({ body: new Uint8Array([9]) }))
      assembly = await bootAssembly({
        services: [
          { name: 'storage', value: h.storage },
          { name: BOUND_CREDENTIAL_REPLICA_READER, value: { readIn: replica } },
          { name: FACTORY_MODEL_CREDENTIAL, value: { read: factory } },
        ],
        plugins: [{ plugin: localCredentialLookupPlugin, config: { mode: 'localCredentialOnly' } }],
      })
      const lookup: unknown = assembly.ctx.get('credentialLookup')
      if (!isLookup(lookup)) throw new Error('lookup missing')
      if (mode === 'commit-unavailable' || mode === 'commit-defect') {
        const original = h.storage.atomic.bind(h.storage)
        const atomic = vi.spyOn(h.storage, 'atomic').mockImplementation(fn =>
          original(async unit => {
            await fn(unit)
            throw mode === 'commit-unavailable'
              ? new StorageUnavailable('private injected precommit detail')
              : new StorageDefect('private injected precommit detail')
          }),
        )
        restore = () => {
          atomic.mockRestore()
        }
      }
      const work = lookup.value(alice, 'official')
      if (mode === 'value') {
        const result = await work
        expect(result).toEqual({ scope: { layer: 'tenant', tenant: alice }, value: body })
        if ('failure' in result) throw new Error('expected actual bound value')
        expect(result.value).toBe(body)
      } else if (mode === 'commit-unavailable')
        expect(await work).toEqual({ failure: 'unavailable' })
      else await expect(work).rejects.toBeInstanceOf(StorageDefect)
      expect(replica).toHaveBeenCalledTimes(1)
      expect(factory).not.toHaveBeenCalled()
      restore()
      const binding = await h.read.credentialPresent(alice, 'official')
      expect(binding).toHaveProperty('present', true)
      expect(binding).not.toHaveProperty('credentialRef')
    } finally {
      restore()
      await assembly?.dispose()
      await h.close()
    }
  })
}

for (const mode of [
  'value',
  'absent',
  'unavailable',
  'empty',
  'wrong-type',
  'thrown-defect',
] as const) {
  it(`checks the factory only after an unbound official selection: ${mode}`, async () => {
    const h = await setup(`factory-${mode}`)
    let assembly: Awaited<ReturnType<typeof bootAssembly>> | undefined
    try {
      const body = new Uint8Array([11])
      const factory = vi.fn(async () => {
        if (mode === 'thrown-defect') throw new StorageDefect('private factory detail')
        if (mode === 'absent') return { absent: true } as const
        if (mode === 'unavailable') return { failure: 'unavailable' } as const
        return {
          body:
            mode === 'empty'
              ? new Uint8Array()
              : mode === 'wrong-type'
                ? 'invalid-port-body'
                : body,
        }
      })
      const replica = vi.fn(async () => ({ absent: true }) as const)
      assembly = await bootAssembly({
        services: [
          { name: 'storage', value: h.storage },
          { name: BOUND_CREDENTIAL_REPLICA_READER, value: { readIn: replica } },
          { name: FACTORY_MODEL_CREDENTIAL, value: { read: factory } },
        ],
        plugins: [{ plugin: localCredentialLookupPlugin, config: { mode: 'localCredentialOnly' } }],
      })
      const lookup: unknown = assembly.ctx.get('credentialLookup')
      if (!isLookup(lookup)) throw new Error('lookup missing')
      expect(await lookup.value(alice, 'custom')).toEqual({ failure: 'credentialUnavailable' })
      expect(factory).not.toHaveBeenCalled()
      const work = lookup.value(alice, 'official')
      if (mode === 'value') {
        const result = await work
        expect(result).toEqual({ scope: { layer: 'factory' }, value: body })
        if ('failure' in result) throw new Error('expected actual factory value')
        expect(result.value).toBe(body)
      } else if (mode === 'absent') expect(await work).toEqual({ failure: 'credentialUnavailable' })
      else if (mode === 'unavailable') expect(await work).toEqual({ failure: 'unavailable' })
      else await expect(work).rejects.toBeInstanceOf(StorageDefect)
      expect(factory).toHaveBeenCalledTimes(1)
      expect(replica).not.toHaveBeenCalled()
    } finally {
      await assembly?.dispose()
      await h.close()
    }
  })
}

it('development faces keep validated lookup unavailable even when configured presence is true, without taking storage or membership work', async () => {
  const h = await setup('development-faces')
  let assembly: Awaited<ReturnType<typeof bootAssembly>> | undefined
  const restore: (() => void)[] = []
  try {
    assembly = await bootAssembly({
      services: [
        { name: 'storage', value: h.storage },
        { name: 'clock', value: actualClock(h.assembly) },
        { name: 'memberships', value: memberships(h.assembly) },
      ],
      plugins: [
        {
          plugin: modelProfileDirectoryPlugin,
          config: {
            faceMode: 'developmentBaseFaces',
            officialManifest: { ordinal: 1, entries: [] },
            factoryCredentialRef: 'factory-ref',
          },
        },
      ],
    })
    expect(await reading(assembly).credentialPresent(alice, 'official')).toMatchObject({
      present: true,
      scope: { layer: 'factory' },
    })
    const lookup: unknown = assembly.ctx.get('credentialLookup')
    if (!isLookup(lookup)) throw new Error('lookup missing')
    const read = vi.spyOn(h.storage, 'read')
    const write = vi.spyOn(h.storage, 'write')
    const atomic = vi.spyOn(h.storage, 'atomic')
    const standing = vi.spyOn(memberships(h.assembly), 'standing')
    for (const spy of [read, write, atomic, standing])
      restore.push(() => {
        spy.mockRestore()
      })
    expect(await lookup.value(alice, 'official')).toEqual({ failure: 'unavailable' })
    expect(await lookup.value(alice, 'custom')).toEqual({ failure: 'unavailable' })
    expect(await lookup.value('invalid-tenant', 'official')).toEqual({
      failure: 'invalidInput',
      reason: 'malformed',
    })
    expect(await Reflect.apply(lookup.value, lookup, [alice, 'invalid-origin'])).toEqual({
      failure: 'invalidInput',
      reason: 'malformed',
    })
    for (const spy of [read, write, atomic, standing]) expect(spy).not.toHaveBeenCalled()
  } finally {
    for (const fn of restore) fn()
    await assembly?.dispose()
    await h.close()
  }
})
