import { statSync } from 'node:fs'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { askControl, controlPath } from '../src/control-port.ts'
import { defineRow } from '../src/row.ts'
import { serveOnce, type ServeRun } from './fixtures/serve/harness.ts'
import { fixturePlugins, fixtureStorageHost, syntheticRow } from './fixtures/serve/index.ts'
import { publisher, rowModule, versionDirectory } from './support/version-directory.ts'

const log = (): string[] => ((globalThis as { __swapLog?: string[] }).__swapLog ??= [])
afterEach(() => {
  log().length = 0
})

/** The row the tests swap: a leaf that declared the swap of its implementation. */
function leaf(options: { swap?: 'implementation'; provides?: string[]; contract?: string } = {}) {
  const provides = options.provides ?? []
  return defineRow({
    row: 'fx-leaf',
    implementation: 'real',
    manifest: { provides, injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    ...(options.swap === undefined ? {} : { swap: options.swap }),
    ...(options.contract === undefined
      ? {}
      : { contracts: { [provides[0] ?? '']: options.contract } }),
    plugin: {
      name: 'fx-leaf',
      apply(ctx: Context) {
        log().push('v1')
        ctx.effect(() => () => void log().push('v1:gone'))
        for (const name of provides) ctx.provide(name, { from: 'v1' })
      },
    } satisfies Plugin.Object,
  })
}

type Asked = Awaited<ReturnType<typeof askControl>>

/** Serves a tree with the leaf row and runs `body` while it serves; `swap` asks through the control port. */
async function serving(
  options: {
    leaf?: Plugin.Object
    publisherKeys?: readonly string[]
    named?: readonly string[]
    extra?: Readonly<Record<string, Plugin.Object>>
  },
  body: (
    swap: (row: string, directory: string) => Promise<Asked>,
    stateRoot: string,
  ) => Promise<void>,
): Promise<ServeRun> {
  const extra = options.extra ?? {}
  return serveOnce({
    distribution: {
      rows: [
        { id: 'storage', plugin: 'fixtureStorage', config: {} },
        { id: 'fx-leaf', plugin: 'fxLeaf', config: {} },
        ...Object.keys(extra).map(plugin => ({ id: plugin, plugin, config: {} })),
        { id: 'fx-entry', plugin: 'fxEntry', config: {} },
      ],
    },
    ...(options.named === undefined
      ? {}
      : { operator: { ops: [], versionDirectories: options.named } }),
    plugins: {
      stubPlugin,
      fixtureStorage: fixturePlugins.fixtureStorage,
      fxLeaf: options.leaf ?? leaf({ swap: 'implementation' }),
      fxEntry: syntheticRow({ id: 'fx-entry', phase: 'entry' }),
      ...extra,
    },
    entryObjects: [fixtureStorageHost()],
    ...(options.publisherKeys === undefined ? {} : { publisherKeys: options.publisherKeys }),
    serving: ({ stateRoot }) =>
      body((row, directory) => askControl(stateRoot, { op: 'swap', row, directory }), stateRoot),
  })
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20))

describe('换一行：经本机的控制口（C13、C19、C20）', () => {
  it('换实现两次：先答影响再答结果；旧的一代卸载，别的行没有重跑，进程照常服务到被要求停止', async () => {
    const key = publisher()
    const v2 = versionDirectory(
      rowModule({ row: 'fx-leaf', mark: 'v2', swap: 'implementation' }),
      key,
    )
    const v3 = versionDirectory(
      rowModule({ row: 'fx-leaf', mark: 'v3', swap: 'implementation' }),
      key,
    )
    const answers: Asked[] = []
    const run = await serving({ publisherKeys: [key.publicKey] }, async swap => {
      answers.push(await swap('fx-leaf', v2))
      answers.push(await swap('fx-leaf', v3))
      await settle()
    })
    expect(answers[0]).toEqual([
      {
        kind: 'impact',
        row: 'fx-leaf',
        source: 'publisher',
        way: 'implementation',
        reruns: [],
        reasons: expect.any(Array),
      },
      {
        kind: 'result',
        outcome: 'swapped',
        row: 'fx-leaf',
        digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    ])
    expect(answers[1]?.at(-1)).toMatchObject({ outcome: 'swapped' })
    expect(log()).toEqual(['v1', 'v2', 'v1:gone', 'v3', 'v2:gone', 'v3:gone'])
    expect(run.of('row-swap').map(record => [record['row'], record['way']])).toEqual([
      ['fx-leaf', 'implementation'],
      ['fx-leaf', 'implementation'],
    ])
    // Nothing else ran again, and the supervision did not take the old generation for a row that left.
    expect(run.result.appliedRows).toEqual(['storage', 'fx-leaf', 'fx-entry', 'fx-leaf', 'fx-leaf'])
    expect([
      run.of('row-supervision'),
      run.of('swap-mismatch'),
      run.of('supervision-exit'),
    ]).toEqual([[], [], []])
    expect(run.result.exitCode).toBe(0)
    expect(run.of('shutdown-result')[0]).toMatchObject({ overall: 'settled' })
  })

  it('新的一代 apply 抛错：被拒并带原因，旧的照常（C16 的机制）', async () => {
    const key = publisher()
    const bad = versionDirectory(
      rowModule({
        row: 'fx-leaf',
        mark: 'bad',
        swap: 'implementation',
        body: "throw new Error('bad cannot start')",
      }),
      key,
    )
    let answer: Asked = []
    const run = await serving({ publisherKeys: [key.publicKey] }, async swap => {
      answer = await swap('fx-leaf', bad)
    })
    expect(answer.at(-1)).toMatchObject({
      outcome: 'refused',
      reason: 'did-not-start',
      detail: 'bad cannot start',
    })
    expect(log()).toEqual(['v1', 'bad', 'bad:gone', 'v1:gone'])
    expect([run.of('row-swap'), run.result.exitCode]).toEqual([[], 0])
  })

  it('契约变了形：结论不是换实现，原因写明是哪个服务键；不会静默换上（C19）', async () => {
    const key = publisher()
    const reshaped = versionDirectory(
      rowModule({
        row: 'fx-leaf',
        mark: 'v2',
        swap: 'implementation',
        provides: ['fxSvc'],
        contracts: { fxSvc: 'c2' },
      }),
      key,
    )
    let answer: Asked = []
    const run = await serving(
      {
        leaf: leaf({ swap: 'implementation', provides: ['fxSvc'], contract: 'c1' }),
        publisherKeys: [key.publicKey],
      },
      async swap => {
        answer = await swap('fx-leaf', reshaped)
      },
    )
    const [impact, result] = answer
    expect(impact).toMatchObject({ kind: 'impact', way: 'rerun' })
    expect(JSON.stringify(impact?.['reasons'])).toContain('fxSvc')
    expect(result).toMatchObject({ outcome: 'refused', reason: 'needs-new-process' })
    expect(log()).toEqual(['v1', 'v1:gone'])
    expect(run.of('row-swap')).toEqual([])
  })

  it('没有声明换法的行：结论是换进程，被拒', async () => {
    const key = publisher()
    const next = versionDirectory(rowModule({ row: 'fx-leaf', mark: 'v2' }), key)
    let answer: Asked = []
    await serving({ leaf: leaf(), publisherKeys: [key.publicKey] }, async swap => {
      answer = await swap('fx-leaf', next)
    })
    expect(answer[0]).toMatchObject({ kind: 'impact', way: 'restart' })
    expect(answer.at(-1)).toMatchObject({ outcome: 'refused', reason: 'needs-new-process' })
    expect(log()).toEqual(['v1', 'v1:gone'])
  })

  it('来源没核过的装不上：没有签名、不是这个发行方签的、改过一个文件，各有原因；什么都没装入', async () => {
    const key = publisher()
    const unsigned = versionDirectory(
      rowModule({ row: 'fx-leaf', mark: 'u', swap: 'implementation' }),
    )
    const foreign = versionDirectory(
      rowModule({ row: 'fx-leaf', mark: 'f', swap: 'implementation' }),
      publisher(),
    )
    const answers: Asked[] = []
    await serving({ publisherKeys: [key.publicKey] }, async swap => {
      answers.push(await swap('fx-leaf', unsigned))
      answers.push(await swap('fx-leaf', foreign))
    })
    expect(answers.map(answer => answer.at(-1)?.['reason'])).toEqual([
      'signature-missing',
      'signature-invalid',
    ])
    expect(answers.every(answer => answer.length === 1)).toBe(true)
    expect(log()).toEqual(['v1', 'v1:gone'])
  })

  it('运维者在部署的配置里点了名的目录：不要签名也换得上（C20）', async () => {
    const named = versionDirectory(
      rowModule({ row: 'fx-leaf', mark: 'v2', swap: 'implementation' }),
    )
    let answer: Asked = []
    await serving({ named: [named] }, async swap => {
      answer = await swap('fx-leaf', named)
    })
    expect(answer[0]).toMatchObject({ kind: 'impact', source: 'operator' })
    expect(answer.at(-1)).toMatchObject({ outcome: 'swapped' })
    expect(log()).toEqual(['v1', 'v2', 'v1:gone', 'v2:gone'])
  })

  it('没有这一行、入口给的是别的行、入口不是一行、请求不成形：都被拒', async () => {
    const key = publisher()
    const other = versionDirectory(
      rowModule({ row: 'fx-other', mark: 'o', swap: 'implementation' }),
      key,
    )
    const noRow = versionDirectory('export const nothing = 1\n', key)
    const answers: Asked[] = []
    let raw: Asked = []
    await serving({ publisherKeys: [key.publicKey] }, async (swap, stateRoot) => {
      answers.push(await swap('fx-missing', other))
      answers.push(await swap('fx-leaf', other))
      answers.push(await swap('fx-leaf', noRow))
      raw = await askControl(stateRoot, { op: 'install', row: 'fx-leaf' })
    })
    expect(answers.map(answer => answer.at(-1)?.['reason'])).toEqual([
      'unknown-row',
      'name-mismatch',
      'not-a-row',
    ])
    expect(raw.at(-1)).toMatchObject({ outcome: 'refused', reason: 'bad-request' })
    expect(log()).toEqual(['v1', 'v1:gone'])
  })

  it('一次只换一行：前一次还没有结局时再来一次，被拒', async () => {
    const key = publisher()
    const slow = versionDirectory(
      rowModule({
        row: 'fx-leaf',
        mark: 'slow',
        swap: 'implementation',
        body: 'return new Promise(resolve => setTimeout(resolve, 150))',
      }),
      key,
    )
    let answers: Asked[] = []
    await serving({ publisherKeys: [key.publicKey] }, async swap => {
      answers = await Promise.all([swap('fx-leaf', slow), swap('fx-leaf', slow)])
    })
    expect(answers.map(answer => answer.at(-1)?.['outcome']).sort()).toEqual(['refused', 'swapped'])
    expect(answers.flat().find(line => line['outcome'] === 'refused')).toMatchObject({
      reason: 'busy',
    })
    expect(log()).toEqual(['v1', 'slow', 'v1:gone', 'slow:gone'])
  })

  it('控制口是状态目录里的一个文件，只有这个用户能连；停止之后它就没了', async () => {
    let mode = 0
    let path = ''
    const run = await serving({}, async (_swap, stateRoot) => {
      path = controlPath(stateRoot)
      mode = statSync(path).mode & 0o777
    })
    expect(mode).toBe(0o600)
    expect(run.of('control-port')).toEqual([{ kind: 'control-port', open: true }])
    expect(() => statSync(path)).toThrow()
  })
})
