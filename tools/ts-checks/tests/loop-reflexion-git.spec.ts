// @module-tag slow
// Slow: complete revision snapshots use real Git subprocesses and a temporary repository.
import { readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readReflexion } from '../src/loop/sensors/reflexion.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  write,
} from './fixtures/loop-canary/repository.ts'
afterEach(removeTemporaries)
const nodeRoot = '.meta_harness/design/realization',
  member = 'packages/session/example'
const declaration = `${nodeRoot}/${member}/bindings.yaml`

describe('version-local architecture baseline', () => {
  it.each([
    {
      kind: 'assembly',
      text: 'assembly: {plugins: [{name: example, source: "design.md#plugin"}]}',
    },
    { kind: 'composition', text: 'composition: {plugins: []}' },
  ])(
    'removing the last $kind preserves intent differences while comparison has no data',
    ({ text }) => {
      const root = repository()
      write(root, declaration, text)
      const base = commit(root, 'declared intent')
      write(root, declaration, '{}')
      expect(readReflexion(root, { enabled: true, nodeRoot }, base)).toMatchObject({
        reflexion: { status: 'no-data', reason: `${nodeRoot} 完全没有 assembly/composition 声明` },
        intentChanges: {
          status: 'data',
          data: [{ member, path: declaration, before: expect.any(String), after: null }],
        },
      })
    },
  )
  it('removing the whole node area retains the baseline declaration and its location', () => {
    const root = repository()
    write(root, declaration, 'assembly: {plugins: []}')
    const base = commit(root, 'declared intent')
    rmSync(join(root, nodeRoot), { recursive: true })
    expect(readReflexion(root, { enabled: true, nodeRoot }, base)).toMatchObject({
      reflexion: { status: 'no-data', reason: `${nodeRoot} 缺失或没有 realization 节点` },
      intentChanges: {
        status: 'data',
        data: [{ member, path: declaration, before: expect.any(String), after: null }],
      },
    })
  })
  it('no baseline is unknown and unchanged undeclared revisions have no semantic red items', () => {
    const root = repository()
    write(root, declaration, '{}')
    const base = commit(root, 'undeclared intent')
    write(root, declaration, '# no semantic change\n{}')
    expect(readReflexion(root, { enabled: true, nodeRoot })).toMatchObject({
      reflexion: { status: 'no-data' },
      intentChanges: { status: 'no-data', reason: '没给基线' },
    })
    expect(readReflexion(root, { enabled: true, nodeRoot }, base).intentChanges).toEqual({
      status: 'data',
      data: [],
    })
    rmSync(join(root, nodeRoot), { recursive: true })
    expect(readReflexion(root, { enabled: true, nodeRoot }, base).intentChanges).toEqual({
      status: 'data',
      data: [],
    })
    expect(
      readReflexion('/does-not-exist', { enabled: false, nodeRoot: '/invalid' }, 'invalid'),
    ).toEqual({
      reflexion: { status: 'no-data', reason: '配置里关了' },
      intentChanges: { status: 'no-data', reason: '配置里关了' },
    })
  })
  it('deleted helpers, moved source, changed export aliases and uncommitted new files retain their correct baseline', () => {
    const root = repository()
    write(
      root,
      `${member}/package.json`,
      '{"name":"@omne-harness-lite/example","exports":{".":"./dist/index.js"}}',
    )
    write(
      root,
      `${member}/src/plugin.ts`,
      `import {definePlugin} from '@omne-harness-lite/kernel-basis'; import {KEY} from './index.js'; import {apply} from './helper.js'; export const plugin=definePlugin({name:'example',inject:[KEY],apply})`,
    )
    write(
      root,
      `${member}/src/helper.ts`,
      "import type {Context} from '@deepseek-ai/cordis';export function apply(ctx:Context){ctx.provide('old',{})}",
    )
    write(
      root,
      `${member}/src/keys.ts`,
      "export const OLD='oldDependency'; export const NEW='newDependency'",
    )
    write(root, `${member}/src/index.ts`, "export {OLD as KEY} from './keys.js'")
    write(
      root,
      declaration,
      'assembly:\n  plugins:\n    - name: example\n      source: design.md#plugin\n',
    )
    const base = commit(root, 'baseline')
    renameSync(join(root, member, 'src/helper.ts'), join(root, member, 'src/moved.ts'))
    write(
      root,
      `${member}/src/plugin.ts`,
      readFileSync(join(root, member, 'src/plugin.ts'), 'utf8').replace(
        './helper.js',
        './moved.js',
      ),
    )
    const { reflexion: moved } = readReflexion(root, { enabled: true, nodeRoot }, base)
    expect(moved).toMatchObject({
      status: 'data',
      data: { newDeviations: { status: 'data', data: [] } },
    })
    write(root, `${member}/src/index.ts`, "export {NEW as KEY} from './keys.js'")
    write(
      root,
      declaration,
      'assembly:\n  plugins:\n    - name: example\n      source: design.md#plugin\n      injects: [newDependency]\n',
    )
    write(
      root,
      `${member}/src/untracked.ts`,
      "import {definePlugin} from '@omne-harness-lite/kernel-basis';export const b=definePlugin({name:'untracked',apply(ctx){ctx.provide('fresh',{})}})",
    )
    const { reflexion: changed } = readReflexion(root, { enabled: true, nodeRoot }, base)
    expect(changed).toMatchObject({
      status: 'data',
      data: {
        newDeviations: {
          status: 'data',
          data: expect.arrayContaining([
            expect.objectContaining({ key: 'newDependency' }),
            expect.objectContaining({ key: 'fresh' }),
            expect.objectContaining({ key: 'untracked' }),
          ]),
        },
        intentChanges: { status: 'data', data: [expect.objectContaining({ path: declaration })] },
      },
    })
    git(root, 'rm', '-q', `${member}/src/keys.ts`)
    const { reflexion: deleted } = readReflexion(root, { enabled: true, nodeRoot }, base)
    expect(deleted).toMatchObject({
      status: 'data',
      data: {
        current: {
          unknown: expect.arrayContaining([
            expect.objectContaining({ kind: 'injects', expression: 'KEY' }),
          ]),
        },
      },
    })
  })
})
