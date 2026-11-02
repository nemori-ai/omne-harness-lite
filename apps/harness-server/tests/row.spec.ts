// `defineRow` 与读回（DP1-C8、DP1-C15、IC-8、IC-14）。包装插件经真实 Cordis 4.0.4 装载。
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { stubPlugin } from '../src/cordis.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../src/lifecycle.ts'
import { defineRow, rowDeclarationOf, type RowDefinition } from '../src/row.ts'
import { monotonicClock } from '../src/shutdown.ts'
import type { LifecyclePhase, RowId } from '../src/types.ts'

const manifest = { provides: ['fxA'], injects: [], sameProviderGroup: null } as const

function registryFor(entries: Record<string, LifecyclePhase>) {
  const expected = new Map(
    Object.entries(entries).map(([row, phase]) => [row as RowId, phase] as const),
  )
  return new LifecycleRegistry({ expected, clock: monotonicClock, requestStop: () => {} })
}

describe('defineRow: shape of the wrapper', () => {
  test('a row without phase: inject is the declared injects, the declaration reads back', () => {
    const plugin = defineRow({
      row: 'fx-plain',
      implementation: 'real',
      manifest: { ...manifest, injects: ['fxDep'] },
      lifecycle: { kind: 'none' },
      plugin: { inject: ['fxDep'], apply() {} },
    })
    expect(plugin.name).toBe('fx-plain')
    expect(plugin.inject).toEqual(['fxDep'])
    expect(rowDeclarationOf(plugin)).toEqual({
      row: 'fx-plain',
      implementation: 'real',
      manifest: { provides: ['fxA'], injects: ['fxDep'], phase: null, sameProviderGroup: null },
      lifecycle: { kind: 'none' },
    })
  })

  test('a row with a phase also injects s0.assemblyLifecycle, and the manifest carries the phase', () => {
    const plugin = defineRow({
      row: 'fx-body',
      implementation: 'contract-double',
      manifest,
      lifecycle: { kind: 'body', phase: 'business' },
      body: async () => ({ stop: async () => ({ kind: 'settled' }) }),
    })
    expect(plugin.inject).toEqual(['s0.assemblyLifecycle'])
    expect(rowDeclarationOf(plugin)?.manifest.phase).toBe('business')
    expect(rowDeclarationOf(plugin)?.lifecycle).toEqual({ kind: 'body', phase: 'business' })
  })

  test('objects that defineRow did not make have no declaration', () => {
    expect(rowDeclarationOf(stubPlugin)).toBeUndefined()
    expect(rowDeclarationOf({ apply() {} })).toBeUndefined()
    expect(rowDeclarationOf(undefined)).toBeUndefined()
  })

  test('IC-8: the declared injects must include the literal inject of the wrapped plugin', () => {
    const definition: RowDefinition = {
      row: 'fx-short',
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'none' },
      plugin: { inject: ['fxDep', 'fxOther'], apply() {} },
    }
    expect(() => defineRow(definition)).toThrow(/fxDep/)
  })

  test('IC-8 holds for the object form of inject as well', () => {
    expect(() =>
      defineRow({
        row: 'fx-object-inject',
        implementation: 'real',
        manifest,
        lifecycle: { kind: 'none' },
        plugin: { inject: { fxDep: { required: true } }, apply() {} },
      }),
    ).toThrow(/fxDep/)
  })

  test('a name with the s0. prefix is refused: serve mode has no private names (DP1-C6)', () => {
    expect(() =>
      defineRow({
        row: 'fx-prefixed',
        implementation: 'real',
        manifest: { ...manifest, provides: ['s0.storage'] },
        lifecycle: { kind: 'none' },
        plugin: { apply() {} },
      }),
    ).toThrow(/s0\.storage/)
  })

  test('a row id that the boundary schema would refuse is refused here too', () => {
    expect(() =>
      defineRow({
        row: 'Bad Id',
        implementation: 'real',
        manifest,
        lifecycle: { kind: 'none' },
        plugin: { apply() {} },
      }),
    ).toThrow(/row id/)
  })
})

describe('defineRow: the wrapper runs the wrapped plugin in the row fiber', () => {
  class FxService extends Service {
    constructor(ctx: Context) {
      super(ctx, 'fxClass')
    }
  }

  test('a class plugin is constructed in the same fiber: its service leaves with the fiber', async () => {
    const root = new Context()
    const plugin = defineRow({
      row: 'fx-class',
      implementation: 'real',
      manifest: { ...manifest, provides: ['fxClass'] },
      lifecycle: { kind: 'none' },
      plugin: FxService,
    })
    const fiber = await root.plugin(plugin)
    expect(root.reflect.get('fxClass')).toBeInstanceOf(FxService)
    await fiber.dispose()
    expect(root.reflect.get('fxClass')).toBeUndefined()
  })

  test('a function plugin receives the row context and the config', async () => {
    const root = new Context()
    const seen: unknown[] = []
    const plugin = defineRow({
      row: 'fx-function',
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'none' },
      plugin: (ctx: Context, config: unknown) => {
        seen.push(ctx instanceof Context, config)
      },
    })
    await root.plugin(plugin, { tuned: true })
    expect(seen).toEqual([true, { tuned: true }])
  })

  test('IC-14: the wrapped plugin Config is handed over, a rejected config fails the row', async () => {
    const root = new Context()
    const Config = z.object({ port: z.number() })
    const plugin = defineRow({
      row: 'fx-config',
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'none' },
      plugin: { Config, apply() {} },
    })
    expect(plugin.Config).toBe(Config)
    await expect(root.plugin(plugin, { port: 'x' })).rejects.toBeDefined()
    await expect(root.plugin(plugin, { port: 1 })).resolves.toBeDefined()
  })
})

describe('defineRow: body-borne registration (DP1-C15 kind 1)', () => {
  test('the handle is registered with the declared phase and row, on the row fiber', async () => {
    const registry = registryFor({ 'fx-body': 'entry' })
    const root = new Context()
    await root.plugin(S0AssemblyLifecycleService, registry)
    const stops: number[] = []
    const plugin = defineRow({
      row: 'fx-body',
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'body', phase: 'entry' },
      body: async () => ({
        stop: async deadline => {
          stops.push(deadline)
          return { kind: 'settled' }
        },
      }),
    })
    const fiber = await root.plugin(plugin)
    expect(registry.liveRows()).toEqual(['fx-body'])
    await fiber.dispose()
    expect(registry.liveRows()).toEqual([])
  })

  test('a refused registration (phase mismatch) fails the row instead of passing silently', async () => {
    const registry = registryFor({ 'fx-body': 'storage' })
    const root = new Context()
    await root.plugin(S0AssemblyLifecycleService, registry)
    const plugin = defineRow({
      row: 'fx-body',
      implementation: 'real',
      manifest,
      lifecycle: { kind: 'body', phase: 'entry' },
      body: async () => ({ stop: async () => ({ kind: 'settled' }) }),
    })
    await expect(root.plugin(plugin)).rejects.toThrow(/phase-mismatch/)
    expect(registry.liveRows()).toEqual([])
  })
})
