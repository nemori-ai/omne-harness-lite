import { afterEach, expect, it, vi } from 'vitest'
import {
  createAdmittedEvaluationInputSource,
  createRunEvaluationInputReader,
  type AdmittedInputSourceDependencies,
} from '../src/admitted.ts'
import { boot, ROOT, asset, holding } from './support.ts'
import { publishLocalInputs } from '../src/publication.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})
it('limits the Run factory to reads and uses only the original owner unit for current publication', async () => {
  const fixture = await sourceFixture()
  const { f, identity, session, source } = fixture
  expect(
    await source.captureSessionRecipe({ session, tenant: identity.tenant, rootDefinition: ROOT }),
  ).toEqual({ captured: true })
  fixture.deny()
  const withOriginalRunUnit: AdmittedInputSourceDependencies['withAuthorizedUnit'] = vi.fn(read =>
    f.storage.atomic(async unit => ({ read: await read(unit) })),
  )
  const reader = createRunEvaluationInputReader({
    ...f.deps,
    scope: { tenant: identity.tenant, session },
    withOriginalRunUnit,
  })
  cleanups.push(() => reader.close())
  expect(Object.keys(reader).sort()).toEqual(['close', 'read'])
  expect(await source.reader.read(session, identity.tenant)).toEqual({ failure: 'unavailable' })
  expect(await reader.read(session, identity.tenant)).toHaveProperty('input.root.definition', ROOT)
  expect(withOriginalRunUnit).toHaveBeenCalledOnce()
  expect(await reader.read('other-session', identity.tenant)).toEqual({ failure: 'unavailable' })
  expect(withOriginalRunUnit).toHaveBeenCalledOnce()
  await reader.close()
  expect(await reader.read(session, identity.tenant)).toEqual({ failure: 'unavailable' })
  expect(withOriginalRunUnit).toHaveBeenCalledOnce()
  await f.storage.atomic(async unit => unit.assertStorage(f.storage))
})
async function sourceFixture() {
  const f = await boot()
  cleanups.push(() => f.close())
  const identity = await f.identity('admitted-reader')
  const session = 'admitted-session' as SessionScope['session']
  await f.mapSession(session, identity.tenant)
  const published = await publishLocalInputs(f.deps, {
    expectedRevision: null,
    definitions: [asset()],
    scopes: [
      { holder: { layer: 'factory' }, holdings: [holding({ layer: 'factory' })] },
      {
        holder: { layer: 'organization', organization: identity.tenant.organization },
        holdings: [],
      },
      { holder: { layer: 'tenant', tenant: identity.tenant }, holdings: [] },
    ],
  })
  if (!('revision' in published)) throw new Error('actual publication failed')
  const observed = await f.memberships.standing(identity.tenant)
  if (!('standing' in observed) || observed.standing !== 'effective')
    throw new Error('real standing missing')
  let permitted = true
  const authority = vi.fn()
  const withAuthorizedUnit: AdmittedInputSourceDependencies['withAuthorizedUnit'] = async read => {
    authority()
    if (!permitted) return { unavailable: true }
    return f.storage.atomic(async unit => {
      const current = await f.memberships.participate(unit).standing(identity.tenant)
      if (!('standing' in current) || current.standing !== 'effective') return { unavailable: true }
      return { read: await read(unit) }
    })
  }
  const creation = vi.fn(async () => observed)
  const source = createAdmittedEvaluationInputSource({
    ...f.deps,
    scope: { tenant: identity.tenant, session },
    withAuthorizedUnit,
    readCreationStanding: creation,
  })
  cleanups.push(source.close)
  return {
    f,
    source,
    identity,
    session,
    authority,
    creation,
    deny() {
      permitted = false
    },
    build(overrides: Partial<AdmittedInputSourceDependencies>) {
      const next = createAdmittedEvaluationInputSource({
        ...f.deps,
        scope: { tenant: identity.tenant, session },
        withAuthorizedUnit,
        readCreationStanding: creation,
        ...overrides,
      })
      cleanups.push(next.close)
      return next
    },
  }
}
it('captures the actual creation role and reads complete legal input from one authorized storage unit', async () => {
  const f = await sourceFixture()
  expect(
    await f.source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ captured: true })
  const reading = await f.source.reader.read(f.session, f.identity.tenant)
  expect('input' in reading).toBe(true)
  if (!('input' in reading)) throw new Error('input missing')
  expect(tenantIdEquals(reading.input.tenant, f.identity.tenant)).toBe(true)
  expect(reading.input.standing).toEqual({ standing: 'effective', role: 'superAdministrator' })
  expect(reading.input.root.definition).toEqual(ROOT)
  expect(f.creation).toHaveBeenCalledTimes(1)
  expect(f.authority).toHaveBeenCalledTimes(2)
})
it('refuses current authorization after capture instead of using captured effective as permission', async () => {
  const f = await sourceFixture()
  expect(
    await f.source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ captured: true })
  f.deny()
  expect(await f.source.reader.read(f.session, f.identity.tenant)).toEqual({
    failure: 'unavailable',
  })
  expect(f.creation).toHaveBeenCalledTimes(1)
})
it('rejects another Session before invoking the borrowed authority or original creation reader', async () => {
  const f = await sourceFixture()
  expect(await f.source.reader.read('foreign-session', f.identity.tenant)).toEqual({
    failure: 'unavailable',
  })
  expect(
    await f.source.captureSessionRecipe({
      session: 'foreign-session',
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(f.authority).not.toHaveBeenCalled()
  expect(f.creation).not.toHaveBeenCalled()
})
it('closes read and capture admission without closing borrowed storage or governance', async () => {
  const f = await sourceFixture()
  await f.source.close()
  expect(await f.source.reader.read(f.session, f.identity.tenant)).toEqual({
    failure: 'unavailable',
  })
  expect(
    await f.source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ failure: 'unavailable' })
  await expect(f.f.memberships.standing(f.identity.tenant)).resolves.toHaveProperty(
    'standing',
    'effective',
  )
  await expect(f.f.storage.read(async () => 'open')).resolves.toBe('open')
})

it('propagates an authority defect instead of converting it into ordinary unavailability', async () => {
  const f = await sourceFixture()
  const defect = new TypeError('original authority defect')
  const source = f.build({
    withAuthorizedUnit: async () => {
      throw defect
    },
  })
  await expect(
    source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).rejects.toBe(defect)
  await expect(source.reader.read(f.session, f.identity.tenant)).rejects.toBe(defect)
})
it('rejects an authority result that skipped the actual storage callback', async () => {
  const f = await sourceFixture()
  const source = f.build({ withAuthorizedUnit: async () => ({ read: undefined as never }) })
  await expect(source.reader.read(f.session, f.identity.tenant)).rejects.toThrow(
    'original unit result',
  )
})
it('rejects a storage unit borrowed from a different physical owner', async () => {
  const f = await sourceFixture()
  const other = await boot()
  cleanups.push(() => other.close())
  const source = f.build({
    withAuthorizedUnit: async read =>
      other.storage.atomic(async unit => ({ read: await read(unit) })),
  })
  await expect(
    source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).rejects.toThrow()
  expect(await f.source.reader.read(f.session, f.identity.tenant)).toEqual({
    failure: 'unavailable',
  })
})
it('waits for original authorized work while refusing subsequent read and capture calls', async () => {
  const f = await sourceFixture()
  expect(
    await f.source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ captured: true })
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => {
    enter = resolve
  })
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const source = f.build({
    withAuthorizedUnit: async read => {
      enter()
      await released
      return f.f.storage.atomic(async unit => ({ read: await read(unit) }))
    },
  })
  const reading = source.reader.read(f.session, f.identity.tenant)
  await entered
  let closed = false
  const closing = source.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  expect(await source.reader.read(f.session, f.identity.tenant)).toEqual({ failure: 'unavailable' })
  expect(
    await source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ failure: 'unavailable' })
  release()
  expect(await reading).toHaveProperty('input.root.definition', ROOT)
  await closing
  expect(closed).toBe(true)
})

it('retains the repeated-callback defect even if the borrowed port suppresses it and returns the first result', async () => {
  const f = await sourceFixture()
  expect(
    await f.source.captureSessionRecipe({
      session: f.session,
      tenant: f.identity.tenant,
      rootDefinition: ROOT,
    }),
  ).toEqual({ captured: true })
  const source = f.build({
    withAuthorizedUnit: async read =>
      f.f.storage.atomic(async unit => {
        const original = await read(unit)
        try {
          await read(unit)
        } catch {
          /* Deliberately defective test port suppresses the second call. */
        }
        return { read: original }
      }),
  })
  await expect(source.reader.read(f.session, f.identity.tenant)).rejects.toThrow('more than once')
})
