import { access } from 'node:fs/promises'
import { release } from 'node:os'
import { join } from 'node:path'
import type { ProviderFacts } from '@omne-harness/execution-environment-contract'
import { createHostCommands, type CommandSettings, type HostCommandsInput } from './host-command.ts'
import {
  createHostTerminals,
  retainedHostTerminalFactory,
  type TerminalSettings,
} from './host-terminal.ts'
import {
  createPrerequisiteProbe,
  probeTerminalPrerequisites,
  resolveSupervisor,
  type HostCommandPrerequisite,
} from './host-probe.ts'
import { createMacosHostCommands, type MacosPrerequisite } from './macos-execution/commands.ts'
import { sessionReader } from './macos-execution/compile.ts'
import { createDomainIndex } from './macos-execution/domain-index.ts'
import type { MacosRecovery } from './macos-execution/recovery.ts'
import { windowsBridgeExecutable, windowsTerminalExecutable } from './windows-execution/compile.ts'
import { createWindowsHostCommands } from './windows-execution/index.ts'
import {
  createWindowsHostTerminals,
  createWindowsRetainedTerminalFactory,
  type WindowsTerminalCapacity,
} from './windows-execution/terminal.ts'

type Prerequisite = ProviderFacts['prerequisites']
/** A prerequisite a command start found missing, on any platform. */
export type CommandPrerequisite = HostCommandPrerequisite | MacosPrerequisite
type CommandInput = Omit<HostCommandsInput, 'prerequisites' | 'unavailable'> &
  Readonly<{ unavailable(missing: readonly CommandPrerequisite[]): void }>
type TerminalInput = Omit<Parameters<typeof createHostTerminals>[0], 'prerequisites'>

/** Installation facts only; a successful compile does not prove a command or terminal run. */
export async function probeWindowsExecution(): Promise<Prerequisite> {
  if (process.platform !== 'win32') return 'unsatisfied'
  const [major, , build] = release().split('.').map(Number)
  if (major === undefined || build === undefined || !Number.isFinite(build)) return 'unknown'
  if (major < 10 || (major === 10 && build < 17763)) return 'unsatisfied'
  const root = process.env['SystemRoot'] ?? 'C:\\Windows'
  try {
    await access(join(root, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'))
    await access(
      join(
        root,
        'Microsoft.NET',
        'assembly',
        'GAC_MSIL',
        'System.Management.Automation',
        'v4.0_3.0.0.0__31bf3856ad364e35',
        'System.Management.Automation.dll',
      ),
    )
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? 'unsatisfied'
      : 'unknown'
  }
  try {
    await Promise.all([windowsBridgeExecutable(), windowsTerminalExecutable()])
    return 'satisfied'
  } catch {
    return 'unknown'
  }
}

/** Selects existing backends without transferring platform facts between them. */
export function createHostPlatform(input: {
  settings: CommandSettings
  terminal: TerminalSettings
  windowsCapacity(): WindowsTerminalCapacity
  stateDirectory?: string | undefined
}) {
  if (process.platform === 'darwin') {
    const macos: MacosRecovery = {
      domains:
        input.stateDirectory === undefined ? undefined : createDomainIndex(input.stateDirectory),
      reader: sessionReader,
      stopBoundMs: input.settings.stopBoundMs,
    }
    const terminalProbe = createPrerequisiteProbe({
      retryMs: input.terminal.probeRetryMs,
      boundMs: input.terminal.stopBoundMs,
    })
    return {
      macos,
      async prerequisites(): Promise<readonly Prerequisite[]> {
        const reading = await sessionReader()
        return [reading.kind === 'ready' ? 'satisfied' : 'unsatisfied', 'unsatisfied']
      },
      commands: (options: CommandInput) =>
        createMacosHostCommands({ ...options, reader: sessionReader, domains: macos.domains }),
      terminals(options: TerminalInput) {
        const shared = { ...options, prerequisites: terminalProbe }
        return {
          ordinary: createHostTerminals(shared),
          reserve: retainedHostTerminalFactory(shared),
        }
      },
      supervisor: async () => undefined,
    }
  }
  if (process.platform === 'win32') {
    return {
      prerequisites: async (): Promise<readonly Prerequisite[]> => [await probeWindowsExecution()],
      commands: (options: CommandInput) => createWindowsHostCommands(options),
      terminals(options: TerminalInput) {
        const shared = { ...options, capacity: input.windowsCapacity() }
        return {
          ordinary: createWindowsHostTerminals(shared),
          reserve: createWindowsRetainedTerminalFactory(shared),
        }
      },
      supervisor: async () => undefined,
      macos: undefined,
    }
  }
  const probe = createPrerequisiteProbe({
    retryMs: input.settings.probeRetryMs,
    boundMs: input.settings.stopBoundMs,
  })
  const terminalProbe = createPrerequisiteProbe({
    retryMs: input.terminal.probeRetryMs,
    boundMs: input.terminal.stopBoundMs,
  })
  return {
    async prerequisites(): Promise<readonly Prerequisite[]> {
      // describe() must return the current state, which means waiting for the probe to settle so a
      // recovered user manager is visible without needing a full generation restart.
      const [commandReading, terminalReading, terminalMissing] = await Promise.all([
        probe.ready(),
        terminalProbe.ready(),
        probeTerminalPrerequisites(),
      ])
      return [
        commandReading.kind,
        terminalReading.kind,
        terminalMissing.length === 0 ? 'satisfied' : 'unsatisfied',
      ]
    },
    commands: (options: CommandInput) => createHostCommands({ ...options, prerequisites: probe }),
    terminals(options: TerminalInput) {
      const shared = { ...options, prerequisites: terminalProbe }
      return { ordinary: createHostTerminals(shared), reserve: retainedHostTerminalFactory(shared) }
    },
    async supervisor() {
      const reading = await probe.ready()
      return reading.kind === 'satisfied'
        ? reading.tools
        : resolveSupervisor(input.settings.stopBoundMs)
    },
    macos: undefined,
  }
}
