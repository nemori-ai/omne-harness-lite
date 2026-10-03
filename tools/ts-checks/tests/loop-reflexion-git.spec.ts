// @module-tag slow
// Slow: complete revision snapshots use real Git subprocesses and a temporary repository.
import { readFileSync, renameSync } from 'node:fs'
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
    const moved = readReflexion(root, { enabled: true, nodeRoot }, base)
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
    const changed = readReflexion(root, { enabled: true, nodeRoot }, base)
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
    const deleted = readReflexion(root, { enabled: true, nodeRoot }, base)
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
