import { describe, expect, it, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  instantFromEpochMs,
  instantFromRfc3339,
  instantToRfc3339,
} from '@omne-harness-lite/offer-expiry'
import type { ModelProfileContent } from '@omne-harness-lite/model-profile'
import {
  actualClock,
  alice,
  bob,
  boot,
  catalog,
  content,
  expectRow,
  open,
  official,
  reading,
  scope,
  setup,
} from './support.ts'

function completeImage(name = 'image') {
  return {
    ...content(name),
    inputModalities: ['text', 'image'] as const,
    inputConstraints: { maxImageBytes: 2048, maxImages: 2 },
    upstreamInputLimits: {
      maxInputTokens: { status: 'limited', value: 1024 },
      maxRequestBytes: { status: 'unknown' },
      maxImageBytes: { status: 'limited', value: 2048 },
      maxImages: { status: 'limited', value: 2 },
    },
  } as const
}

async function stored(h: Awaited<ReturnType<typeof setup>>) {
  return await h.storage.read(async tx => ({
    rows: await tx.db.selectFrom('model_profile').selectAll().execute(),
    history: await tx.db.selectFrom('model_profile_configuration').selectAll().execute(),
    state: await tx.db.selectFrom('model_manifest_state').selectAll().execute(),
    credentials: await tx.db.selectFrom('model_credential_binding').selectAll().execute(),
  }))
}

describe('Directory5 current complete profile records on real SQLite', () => {
  it('V4-1/V4-2 accepts complete facts, finite equal caps and atomic whole-member modality replacement', async () => {
    const h = await setup('current-complete')
    try {
      const invalid = { failure: 'invalidInput', reason: 'malformed' }
      const source = content('current')
      const { upstreamInputLimits: _omitted, ...old } = source
      expect(await h.catalog.registerProfile(alice, scope, old)).toEqual(invalid)
      expect(
        await h.catalog.registerProfile(alice, scope, {
          ...source,
          maxInputTokens: 1025,
          upstreamInputLimits: {
            maxInputTokens: { status: 'limited', value: 1024 },
            maxRequestBytes: { status: 'unknown' },
          },
        }),
      ).toEqual(invalid)
      expect(
        await h.catalog.registerProfile(alice, scope, {
          ...completeImage('bad-image'),
          inputConstraints: {},
        }),
      ).toEqual(invalid)
      const first = expectRow(await h.catalog.registerProfile(alice, scope, source))
      const image = expectRow(await h.catalog.registerProfile(alice, scope, completeImage()))
      expect(await h.catalog.readProfile(alice, image.ref)).toEqual(image)
      expect(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: {
            inputModalities: ['text', 'image'],
          },
        }),
      ).toEqual(invalid)
      const before = await stored(h)
      expect(
        await h.catalog.updateProfile(bob, first.ref, {
          replace: {
            upstreamInputLimits: { maxInputTokens: { status: 'limited', value: 1 } },
          },
        }),
      ).toEqual({ failure: 'notAuthorized' })
      expect(await stored(h)).toEqual(before)
      const changed = expectRow(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: {
            inputModalities: ['text', 'image'],
            inputConstraints: { maxImageBytes: 2048, maxImages: 2 },
            upstreamInputLimits: completeImage().upstreamInputLimits,
          },
        }),
      )
      expect(changed.profile.inputConstraints).toEqual({ maxImageBytes: 2048, maxImages: 2 })
      expect(changed.profile.upstreamInputLimits).toEqual(completeImage().upstreamInputLimits)
      expect(await h.catalog.readProfile(alice, first.ref)).toEqual(changed)
      expect(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: {
            upstreamInputLimits: { maxInputTokens: { status: 'unknown' } },
          },
        }),
      ).toEqual(invalid)
      expect(await h.catalog.readProfile(alice, first.ref)).toEqual(changed)
    } finally {
      await h.close()
    }
  })

  it('V4-3/V4-5 recognizes exact numeric and object equality, all six timestamp drivers, and rollback on early clock', async () => {
    const h = await setup('current-time')
    try {
      const first = expectRow(await h.catalog.registerProfile(alice, scope, content('time')))
      const clock = actualClock(h.assembly)
      const parsed = instantFromRfc3339(first.profile.updatedAt)
      if (!('ok' in parsed)) throw new Error('Actual timestamp malformed')
      const now = vi.spyOn(clock, 'now').mockResolvedValue(parsed.ok)
      let row = expectRow(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: {
            adaptation: content('time', 'new-revision').adaptation,
          },
        }),
      )
      expect(row.profile.updatedAt).toBe(first.profile.updatedAt)
      for (const replace of [
        { providers: ['other'] },
        { allowFallback: true },
        { parameters: { temperature: 0.5 } },
      ]) {
        row = expectRow(await h.catalog.updateProfile(alice, first.ref, { replace }))
        expect(row.profile.updatedAt).toBe(first.profile.updatedAt)
      }
      const beforeEquivalent = await stored(h)
      const numeric = expectRow(
        await h.catalog.updateProfile(alice, first.ref, {
          replace: {
            maxInputTokens: new LosslessNumber('1024.0'),
            upstreamInputLimits: {
              maxRequestBytes: { status: 'unknown' },
              maxInputTokens: { status: 'unknown' },
            },
          },
        }),
      )
      expect(numeric.profile.updatedAt).toBe(first.profile.updatedAt)
      expect(await stored(h)).toEqual(beforeEquivalent)
      const drivers = [
        {
          inputModalities: ['text', 'image'],
          inputConstraints: { maxImageBytes: 2048 },
          upstreamInputLimits: {
            maxInputTokens: { status: 'unknown' },
            maxRequestBytes: { status: 'unknown' },
            maxImageBytes: { status: 'unknown' },
            maxImages: { status: 'unknown' },
          },
        },
        { outputModalities: ['text', 'image'] },
        { maxInputTokens: 900 },
        { maxOutputTokens: 500 },
        { inputConstraints: { maxImageBytes: 1024 } },
        {
          upstreamInputLimits: {
            maxInputTokens: { status: 'limited', value: 1024 },
            maxRequestBytes: { status: 'unknown' },
            maxImageBytes: { status: 'limited', value: 1024 },
            maxImages: { status: 'unknown' },
          },
        },
      ]
      for (const [index, replace] of drivers.entries()) {
        const later = instantFromEpochMs(Number(parsed.ok) + index + 1)
        if (!('ok' in later)) throw new Error('Later clock syntax')
        now.mockResolvedValue(later.ok)
        row = expectRow(await h.catalog.updateProfile(alice, first.ref, { replace }))
        expect(row.profile.updatedAt).toBe(instantToRfc3339(later.ok))
      }
      now.mockRestore()
      const earlier = instantFromEpochMs(0)
      if (!('ok' in earlier)) throw new Error('Earlier clock syntax')
      const earlyClock = vi.spyOn(clock, 'now').mockResolvedValue(earlier.ok)
      const before = await stored(h)
      expect(
        await h.catalog.updateProfile(alice, first.ref, { replace: { maxInputTokens: 800 } }),
      ).toEqual({ failure: 'unavailable' })
      expect(await stored(h)).toEqual(before)
      earlyClock.mockResolvedValue('unavailable')
      expect(
        await h.catalog.updateProfile(alice, first.ref, { replace: { maxInputTokens: 800 } }),
      ).toEqual({ failure: 'unavailable' })
      expect(await stored(h)).toEqual(before)
      expect(await h.catalog.withdrawProfile(alice, first.ref)).toEqual({
        ref: first.ref,
        registration: 'withdrawn',
      })
      expect(await h.catalog.relistProfile(alice, first.ref)).toEqual({
        ref: first.ref,
        registration: 'listed',
      })
      expect(expectRow(await h.catalog.readProfile(alice, first.ref)).profile.updatedAt).toBe(
        row.profile.updatedAt,
      )
    } finally {
      vi.restoreAllMocks()
      await h.close()
    }
  })

  it('V4-4/V4-8 rejects a stored old row without changing one byte, while absent and foreign rows remain distinct', async () => {
    const h = await setup('current-old-row')
    try {
      const row = expectRow(await h.catalog.registerProfile(alice, scope, content('old')))
      expectRow(await h.catalog.registerProfile(alice, scope, content('intact')))
      const { upstreamInputLimits: _omitted, ...old } = row.profile
      const oldBytes = writeJsonLossless(old)
      await h.storage.write(
        async tx =>
          await tx.db
            .updateTable('model_profile')
            .set({ profile_json: oldBytes })
            .where('route_name', '=', 'old')
            .execute(),
      )
      const before = await stored(h)
      expect(await h.catalog.readProfile(alice, row.ref)).toEqual({ failure: 'unavailable' })
      expect(await h.catalog.listProfiles(alice)).toEqual({ failure: 'unavailable' })
      expect(
        await h.catalog.updateProfile(alice, row.ref, { replace: { providers: ['changed'] } }),
      ).toEqual({ failure: 'unavailable' })
      expect(
        await h.catalog.readProfile(alice, { origin: 'custom', scope, routeName: 'absent' }),
      ).toEqual({ failure: 'profileNotFound' })
      expect(await h.catalog.listProfiles(bob)).toEqual([])
      expect(await stored(h)).toEqual(before)
      await h.assembly.dispose()
      await h.storage.close()
      const reopened = await open(h.path)
      try {
        const next = await boot(reopened)
        try {
          expect(await reading(next).readProfile(alice, row.ref)).toEqual({
            failure: 'unavailable',
          })
          expect(
            await reopened.read(async tx =>
              tx.db
                .selectFrom('model_profile')
                .select('profile_json')
                .where('route_name', '=', 'old')
                .executeTakeFirst(),
            ),
          ).toEqual({ profile_json: oldBytes })
        } finally {
          await next.dispose()
        }
      } finally {
        await reopened.close()
      }
    } finally {
      await h.close()
    }
  })

  it('V4-7 whole manifest cap conflict and early clock leave rows, history and ordinal unchanged', async () => {
    const h = await setup('current-manifest', {
      ordinal: 1,
      entries: [official('first'), official('second')],
    })
    try {
      const before = await stored(h)
      await h.assembly.dispose()
      const bad: ModelProfileContent = {
        ...official('second'),
        maxInputTokens: 1025,
        upstreamInputLimits: {
          maxInputTokens: { status: 'limited', value: 1024 },
          maxRequestBytes: { status: 'unknown' },
        },
      }
      await expect(
        boot(h.storage, { ordinal: 2, entries: [official('first', 'changed'), bad] }),
      ).rejects.toThrow()
      expect(await stored(h)).toEqual(before)
      const earlier = instantFromEpochMs(0)
      if (!('ok' in earlier)) throw new Error('Earlier clock syntax')
      await expect(
        boot(
          h.storage,
          {
            ordinal: 2,
            entries: [
              {
                ...official('first'),
                upstreamInputLimits: {
                  maxInputTokens: { status: 'limited', value: 1024 },
                  maxRequestBytes: { status: 'unknown' },
                },
              },
              official('second'),
            ],
          },
          undefined,
          { now: async () => earlier.ok },
        ),
      ).rejects.toThrow()
      expect(await stored(h)).toEqual(before)
      const replay = await boot(h.storage, {
        ordinal: 1,
        entries: [official('first'), official('second')],
      })
      try {
        expect(await reading(replay).listProfiles(alice)).toMatchObject([
          { profile: { routeName: 'first' } },
          { profile: { routeName: 'second' } },
        ])
      } finally {
        await replay.dispose()
      }
      const changedFirst: ModelProfileContent = {
        ...official('first'),
        upstreamInputLimits: {
          maxInputTokens: { status: 'limited', value: 1024 },
          maxRequestBytes: { status: 'unknown' },
        },
      }
      const events: unknown[] = []
      const rejected = await boot(
        h.storage,
        { ordinal: 1, entries: [changedFirst, official('second')] },
        { record: event => events.push(event) },
      )
      try {
        expect(events).toContainEqual({
          operation: 'loadManifest',
          phase: 'error',
          outcome: 'manifestNotNewer',
        })
        expect(await stored(h)).toEqual(before)
      } finally {
        await rejected.dispose()
      }
      const accepted = await boot(h.storage, {
        ordinal: 2,
        entries: [changedFirst, official('second')],
      })
      try {
        const row = expectRow(
          await reading(accepted).readProfile(alice, { origin: 'official', routeName: 'first' }),
        )
        expect(row.profile.upstreamInputLimits).toEqual(changedFirst.upstreamInputLimits)
        expect(await stored(h)).not.toEqual(before)
      } finally {
        await accepted.dispose()
      }
    } finally {
      await h.storage.close()
    }
  })

  it('V4-6 two actual connections serialize complete row updates and survive reopen', async () => {
    const h = await setup('current-concurrent')
    const other = await open(h.path)
    const next = await boot(other)
    try {
      const row = expectRow(await h.catalog.registerProfile(alice, scope, content('shared')))
      let entered: (() => void) | undefined
      let release: (() => void) | undefined
      const enteredPromise = new Promise<void>(resolve => {
        entered = resolve
      })
      const releasePromise = new Promise<void>(resolve => {
        release = resolve
      })
      const original = h.storage.write.bind(h.storage)
      const spy = vi.spyOn(h.storage, 'write').mockImplementation(async fn =>
        original(async tx => {
          const result = await fn(tx)
          // Standing also uses an atomic write scope. Hold the profile update,
          // not its earlier authorization read, so the commit order is explicit.
          if (typeof result === 'object' && result !== null && 'profile' in result) {
            entered?.()
            await releasePromise
          }
          return result
        }),
      )
      const first = h.catalog.updateProfile(alice, row.ref, { replace: { maxInputTokens: 900 } })
      await enteredPromise
      const second = catalog(next).updateProfile(alice, row.ref, {
        replace: {
          upstreamInputLimits: {
            maxInputTokens: { status: 'limited', value: 1024 },
            maxRequestBytes: { status: 'unknown' },
          },
        },
      })
      release?.()
      const firstResult = await first
      if ('failure' in firstResult) throw new Error(JSON.stringify(firstResult))
      expect(firstResult.profile.maxInputTokens).toBe(900)
      const secondResult = await second
      expect(secondResult).not.toHaveProperty('failure', 'invalidInput')
      const final = expectRow(await reading(next).readProfile(alice, row.ref))
      expect(final.profile.maxInputTokens).toBe(900)
      if ('failure' in secondResult) {
        expect(secondResult).toEqual({ failure: 'unavailable' })
        expect(final.profile.upstreamInputLimits.maxInputTokens).toEqual({ status: 'unknown' })
      } else {
        expect(secondResult).toEqual(final)
        expect(final.profile.upstreamInputLimits.maxInputTokens).toEqual({
          status: 'limited',
          value: 1024,
        })
      }
      spy.mockRestore()
      await next.dispose()
      await other.close()
      await h.assembly.dispose()
      await h.storage.close()
      const reopened = await open(h.path)
      try {
        const assembly = await boot(reopened)
        try {
          expect(expectRow(await reading(assembly).readProfile(alice, row.ref))).toEqual(final)
        } finally {
          await assembly.dispose()
        }
      } finally {
        await reopened.close()
      }
    } finally {
      vi.restoreAllMocks()
      await next.dispose()
      await other.close()
      await h.close()
    }
  })
})
