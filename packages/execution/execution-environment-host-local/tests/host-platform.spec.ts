import { afterEach, expect, it, vi } from 'vitest'
import * as os from 'node:os'
import * as fs from 'node:fs/promises'
import * as probes from '../src/host-probe.ts'
import * as native from '../src/windows-execution/compile.ts'
import * as windowsProbes from '../src/windows-execution/prerequisites.ts'
import { createHostPlatform, probeWindowsExecution } from '../src/host-platform.ts'
import { createHostFilesDomain, domainInternals } from '../src/host-domain.ts'
import { commandSettings } from '../src/host-command.ts'
import { terminalSettings } from '../src/host-terminal.ts'

vi.mock('node:os', async importOriginal => ({
  ...(await importOriginal<typeof import('node:os')>()),
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
afterEach(() => {
  vi.restoreAllMocks()
  if (platform) Object.defineProperty(process, 'platform', platform)
})
function host(osName: string) {
  Object.defineProperty(process, 'platform', { value: osName, configurable: true })
  const domain = domainInternals(createHostFilesDomain())
  if (!domain) throw new Error('missing domain')
  return {
    domain,
    execution: createHostPlatform({
      settings: commandSettings(),
      terminal: terminalSettings(),
      windowsCapacity: domain.windowsCapacity,
    }),
  }
}

it('keeps Windows installation facts separate from Linux probes', async () => {
  vi.spyOn(os, 'release').mockReturnValue('10.0.26100')
  vi.spyOn(fs, 'access').mockResolvedValue(undefined)
  const bridge = vi.spyOn(native, 'windowsBridgeExecutable').mockResolvedValue('bridge.exe')
  vi.spyOn(native, 'windowsTerminalExecutable').mockResolvedValue('terminal.exe')
  const windows = vi
    .spyOn(windowsProbes, 'probeWindowsCommands')
    .mockResolvedValue({ kind: 'unsatisfied', missing: ['job-round-trip'] })
  const linux = vi.spyOn(probes, 'probeCommandPrerequisites')
  const pty = vi.spyOn(probes, 'probeTerminalPrerequisites')
  expect(await host('win32').execution.prerequisites()).toEqual(['satisfied', 'unsatisfied'])
  expect(bridge).toHaveBeenCalledOnce()
  expect(windows).toHaveBeenCalledOnce()
  expect(linux).not.toHaveBeenCalled()
  expect(pty).not.toHaveBeenCalled()
})

it('preserves missing and unknown Windows prerequisites', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  vi.spyOn(os, 'release').mockReturnValue('10.0.26100')
  const access = vi
    .spyOn(fs, 'access')
    .mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }))
  expect(await probeWindowsExecution()).toBe('unsatisfied')
  access.mockRejectedValue(Object.assign(new Error('unreadable'), { code: 'EACCES' }))
  expect(await probeWindowsExecution()).toBe('unknown')
  access.mockResolvedValue(undefined)
  vi.spyOn(native, 'windowsBridgeExecutable').mockRejectedValue(new Error('compile failed'))
  vi.spyOn(native, 'windowsTerminalExecutable').mockResolvedValue('terminal.exe')
  expect(await probeWindowsExecution()).toBe('unknown')
})

it('keeps Linux probes and does not compile Windows helpers', async () => {
  const linux = vi
    .spyOn(probes, 'createPrerequisiteProbe')
    .mockReturnValue({ facts: () => 'unknown', ready: async () => ({ kind: 'unknown' }) })
  const pty = vi.spyOn(probes, 'probeTerminalPrerequisites').mockResolvedValue(['node-pty'])
  const bridge = vi.spyOn(native, 'windowsBridgeExecutable')
  expect(await host('linux').execution.prerequisites()).toEqual([
    'unknown',
    'unknown',
    'unsatisfied',
  ])
  expect(linux).toHaveBeenCalledTimes(2)
  expect(pty).toHaveBeenCalledOnce()
  expect(bridge).not.toHaveBeenCalled()
})

it('owns one capacity per domain and keeps unresolved reservations in the bound', () => {
  const { domain } = host('win32')
  const capacity = domain.windowsCapacity()
  expect(domain.windowsCapacity()).toBe(capacity)
  const release = Array.from({ length: 64 }, () => capacity.terminal())
  expect(release.every(item => item !== undefined)).toBe(true)
  expect(domain.windowsCapacity().terminal()).toBeUndefined()
  release[0]?.()
  expect(domain.windowsCapacity().terminal()).toBeTypeOf('function')
})
