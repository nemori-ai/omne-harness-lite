import { expect, it } from 'vitest'
import { createMemoryToolEnvironment } from '@omne-harness/tool-contract/testing'
import {
  adoption,
  callId,
  evidence,
  fixedRequest,
  memoryAccess,
  memoryOtherAccess,
  preparationRecord,
  releaseRecord,
} from '../src/testing-values.ts'

it('all four environment operations refuse a different adapter without allocating or releasing', async () => {
  const environment = createMemoryToolEnvironment<string>()
  const access = memoryAccess('caller')
  const call = callId('original')
  const original = preparationRecord(access, call, 'prepare', fixedRequest())
  const wrong = { ...original, adoption: adoption('replacement') }
  const release = releaseRecord(wrong, 'release', evidence('resource'))
  for (const reply of [
    await environment.prepare({ ...access, call, preparation: wrong }),
    await environment.inspectPreparation({ ...access, call, preparation: wrong }),
    await environment.release({ ...access, call, release }),
    await environment.inspectRelease({ ...access, call, release }),
  ])
    expect(reply).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(environment.controls.allocations()).toBe(0)
  expect(
    await environment.inspectRelease({
      ...access,
      call,
      release: { ...release, adoption: original.adoption },
    }),
  ).toMatchObject({ ok: { kind: 'unknown' } })
})

it('does not allocate for absent scope, mismatched declaration, missing tenant or a foreign original record', async () => {
  const environment = createMemoryToolEnvironment<string>()
  const access = memoryAccess('caller')
  const call = callId('original')
  const original = preparationRecord(access, call, 'prepare', fixedRequest())
  const missingScope = { ...original.request }
  Reflect.deleteProperty(missingScope, 'requesterScope')
  expect(
    await environment.prepare({
      ...access,
      call,
      preparation: { ...original, request: missingScope },
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'requesterScope' } })
  const mismatched = {
    ...original.request,
    environment: { adoption: adoption('other'), value: { kind: 'null' as const } },
  }
  expect(
    await environment.prepare({
      ...access,
      call,
      preparation: { ...original, request: mismatched },
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'environment' } })
  const missingTenant = { ...access, call, preparation: original }
  Reflect.deleteProperty(missingTenant, 'tenant')
  expect(await environment.prepare(missingTenant)).toMatchObject({ failure: { kind: 'denied' } })
  expect(
    await environment.prepare({ ...memoryOtherAccess('other'), call, preparation: original }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(environment.controls.allocations()).toBe(0)
})

it('reconnects serialized records under the original tenant and refuses a foreign tenant', async () => {
  const environment = createMemoryToolEnvironment<string>()
  const access = memoryAccess('caller')
  const call = callId('restored')
  const preparation = structuredClone(preparationRecord(access, call, 'prepare', fixedRequest()))
  const prepared = await environment.prepare({ ...access, call, preparation })
  expect(prepared).toMatchObject({ ok: { kind: 'prepared' } })
  expect(await environment.inspectPreparation({ ...access, call, preparation })).toEqual(prepared)
  const release = structuredClone(releaseRecord(preparation, 'release', evidence('resource')))
  const released = await environment.release({ ...access, call, release })
  expect(released).toMatchObject({ ok: { kind: 'released' } })
  expect(await environment.inspectRelease({ ...access, call, release })).toEqual(released)
  for (const reply of [
    await environment.prepare({ ...memoryOtherAccess('other'), call, preparation }),
    await environment.inspectPreparation({ ...memoryOtherAccess('other'), call, preparation }),
    await environment.release({ ...memoryOtherAccess('other'), call, release }),
    await environment.inspectRelease({ ...memoryOtherAccess('other'), call, release }),
  ])
    expect(reply).toMatchObject({ failure: { kind: 'denied' } })
  expect(environment.controls.allocations()).toBe(1)
})
