import { describe, expect, it } from 'vitest'
import { bundleProblems } from '../scripts/bundle-checks.ts'
import { REMOTE_DEBUGGING_REFUSED_MESSAGE } from '../src/startup-signals.ts'

const record = (modules: string[], sha256 = 'h') => ({ bundle: 'main/main.js', sha256, modules })
const MAIN = 'main/main.js' as const

describe('包里装了什么', () => {
  it('发行档：有拒绝远程调试与关掉 DevTools，没有给驱动的档名与开发宿主', () => {
    const good = `x("${REMOTE_DEBUGGING_REFUSED_MESSAGE}");({devTools:!1})`
    expect(bundleProblems('release', MAIN, record(['src/main/main.ts']), good, 'h')).toEqual([])
    const bad = 'globalThis.desktopBuildProfile=1;({userDataSuffix:"dev"})'
    expect(bundleProblems('release', MAIN, record(['src/main/dev-host.ts']), bad, 'h')).toEqual([
      'release main/main.js: bundles src/main/dev-host.ts, which this profile leaves out',
      'release main/main.js: misses the remote debugging refusal',
      'release main/main.js: misses the DevTools turned off',
      'release main/main.js: carries the build profile for drivers',
      'release main/main.js: carries the development host',
    ])
  })

  it('测试档反过来；dev 档要有开发宿主；文件与记录对不上、留着没替换的档名都算错', () => {
    expect(bundleProblems('test', MAIN, record([]), 'desktopBuildProfile', 'h')).toEqual([])
    expect(bundleProblems('test', MAIN, record([]), 'desktopBuildProfile', 'other')).toEqual([
      'test main/main.js: the file is not the one its module record describes',
    ])
    expect(
      bundleProblems('test', MAIN, record([]), 'desktopBuildProfile OMNE_BUILD_PROFILE', 'h'),
    ).toEqual(['test main/main.js: carries OMNE_BUILD_PROFILE'])
    expect(bundleProblems('dev', MAIN, record([]), 'desktopBuildProfile', 'h')).toEqual([
      'dev main/main.js: misses src/main/dev-host.ts, which this profile bundles',
      'dev main/main.js: misses the development host',
    ])
    expect(bundleProblems('test', 'utility/entry.js', record([]), 'devTools', 'h')).toEqual([])
  })
})
