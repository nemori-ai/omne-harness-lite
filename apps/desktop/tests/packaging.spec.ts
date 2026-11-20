import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import base, { PRODUCT } from '../electron-builder.config.mjs'
import release from '../electron-builder.release.config.mjs'
import { packagedExecutable } from '../e2e/packaged-path.ts'

describe('打包', () => {
  it('两档只差打包后翻 fuses 与输出目录；名字可移植，平台不改写可执行文件名', () => {
    const { afterPack, directories, ...rest } = release
    const { directories: baseDirectories, ...baseRest } = base
    expect(rest).toEqual(baseRest)
    expect(typeof afterPack).toBe('function')
    expect(directories).toEqual({ ...baseDirectories, output: 'out/release' })
    expect(base.productName).toBe(PRODUCT.productName)
    expect(JSON.stringify(base)).not.toContain('executableName')
    for (const platform of ['darwin', 'win32', 'linux'] as const)
      expect(() => packagedExecutable('out', PRODUCT, platform, 'arm64')).not.toThrow()
  })

  it.each([
    ['darwin', 'x64', ['mac', 'My App.app', 'Contents', 'MacOS', 'My App']],
    ['darwin', 'arm64', ['mac-arm64', 'My App.app', 'Contents', 'MacOS', 'My App']],
    ['win32', 'x64', ['win-unpacked', 'My App.exe']],
    ['win32', 'arm64', ['win-arm64-unpacked', 'My App.exe']],
    ['linux', 'x64', ['linux-unpacked', 'my-app']],
    ['linux', 'arm64', ['linux-arm64-unpacked', 'my-app']],
  ] as const)('%s %s 的可执行文件照 electron-builder 的缺省名字', (platform, arch, segments) => {
    expect(packagedExecutable('out', { name: 'My-App', productName: 'My App' }, platform, arch)).toBe(
      join('out', ...segments),
    )
  })

  it.each(['Bad/Name', 'Bad:Name', 'Trailing.', 'Trailing ', 'CON', 'NUL.txt', ''])(
    '会被平台改写的名字拒绝：%j',
    productName => {
      expect(() => packagedExecutable('out', { name: 'omne', productName }, 'darwin', 'arm64')).toThrow(
        'portable desktop filename',
      )
    },
  )
})
