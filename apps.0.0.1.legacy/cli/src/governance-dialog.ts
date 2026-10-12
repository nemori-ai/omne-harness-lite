import type { TerminalPort } from './tui/terminal.ts'
import type { GovernanceDialog } from './governance-input.ts'
import type { EntryExecution } from './entry-application.ts'
import type { Diagnostic } from './diagnostic.ts'
import { Dialog } from './tui/dialog.ts'
import type { PreparedPresentationGroup } from './prepared-presentation.ts'

export type TerminalFactory = () => Promise<TerminalPort>
export async function usingGovernanceDialog(
  signal: AbortSignal,
  terminal: TerminalFactory,
  work: (
    dialog: GovernanceDialog & Pick<Dialog, 'progress' | 'compose'>,
    signal: AbortSignal,
  ) => Promise<EntryExecution>,
  presentation?: PreparedPresentationGroup,
): Promise<EntryExecution> {
  if (signal.aborted)
    return { outcome: { kind: 'blocked', reason: 'input-cancelled' }, diagnostics: [] }
  const port = await terminal()
  const controller = new AbortController()
  const stopped = AbortSignal.any([signal, controller.signal])
  const dialog = new Dialog(port, () => controller.abort())
  const stop = () => {
    void dialog.stop().catch(() => undefined)
  }
  stopped.addEventListener('abort', stop)
  if (stopped.aborted) stop()
  let result: EntryExecution | undefined,
    failed = false,
    failure: unknown
  try {
    result = await work(dialog, stopped)
  } catch (error) {
    failed = true
    failure = error
  }
  const cleanup = await closeDialog(dialog, port, presentation)
  stopped.removeEventListener('abort', stop)
  if (failed) {
    if (cleanup.failures.length)
      throw new AggregateError(
        [failure, ...cleanup.failures],
        'command work and terminal close failed',
      )
    throw failure
  }
  return { ...result!, diagnostics: [...result!.diagnostics, ...cleanup.diagnostics] }
}

async function closeDialog(
  dialog: Dialog,
  port: TerminalPort,
  presentation?: PreparedPresentationGroup,
): Promise<{
  diagnostics: Diagnostic[]
  failures: unknown[]
}> {
  const diagnostics: Diagnostic[] = [],
    failures: unknown[] = []
  try {
    await dialog.stop()
  } catch (error) {
    // A failed input drain does not authorize restoring the terminal.
    return { diagnostics: ['input-restore-failed'], failures: [error] }
  }
  if (dialog.inputFailed) diagnostics.push('input-unavailable')
  if (dialog.outputFailed) diagnostics.push('output-failed')
  if (presentation && !presentation.isQuiescent)
    return {
      diagnostics: [...diagnostics, 'client-close-failed'],
      failures: [new Error('original clients not quiescent')],
    }
  try {
    await port.restore()
  } catch (error) {
    diagnostics.push('input-restore-failed')
    failures.push(error)
  }
  if (presentation) {
    const release = await presentation.release()
    diagnostics.push(...release.diagnostics)
    failures.push(...release.failures)
  }
  return { diagnostics, failures }
}
