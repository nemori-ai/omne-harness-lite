import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { programIn, workspaceToolsOf } from '../../../src/rows/tool-host/script-host.ts'

/** These cases make runnable files by mode bits; the tiers read cases statically, so a case guards itself. */
const onPosix = (body: () => void) => () => {
  if (process.platform !== 'win32') body()
}

function directoryWith(name: string, mode: number): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'script-host-')))
  writeFileSync(join(directory, name), '#!/bin/sh\n')
  chmodSync(join(directory, name), mode)
  return directory
}

const first = onPosix(() => {
  const empty = realpathSync(mkdtempSync(join(tmpdir(), 'script-host-')))
  const one = directoryWith('runit', 0o755)
  const other = directoryWith('runit', 0o755)
  const env = { PATH: [empty, one, other].join(delimiter) }
  expect(programIn(env, 'runit')).toBe(join(one, 'runit'))
})

const absent = onPosix(() => {
  const plain = directoryWith('runit', 0o644)
  expect(programIn({ PATH: plain }, 'runit')).toBeUndefined()
  expect(programIn({ PATH: plain }, 'absent')).toBeUndefined()
  expect(programIn({}, 'runit')).toBeUndefined()
})

const ownPath = onPosix(() => {
  expect(programIn({ PATH: '' }, 'sh')).toBeUndefined()
})

const paths = onPosix(() => {
  expect(programIn({ PATH: '' }, '/usr/bin/env')).toBe('/usr/bin/env')
  const here = directoryWith('runit', 0o755)
  expect(programIn({ PATH: here }, './runit')).toBeUndefined()
  expect(programIn({ PATH: here }, 'sub/runit')).toBeUndefined()
})

describe('where a program named in tool.json lies', () => {
  it('is the first place on the given PATH that holds it as a runnable file', first)
  it('is not found when the PATH does not hold it, or holds a file that cannot be run', absent)
  it('never reads the PATH of the server process', ownPath)
  it('takes an absolute path as given and refuses a relative one', paths)
})

describe('where the copies of the tools of a workspace lie', () => {
  it('is one place for each tenant, so a script that writes beside itself reaches no other tenant', () => {
    const env = { TMPDIR: '/var/tmp/x' }
    const alpha = workspaceToolsOf(env, 'tenant:alpha')
    const beta = workspaceToolsOf(env, 'tenant:beta')
    expect(alpha).not.toBe(beta)
    expect(workspaceToolsOf(env, 'tenant:alpha')).toBe(alpha)
    expect(alpha.startsWith(join('/var/tmp/x', 'omne-workspace-tools'))).toBe(true)
    expect(dirname(alpha)).toBe(dirname(beta))
    expect(basename(alpha)).toMatch(/^[0-9a-f]{64}$/u)
  })
})
