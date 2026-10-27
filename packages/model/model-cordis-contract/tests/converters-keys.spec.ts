import { describe, expect, it } from 'vitest'
import type { ConverterKey } from '@omne-harness/model-contract/provider'
import {
  converter,
  input,
  mediaType,
  modality,
  registrationOf,
  selection,
  startCatalog,
  surrogateAuthority,
} from './converters-harness.ts'

const notCanonical = {
  failure: { kind: 'invalid', reason: expect.stringContaining('canonical') },
}

// Forms that name a real media type but are not the canonical form of it.
const nonCanonicalMediaTypes = [
  'IMAGE/PNG',
  'image/PNG',
  'image/png; charset=binary',
  'image/png;',
  ' image/png',
  'image/png ',
  'image',
  '',
]

describe('registration key form', () => {
  it.each(nonCanonicalMediaTypes)(
    'refuses the media type key %j and leaves the directory as it was',
    async form => {
      const world = await startCatalog()
      const held = converter('png')
      registrationOf((await world.contribute(input(mediaType('image/png'), held))).outcome)

      const refused = await world.contribute(input(mediaType(form), converter('other')))

      // Red when the catalog takes the key as written: the refused converter would be stored under the odd form
      // and the lookup below would not find the held converter any more, or the outcome would be ok.
      expect(refused.outcome).toEqual(notCanonical)
      const lent = selection(await world.acquire({ mediaType: 'image/png', modality: 'image' }))
      expect(lent.converter.adoption).toEqual(held.adoption)
    },
  )

  it('does not store a refused media type key, so a later canonical registration is not a conflict', async () => {
    const world = await startCatalog()
    await world.contribute(input(mediaType('IMAGE/PNG'), converter('upper')))
    const canonical = converter('png')

    // Red when the refused key had been stored as the canonical one: this registration would conflict.
    registrationOf((await world.contribute(input(mediaType('image/png'), canonical))).outcome)

    const lent = selection(await world.acquire({ mediaType: 'image/png', modality: null }))
    expect(lent.converter.adoption).toEqual(canonical.adoption)
  })

  it.each(['Image', 'audio', 'file', '', 'text/plain'])(
    'refuses the modality key %j, which is not a modality of the shared vocabulary',
    async form => {
      const world = await startCatalog()
      const held = converter('image')
      registrationOf((await world.contribute(input(modality('image'), held))).outcome)

      const refused = await world.contribute(
        input({ kind: 'modality', modality: form } as unknown as ConverterKey, converter('other')),
      )

      // Red when the modality key is not judged: the odd key would be registered.
      expect(refused.outcome).toEqual({
        failure: { kind: 'invalid', reason: expect.stringContaining('modality') },
      })
      const lent = selection(await world.acquire({ mediaType: 'image/jpeg', modality: 'image' }))
      expect(lent.converter.adoption).toEqual(held.adoption)
    },
  )

  it('leaves the fiber of a refused key with no effect, so the refusal collects nothing', async () => {
    const world = await startCatalog()
    const idle = world.root.plugin({ inject: ['modelConverters'], apply() {} })
    await idle

    const { fiber, outcome } = await world.contribute(
      input(mediaType('IMAGE/PNG'), converter('upper')),
    )

    // Red when a refused key still leaves its effect on the fiber of the caller.
    expect(outcome).toEqual(notCanonical)
    expect(fiber.getEffects().length).toBe(idle.getEffects().length)
  })

  it.each([
    mediaType('image/png'),
    mediaType('application/vnd.api+json'),
    modality('text'),
    modality('image'),
    modality('voice'),
    modality('video'),
  ])('registers and serves the canonical key %j', async key => {
    const world = await startCatalog()
    const lent = converter('canonical')

    registrationOf((await world.contribute(input(key, lent))).outcome)

    const request =
      key.kind === 'media-type'
        ? { mediaType: key.mediaType, modality: null }
        : {
            mediaType: `${key.modality === 'voice' ? 'audio' : key.modality}/x`,
            modality: key.modality,
          }
    expect(selection(await world.acquire(request)).converter.adoption).toEqual(lent.adoption)
  })

  it('asks the authority first, so a denied registration with an odd key reports the denial', async () => {
    const authority = surrogateAuthority()
    authority.deny({ kind: 'denied' })
    const world = await startCatalog(authority)

    const refused = await world.contribute(input(mediaType('IMAGE/PNG'), converter('upper')))

    // Red when the form of the key is judged before the authority is asked.
    expect(refused.outcome).toEqual({ failure: { kind: 'denied' } })
  })
})

describe('lookup input form', () => {
  it.each(['IMAGE/PNG', 'image/png; charset=binary', ' image/png', 'image', ''])(
    'answers invalid for the media type %j and lends nothing',
    async form => {
      const world = await startCatalog()
      registrationOf(
        (await world.contribute(input(mediaType('image/png'), converter('png')))).outcome,
      )

      const answer = await world.acquire({ mediaType: form, modality: 'image' })

      // Red when the catalog normalises or matches loosely: the png converter would be lent.
      expect(answer).toEqual({
        failure: {
          kind: 'invalid',
          field: 'mediaType',
          reason: expect.stringContaining('canonical'),
        },
      })
    },
  )

  it.each(['Image', 'audio', '', undefined])(
    'answers invalid for the modality %j and lends nothing',
    async form => {
      const world = await startCatalog()
      registrationOf((await world.contribute(input(modality('image'), converter('image')))).outcome)

      const answer = await world.acquire({
        mediaType: 'image/png',
        modality: form as unknown as 'image',
      })

      // Red when the modality of the lookup is not judged: the image converter would be lent for
      // an unknown modality, or the key `modality:undefined` would be looked up.
      expect(answer).toEqual({
        failure: { kind: 'invalid', field: 'modality', reason: expect.stringContaining('known') },
      })
    },
  )

  it('does not count a lease for a refused lookup, so the converter retires without waiting', async () => {
    const world = await startCatalog()
    const registration = registrationOf(
      (await world.contribute(input(mediaType('image/png'), converter('png')))).outcome,
    )
    await world.acquire({ mediaType: 'IMAGE/PNG', modality: null })

    // Red when a refused lookup still borrowed the converter: release would wait for a lease that
    // nobody holds.
    expect(await registration.release()).toEqual({ removed: true })
  })

  it('still answers a canonical lookup with a null modality', async () => {
    const world = await startCatalog()
    const lent = converter('png')
    registrationOf((await world.contribute(input(mediaType('image/png'), lent))).outcome)

    expect(
      selection(await world.acquire({ mediaType: 'image/png', modality: null })).converter.adoption,
    ).toEqual(lent.adoption)
  })
})
