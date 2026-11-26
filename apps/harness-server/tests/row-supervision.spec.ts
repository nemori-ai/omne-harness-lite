import type { Context, Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { defineRow } from '../src/row.ts'
import { serveOnce } from './fixtures/serve/harness.ts'
import { fixturePlugins, fixtureStorageHost, syntheticRow } from './fixtures/serve/index.ts'

const tree = (rows: readonly (readonly [id: string, plugin: string])[]) => ({
  rows: rows.map(([id, plugin]) => ({ id, plugin, config: {} })),
})

/** A row with no lifecycle handle whose plugin does `then` once the process serves. */
function quietRow(
  id: string,
  manifest: { provides: string[]; injects: string[] },
  then: (ctx: Context) => void,
): Plugin.Object {
  return defineRow({
    row: id,
    implementation: 'real',
    manifest: { ...manifest, sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: id,
      inject: manifest.injects,
      apply(ctx: Context) {
        for (const name of manifest.provides) ctx.provide(name, { from: id })
        setTimeout(() => then(ctx), 150)
      },
    },
  })
}

describe('运行中一行没了（C21、HS-55）', () => {
  it('没有关闭阶段的行被撤下不回来：进入等依赖，期限到了以 4 退出，记录点名这一行', async () => {
    const run = await serveOnce({
      distribution: tree([
        ['storage', 'fixtureStorage'],
        ['fx-quiet', 'fxQuiet'],
        ['fx-entry', 'fxEntry'],
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fxQuiet: quietRow('fx-quiet', { provides: [], injects: [] }, ctx => {
          void ctx.fiber.dispose()
        }),
        fxEntry: syntheticRow({ id: 'fx-entry', phase: 'entry' }),
      },
      entryObjects: [fixtureStorageHost()],
      stopAfterStartup: false,
      dependencyDeadlineMs: 200,
    })
    expect(run.startup).toMatchObject({ accepting: true })
    expect(run.of('row-supervision')).toEqual([
      { kind: 'row-supervision', row: 'fx-quiet', standing: 'waiting' },
    ])
    expect(run.of('supervision-exit')).toEqual([
      { kind: 'supervision-exit', row: 'fx-quiet', reason: 'dependency-deadline', code: 4 },
    ])
    expect(run.stderr).toContain('serve: row fx-quiet: dependency-deadline; the process leaves')
    expect(run.result.exitCode).toBe(4)
    // The process still closes in order: the rows that are left are stopped and the report is written.
    expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
  })

  it('一行在运行中重跑：没有声明换法的行是换进程，进程有计划地以 0 退出', async () => {
    let runs = 0
    const run = await serveOnce({
      distribution: tree([
        ['storage', 'fixtureStorage'],
        ['fx-user', 'fxUser'],
        ['fx-entry', 'fxEntry'],
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fxUser: quietRow('fx-user', { provides: [], injects: [] }, ctx => {
          runs += 1
          if (runs === 1) void ctx.fiber.restart()
        }),
        fxEntry: syntheticRow({ id: 'fx-entry', phase: 'entry' }),
      },
      entryObjects: [fixtureStorageHost()],
      stopAfterStartup: false,
      dependencyDeadlineMs: 60_000,
    })
    expect(run.of('supervision-exit')).toEqual([
      { kind: 'supervision-exit', row: 'fx-user', reason: 'row-returned', code: 0 },
    ])
    expect(run.result.exitCode).toBe(0)
  })

  it('没有一行来去：进程照常服务到被要求停止，没有监督的记录', async () => {
    const run = await serveOnce({
      distribution: tree([
        ['storage', 'fixtureStorage'],
        ['fx-entry', 'fxEntry'],
      ]),
      plugins: {
        stubPlugin,
        fixtureStorage: fixturePlugins.fixtureStorage,
        fxEntry: syntheticRow({ id: 'fx-entry', phase: 'entry' }),
      },
      entryObjects: [fixtureStorageHost()],
    })
    expect([run.of('row-supervision'), run.of('supervision-exit')]).toEqual([[], []])
    expect(run.result.exitCode).toBe(0)
  })
})
