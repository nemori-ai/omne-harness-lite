import { describe, expect, it } from 'vitest'
import {
  checkBundleModules,
  checkBundleTexts,
  hasMarker,
  omneNames,
} from '../scripts/bundle-checks.ts'
import { REMOTE_DEBUGGING_REFUSED_MESSAGE } from '../src/startup-signals.ts'

const MAIN = 'main/main.js' as const
const UTILITY = 'utility/entry.js' as const
const HOST = 'src/main/dev-host.ts'
const EMPTY = 'src/main/dev-host.empty.ts'

describe('包由哪些模块构成', () => {
  it('不打开发宿主的档：依赖图里没有它，导入它的包换成空实现；被摇掉的也算在内', () => {
    expect(checkBundleModules('release', MAIN, ['src/main/main.ts', EMPTY], []).problems).toEqual(
      [],
    )
    // Tree-shaken out of the rendered code, the real module is still in the graph: a failure.
    expect(checkBundleModules('release', MAIN, [HOST], []).problems).toEqual([
      'dist/release/main/main.js contains src/main/dev-host.ts, which the release profile must not bundle',
      'dist/release/main/main.js does not contain src/main/dev-host.empty.ts',
    ])
    // Any bundle, not only the one that imports it.
    expect(checkBundleModules('test', UTILITY, [HOST], []).problems).toEqual([
      'dist/test/utility/entry.js contains src/main/dev-host.ts, which the test profile must not bundle',
    ])
  })

  it('打开发宿主的 dev 档：要真的产出它的代码，且不带空实现', () => {
    expect(checkBundleModules('dev', MAIN, [HOST], [HOST]).problems).toEqual([])
    expect(checkBundleModules('dev', MAIN, [HOST, EMPTY], []).problems).toEqual([
      'dist/dev/main/main.js does not contain src/main/dev-host.ts: the check cannot see what it looks for',
      'dist/dev/main/main.js contains src/main/dev-host.empty.ts, which the dev profile must not bundle',
    ])
  })
})

describe('包的文字', () => {
  const release = `x("${REMOTE_DEBUGGING_REFUSED_MESSAGE}");({devTools:!1});e.OMNE_SERVER`
  const testMain = 'globalThis.desktopBuildProfile="test";w.openDevTools()'

  it('发行档：有拒绝远程调试与关掉 DevTools，没有别的档的标记，环境变量名只许读的那几个', () => {
    expect(checkBundleTexts('release', { [MAIN]: release, [UTILITY]: '' }).problems).toEqual([])
    expect(
      checkBundleTexts('release', {
        [MAIN]: 'x()',
        [UTILITY]: 'globalThis.desktopBuildProfile;process.env.OMNE_DEBUG_X',
      }).problems,
    ).toEqual([
      'dist/release/utility/entry.js contains the build profile global desktopBuildProfile, which the release profile must not',
      'dist/release/utility/entry.js contains OMNE_DEBUG_X: a release build reads no OMNE_* variable but OMNE_PAGE_ROOT, OMNE_SERVER',
      `no release bundle contains the remote debugging refusal ${REMOTE_DEBUGGING_REFUSED_MESSAGE}: the check cannot see what it looks for`,
      'no release bundle contains the DevTools switch devTools: the check cannot see what it looks for',
    ])
  })

  it('测试档是正对照：自己的标记要找得到；留着没替换的档名算错', () => {
    expect(checkBundleTexts('test', { [MAIN]: testMain, [UTILITY]: '' }).problems).toEqual([])
    expect(
      checkBundleTexts('test', { [MAIN]: 'x', [UTILITY]: 'OMNE_BUILD_PROFILE' }).problems,
    ).toEqual([
      'dist/test/utility/entry.js contains OMNE_BUILD_PROFILE',
      'no test bundle contains the build profile global desktopBuildProfile: the check cannot see what it looks for',
    ])
    expect(
      checkBundleTexts('test', { [MAIN]: `${testMain};({devTools:!0})`, [UTILITY]: '' }).problems,
    ).toEqual([
      'dist/test/main/main.js contains the DevTools switch devTools, which the test profile must not',
    ])
  })

  it('名字按整词找', () => {
    expect(hasMarker('w.openDevTools()', { text: 'devTools', name: true })).toBe(false)
    expect(hasMarker('{devTools:!1}', { text: 'devTools', name: true })).toBe(true)
    expect(omneNames('a.OMNE_SERVER,XOMNE_Y,"OMNE_SERVER"')).toEqual(['OMNE_SERVER'])
  })
})
