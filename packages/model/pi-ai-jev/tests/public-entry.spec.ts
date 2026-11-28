import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import { expect, it } from 'vitest'
import * as root from '@omne-harness/pi-ai-jev'

const RETRY = { owner: 'model', name: 'once', revision: '1', digest: 'd'.repeat(64) }

it('exports the family, its records and its official profiles', () => {
  expect(Object.keys(root).toSorted()).toEqual([
    'JEV_OWNER',
    'JEV_RECORDS',
    'createJevFamily',
    'officialJevProfiles',
  ])
})

it('gives each current record one decisions profile whose supplier is the adoption of that record', () => {
  const profiles = root.officialJevProfiles({ retryPolicy: RETRY })
  expect(profiles.map(profile => profile.kind)).toEqual(['decisions', 'decisions'])
  expect(profiles.map(profile => profile.suppliers[0].adoption)).toEqual(
    root.JEV_RECORDS.map(record => recordAdoption(root.JEV_OWNER, record)),
  )
  expect(profiles.map(profile => profile.suppliers[0].model)).toEqual([
    'typesafe/jev-1.13',
    'typesafe/jev-1.14',
  ])
  expect(profiles.every(profile => profile.maxQuestions === null && !profile.fallback)).toBe(true)
})

it('binds a record to its supplier as a decisions binding that holds nothing', async () => {
  const [profile] = root.officialJevProfiles({ retryPolicy: RETRY })
  if (profile === undefined) throw new Error('no profile')
  const supplier = { ...profile.suppliers[0], credential: { layer: 'official' as const } }
  const acquired = await composeFamilies([root.createJevFamily()]).acquire(
    supplier,
    new AbortController().signal,
  )
  expect(acquired).toMatchObject({
    ok: { supplier, adoption: supplier.adoption, endpoint: 'decisions', maxQuestions: null },
  })
})
