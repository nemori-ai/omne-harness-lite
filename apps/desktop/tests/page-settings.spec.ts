import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageSettings } from '../src/main/page-settings.ts'

const given = {
  OMNE_PAGE_PUBLISHER_KEY: 'a key from the environment',
  OMNE_PAGE_MOUNT_MS: '800',
  OMNE_PAGE_STABLE_MS: '900',
}

afterEach(() => void vi.unstubAllGlobals())

describe('页面包的设定', () => {
  it('发行档不读环境：环境里给了公钥与时限也不认，没有带公钥就什么都装不上', () => {
    vi.stubGlobal('OMNE_BUILD_PROFILE', 'release')
    expect(pageSettings(given)).toEqual({ publisherKeys: [], mountMs: 15_000, stableMs: 10_000 })
  })

  it('测试档与开发档：认环境里的公钥与两个时限', () => {
    for (const profile of ['test', 'dev']) {
      vi.stubGlobal('OMNE_BUILD_PROFILE', profile)
      expect(pageSettings(given)).toEqual({
        publisherKeys: ['a key from the environment'],
        mountMs: 800,
        stableMs: 900,
      })
    }
  })

  it('测试档：没给、给了空串、给的不是正整数，各自落回缺省', () => {
    vi.stubGlobal('OMNE_BUILD_PROFILE', 'test')
    const byDefault = { publisherKeys: [], mountMs: 15_000, stableMs: 10_000 }
    expect(pageSettings({})).toEqual(byDefault)
    expect(pageSettings({ OMNE_PAGE_PUBLISHER_KEY: '' })).toEqual(byDefault)
    for (const wrong of ['0', '-5', '1.5', 'soon', ''])
      expect(pageSettings({ OMNE_PAGE_MOUNT_MS: wrong, OMNE_PAGE_STABLE_MS: wrong })).toEqual(
        byDefault,
      )
  })
})
