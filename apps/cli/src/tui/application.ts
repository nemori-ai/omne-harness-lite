import { isAbsolute, join } from 'node:path'
import {
  assemblyCloseDiagnostics,
  ClientAssemblyStateFailure,
  ClientAssemblyStopped,
  type ClientAssembly,
} from '../client-assembly.ts'
import {
  exitStatus,
  type ActionReport,
  type ActionPreview,
  type GovernanceClientOperations,
  type GovernanceUse,
  type Origin,
} from '@omne-harness-lite/governance-client-operations'
import type { CliRuntime } from '../application.ts'
import { diagnosticText, InputFailure, type Diagnostic } from '../diagnostic.ts'
import { commands } from '../parser.ts'
import { reportText } from '../presentation.ts'
import { validReport } from '../validation.ts'
import { Dialog } from './dialog.ts'
import {
  forms,
  prepareForm,
  formSecrets,
  type Form,
  type Tenant,
  type PreparedForm,
  type Field,
} from './forms.ts'
import type { TerminalPort } from './terminal.ts'

interface Options {
  readonly directory: string
  readonly profile: string
  readonly setup: boolean
}
export function tuiOptions(args: readonly string[], home: string): Options | 'help' {
  if (args.length === 2 && args[0] === 'tui' && args[1] === '--help') return 'help'
  if (args[0] !== 'tui') throw new InputFailure('invalid-options')
  const values = tuiOptionValues(args)
  const directory =
    values.get('--state-dir') ?? (isAbsolute(home) ? join(home, '.omne-harness-lite') : '')
  const profile = values.get('--terminal-profile')
  if (typeof directory !== 'string' || !isAbsolute(directory) || typeof profile !== 'string')
    throw new InputFailure('invalid-options')
  return { directory, profile, setup: values.has('--setup') }
}
function tuiOptionValues(args: readonly string[]): Map<string, string | true> {
  const values = new Map<string, string | true>()
  for (let at = 1; at < args.length; at++) {
    const name = args[at]
    if (!name || values.has(name)) throw new InputFailure('invalid-options')
    if (name === '--setup') values.set(name, true)
    else if (name === '--state-dir' || name === '--terminal-profile') {
      const value = args[++at]
      if (value === undefined || value.startsWith('--')) throw new InputFailure('invalid-options')
      values.set(name, value)
    } else throw new InputFailure('invalid-options')
  }
  return values
}
export interface TuiRuntime extends Pick<
  CliRuntime,
  'home' | 'signal' | 'createAssembly' | 'stdout' | 'stderr'
> {
  readonly terminal: (profile: string) => Promise<TerminalPort>
}
/** Both screen codes mean this terminal cannot carry the full-screen interface: point to machine. */
function tuiDiagnosticText(code: Diagnostic): string {
  return diagnosticText(
    code,
    code === 'tty-required' || code === 'tty-unsupported' ? {} : undefined,
  )
}
function pretty(value: unknown): string[] {
  return JSON.stringify(value, null, 2).split('\n')
}
function isTenant(value: unknown): value is Tenant {
  return (
    value !== null &&
    typeof value === 'object' &&
    'account' in value &&
    'organization' in value &&
    typeof value.account === 'string' &&
    typeof value.organization === 'string'
  )
}
const OG = 'capability.organization-governance/v2#S-'
function readForm(form: Form): boolean {
  return (
    form.action === 'health' || commands.some(c => c.command.join(' ') === form.id && c.refresh)
  )
}
async function collect(form: Form, dialog: Dialog): Promise<Record<string, unknown> | undefined> {
  const draft: Record<string, unknown> = {}
  for (const field of form.fields) {
    if (
      field.kind === 'current-tenant' ||
      (field.when && draft[field.when.field] !== field.when.equals)
    )
      continue
    if (!field.required) {
      const choice = await dialog.choose(field.label, [
        'Do not specify; use center default',
        'Specify a value',
      ])
      if (choice === undefined) return undefined
      if (choice === 0) continue
    }
    const value = await collectField(field, dialog)
    if (value === undefined) return undefined
    draft[field.name] = value
  }
  return draft
}
async function collectField(field: Field, dialog: Dialog): Promise<unknown> {
  if (field.kind === 'enum' || field.kind === 'boolean') {
    const options = field.kind === 'boolean' ? ['False', 'True'] : field.options
    if (!options) throw new Error('missing enum options')
    const choice = await dialog.choose(field.label, options)
    if (choice === undefined) return undefined
    return field.kind === 'boolean' ? choice === 1 : options[choice]
  } else if (field.kind === 'tenant') {
    return collectTenant(field.label, dialog)
  } else if (field.kind === 'organizations') {
    return collectOrganizations(field.label, dialog)
  } else {
    return dialog.text(
      field.label,
      field.kind === 'secret-file'
        ? ['Enter a protected file path. Do not type the credential here.']
        : field.kind === 'integer'
          ? ['Decimal integer; no exponent, fraction, or surrounding spaces.']
          : [],
    )
  }
}
async function collectTenant(label: string, dialog: Dialog): Promise<Tenant | undefined> {
  const account = await dialog.text(label + ': account ID')
  if (account === undefined) return undefined
  const organization = await dialog.text(label + ': organization ID')
  if (organization === undefined) return undefined
  return { account, organization }
}
async function collectOrganizations(label: string, dialog: Dialog): Promise<string[] | undefined> {
  const count = await dialog.choose(label, ['One organization', 'Two organizations'])
  if (count === undefined) return undefined
  const organizations: string[] = []
  for (let i = 0; i <= count; i++) {
    const id = await dialog.text(`Organization ${i + 1} ID`)
    if (id === undefined) return undefined
    organizations.push(id)
  }
  return organizations
}
function previewBody(preview: ActionPreview): string[] {
  return [
    `Center address: ${preview.endpoint}`,
    `Preview source: ${preview.source}`,
    ...pretty(preview.intent),
    ...(preview.intent.action === 'invoke' &&
    preview.intent.operation === 'capability.account-identity/v3#S-50'
      ? ['Changing this credential invalidates ALL existing logins.']
      : []),
  ]
}

export async function runTui(args: readonly string[], runtime: TuiRuntime): Promise<number> {
  let status = 0,
    failed = false,
    terminal: TerminalPort | undefined,
    dialog: Dialog | undefined
  let assembly: ClientAssembly | undefined,
    client: GovernanceClientOperations | undefined,
    use: GovernanceUse | undefined
  let closing: Promise<void> | undefined, dialogClosing: Promise<void> | undefined
  let origin: Origin = { centerId: null, accountId: null, loginStateHandle: null },
    tenant: Tenant | undefined
  let source = 'unknown',
    lastReport: ActionReport | undefined,
    lastShown = false
  const controller = new AbortController()
  const diagnostics = new Set<Diagnostic>()
  const close = () => {
    controller.abort()
    if (dialog && !dialogClosing) {
      dialogClosing = dialog.stop()
      void dialogClosing.catch(() => {})
    }
    if (assembly && !closing) {
      assembly.requestStop()
      closing = assembly.clientStopped
      void closing.catch(() => {})
    }
  }
  const identity = () =>
    dialog?.identity([
      `Center: ${origin.centerId ?? 'unknown'}`,
      `Account: ${origin.accountId ?? 'unknown'}`,
      `Organization: ${tenant?.organization ?? 'unknown / unconfirmed'}`,
      `Identity source: ${source}`,
    ])
  runtime.signal.addEventListener('abort', close)
  try {
    await (async () => {
      const options = tuiOptions(args, runtime.home)
      if (options === 'help') {
        await runtime.stdout(
          'Usage: omne tui --terminal-profile <profile> [--state-dir <absolute directory>] [--setup]\nProfiles: xterm-379 (XTerm 379, allowPasteControls=false); iterm-3.7.1beta1 (macOS only).\nRequires UTF-8, a direct exclusive TTY, ordinary keys and plain-text clipboard paste.\niTerm: no special paste, file URLs, auto-composer, broadcast, tmux, paste cancellation or keystroke passthrough; finish IME composition before pasting.\nNoSyncTurnOffBracketedPasteOnHostChange must not be true; never accept Yes/Always to disable bracketing during use.\nSetup: configure, health, register or login; one action, then reopen. Credentials come from protected files. The entire UTF-8 file, including any final newline, is used without trimming; preserve its contents for later login.\nTerminal acceptance remains incomplete; these profiles state required conditions, not environment detection. Use omne machine for redirected output.\n',
        )
        return 0
      }
      if (runtime.signal.aborted) throw new InputFailure('input-cancelled')
      terminal = await runtime.terminal(options.profile)
      dialog = new Dialog(terminal, close)
      if (controller.signal.aborted) throw new InputFailure('input-cancelled')
      assembly = runtime.createAssembly({ directory: options.directory })
      client = await assembly.ready
      if (controller.signal.aborted) throw new InputFailure('input-cancelled')
      if (!options.setup) {
        const opened = await client.openUse()
        if (controller.signal.aborted) throw new InputFailure('input-cancelled')
        if (opened.kind === 'use') {
          use = opened.use
          origin = opened.origin
        } else if (opened.kind !== 'blocked') throw new Error('invalid openUse result')
        else if (opened.reason === 'local-unavailable') {
          status = 3
          throw new InputFailure('state-unavailable')
        } else if (opened.reason === 'invalid-record' || opened.reason === 'unsupported-format')
          throw new InputFailure('state-invalid')
        else if (opened.reason !== 'not-configured' && opened.reason !== 'not-logged-in')
          throw new Error('unexpected admission')
      }
      identity()
      const activeDialog = dialog,
        activeClient = client
      const execute = async (
        form: Form,
        prepared: PreparedForm,
        userRequested: boolean,
      ): Promise<boolean> => {
        const runner = use ?? activeClient
        const report = await runner.runPrepared(prepared.intent, async (preview, signal) => {
          const cancelled = () => close()
          signal.addEventListener('abort', cancelled)
          try {
            if (signal.aborted || controller.signal.aborted) return { kind: 'cancelled' }
            // Preview is the original CG capture. Never reread CLS to paint this header.
            origin = preview.origin
            identity()
            const proceed = readForm(form)
              ? await activeDialog.show('Preview: ' + form.label, previewBody(preview), true)
              : (await activeDialog.choose(
                  'Confirm: ' + form.label,
                  ['Cancel', 'Confirm this operation'],
                  previewBody(preview),
                )) === 1
            if (!proceed || signal.aborted) return { kind: 'cancelled' }
            try {
              return await formSecrets(prepared.secretPaths, signal)
            } catch (error) {
              if (error instanceof InputFailure) {
                diagnostics.add(error.code)
                return { kind: 'cancelled' }
              }
              throw error
            }
          } finally {
            signal.removeEventListener('abort', cancelled)
          }
        })
        if (!validReport(report)) throw new Error('invalid report')
        lastReport = report
        lastShown = false
        if (userRequested) status = exitStatus(report)
        if (report.operation === OG + '36') {
          const reply = report.view.data?.reply
          tenant = reply && 'result' in reply && isTenant(reply.result) ? reply.result : undefined
          source =
            report.view.source + (report.view.acquiredAt ? ' at ' + report.view.acquiredAt : '')
        } else if (
          report.operation === OG + '37' &&
          (report.remote.status === 'success' || report.remote.status === 'unknown')
        ) {
          tenant = undefined
          source = 'unconfirmed after identity switch'
        }
        origin = report.origin
        identity()
        lastShown = await activeDialog.show(
          form.label + ` — exit status ${exitStatus(report)}`,
          pretty(report),
        )
        if (report.use !== 'active') {
          status = exitStatus(report)
          return false
        }
        return true
      }
      const read = async (id: string, payload: Record<string, unknown>) => {
        const form = forms.find(f => f.operation === OG + id)
        if (!form) throw new Error('missing initial form')
        return execute(
          form,
          {
            intent: { action: 'invoke', operation: OG + id, payload, readMode: 'refresh' },
            secretPaths: {},
          },
          false,
        )
      }
      const refresh = async () => {
        if (!(await read('36', {}))) return false
        if (!(await read('57', {}))) return false
        return !tenant || (await read('60', { expectedTenant: tenant }))
      }
      if (use && !(await refresh())) return status
      while (!controller.signal.aborted) {
        const available = forms.filter(f => f.phase === (use ? 'governance' : 'setup'))
        const choice = await dialog.choose(
          use ? 'Governance' : 'Connection and login',
          [
            'Exit',
            ...(use ? ['Refresh identity and inboxes'] : []),
            ...available.map(f => f.label),
          ],
          use
            ? ['Connection and login changes require exiting, then omne tui --setup.']
            : ['One action per setup invocation; reopen afterwards.'],
        )
        if (choice === undefined || choice === 0) break
        if (use && choice === 1) {
          if (!(await refresh())) break
          continue
        }
        const form = available[choice - (use ? 2 : 1)]
        if (!form) throw new Error('invalid menu selection')
        const draft = await collect(form, dialog)
        if (!draft) continue
        try {
          let forceRefresh = false
          if (form.action === 'invoke' && readForm(form)) {
            const mode = await dialog.choose('Read source', [
              'Prefer available copy',
              'Read from center',
            ])
            if (mode === undefined) continue
            forceRefresh = mode === 1
          }
          const prepared = await prepareForm(form, draft, tenant, forceRefresh, controller.signal)
          if (!(await execute(form, prepared, true))) break
          if (
            form.operation === OG + '37' &&
            lastReport?.remote.status === 'success' &&
            !(await read('36', {}))
          )
            break
        } catch (error) {
          if (!(error instanceof InputFailure)) throw error
          await dialog.show('Input rejected', [
            error.code,
            'No target operation was submitted by this form.',
          ])
        }
        if (!use) break
      }
    })()
    if (controller.signal.aborted && lastReport === undefined && status === 0) {
      status = 2
      diagnostics.add('input-cancelled')
    }
  } catch (error) {
    if (error instanceof ClientAssemblyStateFailure) {
      status = error.reason === 'unavailable' ? 3 : 2
      diagnostics.add(error.reason === 'unavailable' ? 'state-unavailable' : 'state-invalid')
    } else if (error instanceof ClientAssemblyStopped && controller.signal.aborted) {
      diagnostics.add('input-cancelled')
      status = 2
    } else if (error instanceof InputFailure) {
      diagnostics.add(error.code)
      status =
        error.code === 'output-failed' || error.code === 'input-restore-failed'
          ? 70
          : error.code === 'state-unavailable'
            ? 3
            : 2
    } else {
      status = 70
      diagnostics.add('internal-defect')
    }
  } finally {
    runtime.signal.removeEventListener('abort', close)
    close()
    let quiet = assembly === undefined
    try {
      await closing
      quiet = true
    } catch {
      failed = true
      diagnostics.add('client-close-failed')
    }
    try {
      await dialogClosing
    } catch {
      failed = true
      diagnostics.add('output-failed')
    }
    if (dialog?.outputFailed) {
      failed = true
      diagnostics.add('output-failed')
    }
    if (dialog?.inputFailed) {
      failed = true
      diagnostics.add('input-unavailable')
    }
    if (quiet) {
      try {
        await terminal?.restore()
      } catch {
        failed = true
        diagnostics.add('input-restore-failed')
      }
      if (assembly) {
        assembly.releasePresentation()
        try {
          const releaseDiagnostics = assemblyCloseDiagnostics(await assembly.closed)
          if (releaseDiagnostics.length) failed = true
          for (const code of releaseDiagnostics) diagnostics.add(code)
        } catch {
          failed = true
          diagnostics.add('internal-defect')
        }
      }
    }
    if (failed) status = 70
    try {
      for (const code of diagnostics) await runtime.stderr(tuiDiagnosticText(code))
      if (terminal && !dialog?.outputFailed) {
        if (lastReport && !lastShown) await runtime.stdout(reportText(lastReport, false))
        await runtime.stdout(`\r\nGovernance TUI ended. Exit status: ${status}.\n`)
      }
    } catch {
      status = 70
    }
  }
  return status
}
