import { judgeMessage } from '@omne-harness-lite/messages'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { checkSession } from '@omne-harness-lite/session-log'
import type { CliCatalog } from './catalog.ts'
import type { EntryCommand } from './entry-command.ts'
import { InputFailure } from './diagnostic.ts'
import { readInputFile } from './input.ts'
import { usingSelectedTenant } from './selected-tenant-work.ts'
import type { PreparedFactory } from './prepared-client-work.ts'
import { submitSessionMessage, type SessionMessagePolicy } from './session-message-client.ts'
import type { EntryExecution } from './entry-application.ts'

/** Existing-session machine entry. The host owns new Run admission and all execution. */
export async function runSessionMessageEntry(options: {
  readonly command: Extract<EntryCommand, { kind: 'message' | 'session' }>
  readonly home: string
  readonly catalog: CliCatalog
  readonly signal: AbortSignal
  readonly originalId: () => string
  readonly policy: SessionMessagePolicy
  readonly maxMessageBytes: number
  readonly preparedFactory?: PreparedFactory
}): Promise<EntryExecution> {
  const command = options.command
  if (command.kind !== 'message' || command.session === null)
    return { outcome: { kind: 'not-ready', reason: 'capability-not-installed' }, diagnostics: [] }
  const session = checkSession(command.session)
  if ('failure' in session) throw new InputFailure('invalid-options')
  if (!Number.isSafeInteger(options.maxMessageBytes) || options.maxMessageBytes < 1)
    throw new TypeError('invalid message file limit')
  const text = await readInputFile(
    command.messageFile,
    options.maxMessageBytes,
    false,
    options.signal,
  )
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new InputFailure('invalid-json')
  const message = judgeMessage(parsed.ok)
  if ('rejected' in message || message.ok.type !== 'user') throw new InputFailure('invalid-json')
  const userMessage = message.ok
  return usingSelectedTenant(
    options.home,
    options.catalog,
    options.signal,
    ports =>
      submitSessionMessage({
        home: options.home,
        signal: options.signal,
        policy: options.policy,
        request: {
          format: 'omne-session-host/1',
          binding: ports.selection.selected,
          command: 'submitInput',
          session: session.ok,
          operationKey: options.originalId(),
          message: userMessage,
        },
      }),
    options.preparedFactory,
  )
}
