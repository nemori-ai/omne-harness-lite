import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  openClientLocalState,
  ClientStateOpenFailure,
  type ClientLocalStateInstance,
} from '@omne-harness-lite/client-local-state'
import {
  createGovernanceClient,
  exitStatus,
  type GovernanceClientOperations,
  type ActionReport,
} from '@omne-harness-lite/governance-client-operations'
import { diagnosticText, InputFailure, type Diagnostic } from './diagnostic.ts'
import { buildIntent, readSecrets } from './input.ts'
import { commands, parseInvocation, type Invocation } from './parser.ts'
import { previewText, reportText, unopened } from './presentation.ts'
import { validIntent, validReport } from './validation.ts'
import { versionText } from './version.ts'

/** Internal test seam; the executable fixes these providers and exposes no fault switches. */
export interface CliRuntime {
  readonly version: typeof versionText
  readonly stdoutIsTTY: boolean
  readonly home: string
  readonly signal: AbortSignal
  readonly stdout: (text: string) => Promise<void>
  readonly stderr: (text: string) => Promise<void>
  readonly openState: typeof openClientLocalState
  readonly createClient: typeof createGovernanceClient
  readonly intent: typeof buildIntent
  readonly secrets: typeof readSecrets
}
export function providers(): Pick<
  CliRuntime,
  'home' | 'openState' | 'createClient' | 'intent' | 'secrets' | 'version'
> {
  return {
    home: homedir(),
    version: versionText,
    openState: openClientLocalState,
    createClient: createGovernanceClient,
    intent: buildIntent,
    secrets: readSecrets,
  }
}
export async function runCli(args: readonly string[], runtime: CliRuntime): Promise<number> {
  const invocation = parseInvocation(args)
  let applicationFailed = false
  const entry = {
    machine: invocation.machine,
    ...(invocation.kind === 'help' || invocation.kind === 'version' || !invocation.command
      ? {}
      : { command: invocation.command.command }),
  }
  const diagnose = async (code: Diagnostic) => {
    try {
      await runtime.stderr(diagnosticText(code, entry))
    } catch {
      applicationFailed = true
    }
  }
  const emit = async (report: ActionReport): Promise<number> => {
    if (!validReport(report)) {
      await diagnose('internal-defect')
      return 70
    }
    try {
      await runtime.stdout(reportText(report, invocation.machine))
    } catch {
      await diagnose('output-failed')
      return 70
    }
    return applicationFailed ? 70 : exitStatus(report)
  }
  if (invocation.kind === 'help' || invocation.kind === 'version') {
    let version: string | undefined
    if (invocation.kind === 'version') {
      try {
        version = await runtime.version()
      } catch {
        await diagnose('internal-defect')
        return 70
      }
    }
    try {
      await runtime.stdout(
        invocation.kind === 'version'
          ? version!
          : `Usage: omne [machine] <command> [options]\n${commands.map(c => `  ${c.command.join(' ')}  ${c.allowedOptions.map(o => `--${o}`).join(' ')}`).join('\n')}\nCredentials require protected files. The entire UTF-8 file is the credential, including any final newline; nothing is trimmed. Keep the same contents for later login. Run omne tui --help for the supported interactive governance entry.\nUse machine for redirected output. Human governance commands require a terminal.\n`,
      )
      return 0
    } catch {
      await diagnose('output-failed')
      return 70
    }
  }
  if (!invocation.machine && !runtime.stdoutIsTTY) {
    await diagnose('tty-required')
    return applicationFailed ? 70 : 2
  }
  if (invocation.kind === 'error') {
    await diagnose(invocation.diagnostic)
    return emit(unopened(invocation.command, 'invalid-input'))
  }
  let state: ClientLocalStateInstance | undefined, client: GovernanceClientOperations | undefined
  let report: ActionReport | undefined,
    admitted = false
  let closing: Promise<void> | undefined
  const requestClose = () => {
    if (client !== undefined && closing === undefined) {
      // Observe rejection now; the ordinary owner below still awaits the same result.
      try {
        closing = client.close()
      } catch {
        closing = Promise.reject(new Error('client-close-failed'))
      }
      void closing.catch(() => {})
    }
  }
  runtime.signal.addEventListener('abort', requestClose)
  try {
    const intent = await runtime.intent(invocation, runtime.signal)
    if (!validIntent(intent)) throw new InputFailure('invalid-options')
    if (runtime.signal.aborted) throw new InputFailure('input-cancelled')
    const directory =
      invocation.values['state-dir'] ??
      (isAbsolute(runtime.home) ? join(runtime.home, '.omne-harness-lite') : undefined)
    if (typeof directory !== 'string' || !isAbsolute(directory))
      throw new InputFailure('invalid-options')
    state = await runtime.openState({ directory })
    if (runtime.signal.aborted) throw new InputFailure('input-cancelled')
    client = runtime.createClient({ state })
    admitted = true
    report = await client.runPrepared(intent, async (preview, signal) => {
      if (!invocation.machine) {
        try {
          await runtime.stdout(previewText(preview))
        } catch {
          await diagnose('output-failed')
          throw new Error('input output failed')
        }
      }
      try {
        return await runtime.secrets(invocation, signal)
      } catch (error) {
        if (error instanceof InputFailure) {
          await diagnose(error.code)
          return { kind: 'cancelled' }
        }
        await diagnose('input-restore-failed')
        throw new Error('input failure')
      }
    })
  } catch (error) {
    if (admitted) {
      applicationFailed = true
      await diagnose('internal-defect')
    } else if (error instanceof InputFailure) {
      await diagnose(error.code)
      report = unopened(invocation.command, 'invalid-input')
    } else if (error instanceof ClientStateOpenFailure) {
      const reason =
        error.reason === 'unavailable'
          ? 'local-unavailable'
          : error.reason === 'invalid-record' || error.reason === 'unsupported-format'
            ? error.reason
            : 'invalid-input'
      await diagnose(error.reason === 'unavailable' ? 'state-unavailable' : 'state-invalid')
      report = unopened(invocation.command, reason)
    } else {
      await diagnose('internal-defect')
      report = unopened(invocation.command, 'defect', true)
    }
  } finally {
    let quiet = client === undefined
    if (client !== undefined) {
      requestClose()
      try {
        await closing
        quiet = true
      } catch {
        applicationFailed = true
        await diagnose('client-close-failed')
      }
    }
    if (state !== undefined && quiet) {
      try {
        await state.close()
      } catch {
        applicationFailed = true
        await diagnose('state-close-failed')
      }
    }
    runtime.signal.removeEventListener('abort', requestClose)
  }
  return report === undefined ? 70 : emit(report)
}
