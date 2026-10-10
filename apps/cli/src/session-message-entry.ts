import { judgeMessage, type UserMessage, type SessionRef } from '@omne-harness-lite/messages'
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
import { createSessionForMessage } from './session-creation-client.ts'

/** Machine message entry. The host owns creation, new Run admission and execution. */
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
  if (command.kind !== 'message')
    return { outcome: { kind: 'not-ready', reason: 'capability-not-installed' }, diagnostics: [] }
  const existing = selectedSession(command.session)
  const userMessage = await readUserMessage(
    command.messageFile,
    options.maxMessageBytes,
    options.signal,
  )
  return usingSelectedTenant(
    options.home,
    options.catalog,
    options.signal,
    async ports => {
      let session = existing
      if (session === null) {
        const created = await createSessionForMessage({
          home: options.home,
          binding: ports.selection.selected,
          signal: options.signal,
          policy: {
            timeoutMs: options.policy.timeoutMs,
            maxResponseBytes: options.policy.maxResponseBytes,
          },
          originalId: options.originalId,
          workspace: process.cwd(),
        })
        if (created.kind !== 'created-session') return created
        session = created.session
      }
      return submitSessionMessage({
        home: options.home,
        signal: options.signal,
        policy: options.policy,
        request: {
          format: 'omne-session-host/1',
          binding: ports.selection.selected,
          command: 'submitInput',
          session,
          operationKey: options.originalId(),
          message: userMessage,
        },
      })
    },
    options.preparedFactory,
  )
}
function selectedSession(value: string | null): SessionRef | null {
  if (value === null) return null
  const checked = checkSession(value)
  if ('failure' in checked) throw new InputFailure('invalid-options')
  return checked.ok
}
async function readUserMessage(
  path: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<UserMessage> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new TypeError('invalid message file limit')
  const text = await readInputFile(path, maxBytes, false, signal)
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new InputFailure('invalid-json')
  const message = judgeMessage(parsed.ok)
  if ('rejected' in message || message.ok.type !== 'user') throw new InputFailure('invalid-json')
  return message.ok
}
