import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packagedExecutable } from '../scripts/packaged-path.ts'
import { emptyEntries, parseBuildArgs } from '../scripts/build-profile.ts'
import { FUSE_NAMES, FUSES, fuseMismatches, packagedProfileOf } from '../scripts/fuses.ts'
import {
  credentialStoreSwitches,
  linuxSandboxBlocker,
  processDirOf,
  type SandboxProbe,
  windowStateSwitches,
} from '../scripts/launch.ts'
import { screenLock, screenLockedFromIoreg } from '../scripts/session-state.ts'
import { remoteDebuggingSwitch, reportedBuildProfile } from '../src/startup-signals.ts'

describe('构建档', () => {
  it('build 只接受 test 与 release，缺省 test；开发宿主只进 dev 档', () => {
    expect(parseBuildArgs([])).toBe('test')
    expect(parseBuildArgs(['release'])).toBe('release')
    for (const bad of [['dev'], ['x'], ['test', 'release']])
      expect(() => parseBuildArgs(bad)).toThrow('usage')
    expect(emptyEntries('dev')).toEqual([])
    expect(emptyEntries('test').map(entry => entry.module)).toEqual(['src/main/dev-host.ts'])
    expect(emptyEntries('release')).toEqual(emptyEntries('test'))
  })

  it('读出启动行报的档：只认主进程的那一行', () => {
    expect(
      reportedBuildProfile('{"process":"main","buildProfile":"test","msg":"build profile"}'),
    ).toBe('test')
    expect(reportedBuildProfile('{"process":"utility","buildProfile":"test"}')).toBeUndefined()
    expect(reportedBuildProfile('buildProfile test')).toBeUndefined()
  })
})

describe('拒绝远程调试', () => {
  const none = () => false
  it('Chromium 认的每种写法都算，Windows 上不分大小写、可用斜杠', () => {
    for (const arg of [
      '--remote-debugging-port=9222',
      '-remote-debugging-port',
      '--remote-debugging-pipe',
    ])
      expect(remoteDebuggingSwitch(none, ['app', arg], 'darwin')).toBeDefined()
    expect(remoteDebuggingSwitch(none, ['/Remote-Debugging-Port=1'], 'win32')).toBe(
      'remote-debugging-port',
    )
    expect(remoteDebuggingSwitch(none, ['/remote-debugging-port=1'], 'darwin')).toBeUndefined()
    expect(remoteDebuggingSwitch(none, ['--remote-debugging-portal'], 'darwin')).toBeUndefined()
    expect(remoteDebuggingSwitch(name => name === 'remote-debugging-pipe', [], 'linux')).toBe(
      'remote-debugging-pipe',
    )
  })
})

describe('fuses', () => {
  it('测试档与发行档只差 Node 调试参数；两档由打包的目录认出', () => {
    const differ = FUSE_NAMES.filter(name => FUSES.test[name] !== FUSES.release[name])
    expect(differ).toEqual(['EnableNodeCliInspectArguments'])
    expect(FUSES.release.EnableCookieEncryption).toBe(true)
    expect(fuseMismatches({ ...FUSES.release }, 'release')).toEqual([])
    expect(fuseMismatches({ ...FUSES.release }, 'test')).toEqual([
      'EnableNodeCliInspectArguments is false, expected true',
    ])
    expect(packagedProfileOf('dist/test')).toBe('test')
    expect(packagedProfileOf('dist/release')).toBe('release')
    expect(() => packagedProfileOf('dist/dev')).toThrow()
  })
})

describe('打包后的可执行文件', () => {
  it.each([
    ['darwin', 'x64', ['mac', 'My App.app', 'Contents', 'MacOS', 'My App']],
    ['darwin', 'arm64', ['mac-arm64', 'My App.app', 'Contents', 'MacOS', 'My App']],
    ['win32', 'x64', ['win-unpacked', 'My App.exe']],
    ['win32', 'arm64', ['win-arm64-unpacked', 'My App.exe']],
    ['linux', 'x64', ['linux-unpacked', 'my-app']],
    ['linux', 'arm64', ['linux-arm64-unpacked', 'my-app']],
  ] as const)('%s %s 照 electron-builder 的缺省名字', (platform, arch, segments) => {
    const names = { name: 'My-App', productName: 'My App' }
    expect(packagedExecutable('out', names, platform, arch)).toBe(join('out', ...segments))
  })

  it.each(['Bad/Name', 'Bad:Name', 'Trailing.', 'Trailing ', 'CON', 'NUL.txt', ''])(
    '会被平台改写的名字拒绝：%j',
    productName => {
      const names = { name: 'omne', productName }
      expect(() => packagedExecutable('out', names, 'darwin', 'arm64')).toThrow('portable')
    },
  )

  it('macOS 上一个应用的进程都在它的 .app 里', () => {
    expect(processDirOf('/o/omne.app/Contents/MacOS/omne', 'darwin')).toBe('/o/omne.app')
    expect(processDirOf('/o/linux-unpacked/omne', 'linux')).toBe('/o/linux-unpacked')
  })
})

describe('测试启动的隔离', () => {
  it('macOS 用假钥匙串并跳过窗口恢复的询问，Linux 用基本密码库，Windows 不加', () => {
    expect(credentialStoreSwitches('darwin')).toEqual(['--use-mock-keychain'])
    expect(credentialStoreSwitches('linux')).toEqual(['--password-store=basic'])
    expect(credentialStoreSwitches('win32')).toEqual([])
    expect(windowStateSwitches('darwin')).toEqual(['-ApplePersistenceIgnoreState', 'YES'])
    expect(windowStateSwitches('linux')).toEqual([])
  })

  const probe = (over: Partial<SandboxProbe> = {}): SandboxProbe => ({
    euid: () => 1000,
    sysctl: () => undefined,
    stat: () => undefined,
    userNamespace: () => ({ result: 'created' }),
    ...over,
  })

  it('Linux 沙箱：能建用户命名空间就能起；root、建不出又没有 setuid 助手就起不来', () => {
    expect(linuxSandboxBlocker('/a/omne', probe())).toBeUndefined()
    expect(linuxSandboxBlocker('/a/omne', probe({ euid: () => 0 }))).toContain('root')
    const blocked = probe({ userNamespace: () => ({ result: 'failed', reason: 'denied' }) })
    expect(linuxSandboxBlocker('/a/omne', blocked)).toContain('denied')
    const helper = probe({ ...blocked, stat: () => ({ uid: 0, mode: 0o104755 }) })
    expect(linuxSandboxBlocker('/a/omne', helper)).toBeUndefined()
    const apparmor = probe({ sysctl: name => (name.includes('apparmor') ? '1' : undefined) })
    expect(linuxSandboxBlocker('/a/omne', apparmor)).toContain('AppArmor')
    const off = probe({
      userNamespace: () => ({ result: 'unavailable' }),
      sysctl: name => (name === 'user.max_user_namespaces' ? '0' : undefined),
    })
    expect(linuxSandboxBlocker('/a/omne', off)).toContain('max_user_namespaces')
  })

  it('macOS 锁屏从 ioreg 读；别的平台总当没锁', () => {
    const xml = (locked: boolean) =>
      `<key>IOConsoleUsers</key><key>CGSSessionScreenIsLocked</key><${locked}/>`
    expect(screenLockedFromIoreg(xml(true))).toBe(true)
    expect(screenLock('darwin', () => xml(false))).toEqual({ locked: false })
    expect(screenLock('darwin', () => '')).toHaveProperty('unknown')
    expect(screenLock('linux', () => xml(true))).toEqual({ locked: false })
  })
})
