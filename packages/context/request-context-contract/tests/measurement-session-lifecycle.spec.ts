import { describe, expect, it } from 'vitest'
import type * as M from '@omne-harness/model-contract'
import {
  createAssemblyFixture,
  createScriptedInputMeter,
  createScriptedPreparationResources,
  fixtureBudget,
  countingBasis,
} from '@omne-harness/request-context-contract/testing'
import { withMeasurementSession } from '../src/measurement-session.js'
import { buildModelInput } from '../src/model-input.js'
import { callId, adoption } from './fixtures.js'

function fixture(
  script: Parameters<typeof createScriptedInputMeter>[1] = () => ({ ok: fixtureBudget() }),
) {
  const f = createAssemblyFixture()
  const selection = f.sources.values().model
  const assembled = buildModelInput(selection, {
    system: [],
    messages: [],
    tools: [],
    toolChoice: 'auto',
    source: adoption,
  })
  const preparation = createScriptedPreparationResources<string>({
    meter: createScriptedInputMeter(countingBasis, script),
  })
  return { selection, assembled, preparation, context: { access: f.call.access, preparation } }
}
const success = { kind: 'planned' as const }

describe('bounded measurement lease lifetime', () => {
  it('binds an opaque principal by reference without serializing it', async () => {
    const f = fixture()
    const principal = {
      toJSON() {
        throw new Error('principal must stay opaque')
      },
    }
    const preparation = createScriptedPreparationResources<typeof principal>({
      meter: createScriptedInputMeter(countingBasis, () => ({ ok: fixtureBudget() })),
    })
    await withMeasurementSession(
      { access: { ...f.context.access, principal }, preparation },
      async measure => {
        await measure(f.selection, {}, f.assembled)
        await measure(f.selection, {}, f.assembled)
        return success
      },
    )
    expect(preparation.calls()).toHaveLength(1)
    expect(preparation.calls()[0]?.principal).toBe(principal)
    expect(preparation.outstanding()).toBe(0)
  })

  it('keeps the cache key and acquired profile consistent while eviction awaits release', async () => {
    const f = fixture()
    const selectionFor = (name: string) => ({
      ...f.selection,
      profile: { ...f.selection.profile, adoption: { ...f.selection.profile.adoption, name } },
    })
    const gate = Promise.withResolvers<void>()
    const acquisitions: string[] = []
    const pairs: string[][] = []
    const preparation: M.ModelPreparationResources<string> = {
      async acquire(input) {
        const name = input.profile.adoption.name
        acquisitions.push(name)
        const resource = createScriptedPreparationResources<string>({
          meter: createScriptedInputMeter(countingBasis, measured => {
            pairs.push([name, measured.profile.name])
            return { ok: fixtureBudget() }
          }),
        })
        const acquired = await resource.acquire(input)
        if ('failure' in acquired) return acquired
        return {
          ok: {
            ...acquired.ok,
            release: async () => {
              if (name === 'A') await gate.promise
              return acquired.ok.release()
            },
          },
        }
      },
    }
    await withMeasurementSession({ ...f.context, preparation }, async measure => {
      for (const name of ['A', 'B', 'C', 'D']) await measure(selectionFor(name), {}, f.assembled)
      const mutable = selectionFor('E')
      const pending = measure(mutable, {}, f.assembled)
      mutable.profile.adoption.name = 'F'
      gate.resolve()
      expect((await pending).kind).toBe('complete')
      expect((await measure(selectionFor('E'), {}, f.assembled)).kind).toBe('complete')
      return success
    })
    expect(acquisitions).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(pairs.slice(-2)).toEqual([
      ['E', 'E'],
      ['E', 'E'],
    ])
  })

  it('holds the first acquired facts snapshot only until this operation ends', async () => {
    const f = fixture()
    let facts = '1'
    const leases: ReturnType<typeof createScriptedPreparationResources<string>>[] = []
    const preparation: M.ModelPreparationResources<string> = {
      async acquire(input) {
        const snapshot = facts
        const resource = createScriptedPreparationResources<string>({
          meter: createScriptedInputMeter(countingBasis, () => ({ ok: fixtureBudget(snapshot) })),
        })
        leases.push(resource)
        return resource.acquire(input)
      },
    }
    const amount = (
      result: Awaited<ReturnType<import('../src/measurement-session.js').CandidateMeasure>>,
    ) => {
      if (result.kind !== 'complete') throw new Error('measurement failed')
      return result.checks[0]?.measurement.amount
    }
    await withMeasurementSession({ ...f.context, preparation }, async measure => {
      expect(amount(await measure(f.selection, {}, f.assembled))).toBe('1')
      facts = '2'
      expect(amount(await measure(f.selection, {}, f.assembled))).toBe('1')
      return success
    })
    await withMeasurementSession({ ...f.context, preparation }, async measure => {
      expect(amount(await measure(f.selection, {}, f.assembled))).toBe('2')
      return success
    })
    expect(leases).toHaveLength(2)
    expect(leases.every(lease => lease.outstanding() === 0)).toBe(true)
  })

  it('awaits and merges the complete asynchronous reports from every supplier', async () => {
    const f = fixture()
    const second = {
      ...f.selection.profile.definition.suppliers[0],
      adoption: { ...adoption, name: 'second' },
      recipient: 'second',
    }
    const selection = {
      ...f.selection,
      profile: {
        ...f.selection.profile,
        definition: {
          ...f.selection.profile.definition,
          suppliers: [f.selection.profile.definition.suppliers[0], second] as const,
        },
      },
    }
    const seen: string[] = []
    const preparation = createScriptedPreparationResources<string>({
      plan: ({ assembled, supplier }) => ({
        ok: {
          parameters: [],
          representation: {
            kind: 'materialized',
            adoption: assembled.representation,
            tokenInput: { kind: 'null' },
            media: [],
            requestBytes: supplier.recipient === 'second' ? '2' : '1',
          },
        },
      }),
      meter: createScriptedInputMeter(countingBasis, async input => {
        await Promise.resolve()
        const amount = input.supplier.recipient === 'second' ? '2' : '1'
        expect(input.representation).toMatchObject({ requestBytes: amount })
        seen.push(input.supplier.recipient)
        const budget = fixtureBudget(amount)
        return {
          ok: {
            ...budget,
            counting: [{ ...countingBasis, supplier: input.supplier }],
            checks: budget.checks.map(check => ({ ...check, supplier: input.supplier.adoption })),
          },
        }
      }),
    })
    await withMeasurementSession({ ...f.context, preparation }, async measure => {
      const result = await measure(selection, {}, f.assembled)
      if (result.kind !== 'complete') throw new Error('measurement failed')
      expect(result.checks.map(check => check.measurement.amount)).toEqual(['1', '2'])
      expect(result.counting.map(basis => basis.supplier.recipient)).toEqual(['route', 'second'])
      expect(seen).toEqual(['route', 'second'])
      return success
    })
    expect(preparation.outstanding()).toBe(0)
  })

  it('shares a pending acquisition and preserves the complete profile key', async () => {
    const f = fixture()
    const acquired =
      Promise.withResolvers<Awaited<ReturnType<M.ModelPreparationResources<string>['acquire']>>>()
    let acquisitions = 0
    const preparation: M.ModelPreparationResources<string> = {
      async acquire(input) {
        if (++acquisitions === 1) return acquired.promise
        return f.preparation.acquire(input)
      },
    }
    await withMeasurementSession({ ...f.context, preparation }, async measure => {
      const a = measure(f.selection, {}, f.assembled)
      const b = measure(f.selection, {}, f.assembled)
      expect(acquisitions).toBe(1)
      acquired.resolve(
        await f.preparation.acquire({
          ...f.context.access,
          profile: f.selection.profile,
          lineage: {},
        }),
      )
      expect((await a).kind).toBe('complete')
      expect((await b).kind).toBe('complete')
      const changed = {
        ...f.selection,
        profile: {
          ...f.selection.profile,
          definition: { ...f.selection.profile.definition, fallback: true },
        },
      }
      await measure(changed, {}, f.assembled)
      expect(acquisitions).toBe(2)
      return success
    })
    expect(f.preparation.outstanding()).toBe(0)
  })

  it('rejects a ninth concurrent probe without acquiring or queuing it', async () => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    let calls = 0
    const f = fixture(async () => {
      const call = ++calls
      if (call === 8) started.resolve()
      if (call <= 8) await gate.promise
      return { ok: fixtureBudget() }
    })
    const result = await withMeasurementSession(f.context, async measure => {
      const probes = Array.from({ length: 8 }, () => measure(f.selection, {}, f.assembled))
      await started.promise
      const refused = await measure(f.selection, { continues: callId('overflow') }, f.assembled)
      gate.resolve()
      await Promise.all(probes)
      expect(refused).toMatchObject({
        kind: 'unavailable',
        owner: 'preparation',
        diagnostic: 'Compaction measurement concurrency limit exceeded',
      })
      expect(f.preparation.calls()).toHaveLength(1)
      expect(calls).toBe(8)
      return success
    })
    expect(result).toMatchObject({ kind: 'unavailable', owner: 'preparation' })
    expect(f.preparation.outstanding()).toBe(0)
  })

  it('keeps busy leases pinned and releases overflow after all same-key users finish', async () => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    let calls = 0
    const f = fixture(async () => {
      if (++calls === 6) started.resolve()
      await gate.promise
      return { ok: fixtureBudget() }
    })
    const result = withMeasurementSession(f.context, async measure => {
      const probes = Array.from({ length: 5 }, (_, index) =>
        measure(f.selection, { continues: callId(String(index)) }, f.assembled),
      )
      probes.push(measure(f.selection, { continues: callId('4') }, f.assembled))
      await started.promise
      const acquisitions = f.preparation.calls().length
      const outstanding = f.preparation.outstanding()
      gate.resolve()
      expect(acquisitions).toBe(5)
      expect(outstanding).toBe(5)
      expect((await Promise.all(probes)).every(value => value.kind === 'complete')).toBe(true)
      expect(f.preparation.outstanding()).toBe(4)
      await measure(f.selection, { continues: callId('4') }, f.assembled)
      expect(f.preparation.calls()).toHaveLength(6)
      expect(f.preparation.outstanding()).toBe(4)
      return success
    })
    expect(await result).toEqual(success)
    expect(f.preparation.outstanding()).toBe(0)
  })

  it('evicts idle entries after four distinct keys and never reuses a measured budget', async () => {
    let amount = 0
    const f = fixture(() => ({ ok: fixtureBudget(String(++amount)) }))
    await withMeasurementSession(f.context, async measure => {
      for (let i = 0; i < 5; i++) {
        expect(
          (await measure(f.selection, { continues: callId(String(i)) }, f.assembled)).kind,
        ).toBe('complete')
        expect(f.preparation.outstanding()).toBe(Math.min(i + 1, 4))
      }
      const first = await measure(f.selection, { continues: callId('0') }, f.assembled)
      const repeated = await measure(f.selection, { continues: callId('0') }, f.assembled)
      if (first.kind !== 'complete' || repeated.kind !== 'complete')
        throw new Error('measurement failed')
      expect(first.checks[0]?.measurement.amount).toBe('6')
      expect(repeated.checks[0]?.measurement.amount).toBe('7')
      expect(f.preparation.calls()).toHaveLength(6)
      return success
    })
    expect(f.preparation.outstanding()).toBe(0)
  })

  it('waits for started probes at close and rejects an escaped callback', async () => {
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const f = fixture(async () => {
      started.resolve()
      await gate.promise
      return { ok: fixtureBudget() }
    })
    let measureAfterClose:
      | (() => ReturnType<import('../src/measurement-session.js').CandidateMeasure>)
      | undefined
    let published = false
    const pending = withMeasurementSession(f.context, async measure => {
      void measure(f.selection, {}, f.assembled)
      measureAfterClose = () => measure(f.selection, {}, f.assembled)
      await started.promise
      return success
    }).then(value => {
      published = true
      return value
    })
    await started.promise
    await Promise.resolve()
    await Promise.resolve()
    expect(published).toBe(false)
    expect(f.preparation.outstanding()).toBe(1)
    gate.resolve()
    expect(await pending).toEqual(success)
    expect(f.preparation.outstanding()).toBe(0)
    expect(await measureAfterClose?.()).toMatchObject({ kind: 'unavailable', owner: 'preparation' })
    expect(f.preparation.calls()).toHaveLength(1)
  })

  it.each(['plan', 'meter', 'policy'] as const)(
    'releases every acquired lease when %s throws',
    async kind => {
      const f = fixture()
      const preparation = createScriptedPreparationResources<string>({
        meter: createScriptedInputMeter(countingBasis, () => {
          if (kind === 'meter') throw new Error('meter')
          return { ok: fixtureBudget() }
        }),
        ...(kind === 'plan'
          ? {
              plan: () => {
                throw new Error('plan')
              },
            }
          : {}),
      })
      await expect(
        withMeasurementSession({ ...f.context, preparation }, async measure => {
          await measure(f.selection, {}, f.assembled)
          throw new Error('policy')
        }),
      ).rejects.toThrow(kind)
      expect(preparation.outstanding()).toBe(0)
    },
  )

  it.each(['return', 'throw'] as const)(
    'cleans all leases after release %s failure and refuses success',
    async mode => {
      const f = fixture()
      let released = 0
      const preparation = createScriptedPreparationResources<string>({
        meter: createScriptedInputMeter(countingBasis, () => ({ ok: fixtureBudget() })),
        release() {
          released++
          if (mode === 'throw') throw new Error('cleanup')
          return { failure: { kind: 'unavailable', dependency: 'lease', diagnostic: 'cleanup' } }
        },
      })
      const run = () =>
        withMeasurementSession({ ...f.context, preparation }, async measure => {
          for (let i = 0; i < 5; i++)
            await measure(f.selection, { continues: callId(String(i)) }, f.assembled)
          return success
        })
      expect(await run()).toMatchObject({ kind: 'unavailable', owner: 'preparation' })
      expect(released).toBe(5)
      expect(preparation.outstanding()).toBe(0)
    },
  )

  it('preserves the original failure and does not retain a failed measurement', async () => {
    const f = fixture()
    let calls = 0
    const preparation = createScriptedPreparationResources<string>({
      meter: createScriptedInputMeter(countingBasis, () =>
        ++calls === 1
          ? { failure: { kind: 'unavailable', dependency: 'meter', diagnostic: 'meter failed' } }
          : { ok: fixtureBudget() },
      ),
      release: () => ({
        failure: { kind: 'unavailable', dependency: 'lease', diagnostic: 'cleanup' },
      }),
    })
    expect(
      await withMeasurementSession({ ...f.context, preparation }, async measure => {
        const result = await measure(f.selection, {}, f.assembled)
        expect(preparation.outstanding()).toBe(0)
        await measure(f.selection, {}, f.assembled)
        return result
      }),
    ).toMatchObject({ kind: 'unavailable', owner: 'meter' })
    expect(preparation.calls()).toHaveLength(2)
    expect(preparation.outstanding()).toBe(0)
  })
})
