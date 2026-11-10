import { access } from 'node:fs/promises'
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
import { readBootIdNow } from './macos-execution/session.ts'
import { macosTerminalAdmission, macosTerminalPlatform } from './macos-execution/terminals.ts'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { windowsBridgeExecutable, windowsTerminalExecutable } from './windows-execution/compile.ts'
import { createWindowsHostCommands } from './windows-execution/index.ts'
import { windowsRetainedSupervision } from './windows-execution/supervision.ts'
import { createWindowsJobIndex } from './windows-execution/recovery.ts'
import type { RetainedSupervision } from './host-retained-processes.ts'
import { forceStopScope, readBootId, readScopeMembers } from './host-scope.ts'
import {
  probeWindowsCommands,
  supportedWindowsVersion,
  type WindowsPrerequisite,
} from './windows-execution/prerequisites.ts'
import {
  bundledConpty,
  createWindowsHostTerminals,
  createWindowsRetainedTerminalFactory,
  missingConptyFiles,
  type WindowsTerminalCapacity,
  type WindowsTerminalPrerequisite,
} from './windows-execution/terminal.ts'

type Prerequisite = ProviderFacts['prerequisites']
/** A prerequisite a command start found missing, on any platform; on Windows also a terminal's file. */
export type CommandPrerequisite =
  | HostCommandPrerequisite
  | MacosPrerequisite
  | WindowsPrerequisite
  | WindowsTerminalPrerequisite
type CommandInput = Omit<HostCommandsInput, 'prerequisites' | 'unavailable'> &
  Readonly<{ unavailable(missing: readonly CommandPrerequisite[]): void }>
type TerminalInput = Omit<Parameters<typeof createHostTerminals>[0], 'prerequisites' | 'platform'>
/** Windows terminals also report the ConPTY files they cannot read. */
type WindowsTerminalInput = Omit<TerminalInput, 'unavailable'> &
  Readonly<{ unavailable(missing: readonly CommandPrerequisite[]): void }>

/** Installation facts only; a successful compile does not prove a command or terminal run. */
export async function probeWindowsExecution(): Promise<Prerequisite> {
  const version = supportedWindowsVersion()
  if (version === undefined) return 'unknown'
  if (!version) return 'unsatisfied'
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
  if ((await missingConptyFiles(bundledConpty())).length > 0) return 'unsatisfied'
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
    const terminalPlatform = (scope: ScopeRef) =>
      macosTerminalPlatform({
        scope,
        stopBoundMs: input.terminal.stopBoundMs,
        startBoundMs: input.terminal.startBoundMs,
        reader: sessionReader,
        domains: macos.domains,
      })
    return {
      macos,
      async prerequisites(): Promise<readonly Prerequisite[]> {
        const [reading, terminal] = await Promise.all([
          sessionReader(),
          macosTerminalAdmission(sessionReader),
        ])
        return [
          reading.kind === 'ready' ? 'satisfied' : 'unsatisfied',
          'reader' in terminal ? 'satisfied' : 'unsatisfied',
        ]
      },
      commands: (options: CommandInput) =>
        createMacosHostCommands({ ...options, reader: sessionReader, domains: macos.domains }),
      terminals(options: TerminalInput) {
        // The Linux probe stays unread: the platform below admits macOS terminals.
        const shared = { ...options, prerequisites: terminalProbe }
        return {
          ordinary: createHostTerminals({ ...shared, platform: terminalPlatform(options.scope) }),
          reserve: retainedHostTerminalFactory({
            ...shared,
            platform: terminalPlatform,
            bootIdNow: readBootIdNow,
          }),
        }
      },
      supervisor: async () => undefined,
      retainedSupervision: async () => undefined,
      windows: undefined,
    }
  }
  if (process.platform === 'win32') {
    const windowsJobs =
      input.stateDirectory === undefined ? undefined : createWindowsJobIndex(input.stateDirectory)
    const probe = createPrerequisiteProbe({
      retryMs: input.settings.probeRetryMs,
      boundMs: input.settings.stopBoundMs,
      probe: probeWindowsCommands,
    })
    return {
      prerequisites: async (): Promise<readonly Prerequisite[]> => {
        const [installation, commands] = await Promise.all([probeWindowsExecution(), probe.ready()])
        return [installation, commands.kind]
      },
      commands: (options: CommandInput) =>
        createWindowsHostCommands({ ...options, prerequisites: probe, jobs: windowsJobs }),
      /** The cold index of command Jobs; absent without a state directory. */
      windows: { jobs: windowsJobs },
      terminals(options: WindowsTerminalInput) {
        const shared = { ...options, capacity: input.windowsCapacity() }
        return {
          ordinary: createWindowsHostTerminals(shared),
          reserve: createWindowsRetainedTerminalFactory(shared),
        }
      },
      supervisor: async () => undefined,
      /** Jobs are read and stopped by their names once the command prerequisites hold. */
      async retainedSupervision(): Promise<RetainedSupervision | undefined> {
        const reading = await probe.ready()
        return reading.kind === 'satisfied'
          ? windowsRetainedSupervision(input.settings.stopBoundMs)
          : undefined
      },
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
  const supervisor = async () => {
    const reading = await probe.ready()
    return reading.kind === 'satisfied'
      ? reading.tools
      : resolveSupervisor(input.settings.stopBoundMs)
  }
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
    supervisor,
    /** The scope units are read and stopped through the supervisor the probe resolved. */
    async retainedSupervision(): Promise<RetainedSupervision | undefined> {
      const tools = await supervisor()
      if (tools === undefined) return undefined
      const boundMs = input.settings.stopBoundMs
      return {
        bootId: readBootId,
        members: ({ unit, directory }) => readScopeMembers({ tools, unit, directory, boundMs }),
        stop: coordinate => forceStopScope({ tools, coordinate, boundMs }),
      }
    },
    windows: undefined,
    macos: undefined,
  }
}
