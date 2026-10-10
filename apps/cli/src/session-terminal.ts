import { z } from 'zod'
import { judgeMessage, type SessionRef } from '@omne-harness-lite/messages'
import { checkSession } from '@omne-harness-lite/session-log'
import type { EntryExecution } from './entry-application.ts'
import type { GovernanceDialog } from './governance-input.ts'
import type { TenantBinding } from './state-layout.ts'
import { connectProductionSessionHost } from './session-host-launcher.ts'
import { createSessionForMessage } from './session-creation-client.ts'
import { sendSessionHostRequest } from './session-host-client.ts'
import { submitSessionMessage, type SessionMessagePolicy } from './session-message-client.ts'
import { InputFailure } from './diagnostic.ts'

export interface TerminalSessionOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly routeName: string
  readonly session: string | null
  readonly workspace: string
  readonly dialog: GovernanceDialog
  readonly signal: AbortSignal
  readonly originalId: () => string
  readonly policy: SessionMessagePolicy
}

/** The terminal only submits and observes. The independent host owns admitted work. */
export async function runTerminalSession(options: TerminalSessionOptions): Promise<EntryExecution> {
  const unavailable = await connect(options)
  if (unavailable) return blocked(unavailable)
  const session = await targetSession(options)
  if (typeof session !== 'string') return { outcome: session, diagnostics: [] }
  options.dialog.identity([
    `Center: ${options.binding.centerId}`,
    `Account: ${options.binding.tenant.account}`,
    `Organization: ${options.binding.tenant.organization}`,
    `Session: ${session}`,
    `Initial model: ${options.routeName}`,
  ])
  return interact(options, session)
}
async function interact(
  options: TerminalSessionOptions,
  session: SessionRef,
): Promise<EntryExecution> {
  while (!options.signal.aborted) {
    const text = await options.dialog.text('Message', [
      'Cancel the input to detach. Admitted work continues in the host.',
    ])
    if (text === undefined || options.signal.aborted) break
    if (!text.trim()) continue
    const message = await userMessage(options, text)
    if (!message) return blocked('host-clock-unavailable')
    const outcome = await submitSessionMessage({
      home: options.home,
      signal: options.signal,
      policy: options.policy,
      request: {
        format: 'omne-session-host/1',
        binding: options.binding,
        command: 'submitInput',
        session,
        operationKey: options.originalId(),
        message,
      },
    })
    if (outcome.status !== 'completed') return { outcome, diagnostics: [] }
    const lines = outcome.messages
      .filter(value => value.type !== 'user')
      .flatMap(value => value.blocks.map(block => block.text))
    if (!(await options.dialog.show('Assistant', lines))) break
  }
  return { outcome: { kind: 'session-detached', session }, diagnostics: [] }
}
async function targetSession(options: TerminalSessionOptions) {
  if (options.session !== null) {
    const checked = checkSession(options.session)
    if ('failure' in checked) throw new InputFailure('invalid-options')
    return checked.ok
  }
  const created = await createSessionForMessage({
    home: options.home,
    binding: options.binding,
    signal: options.signal,
    originalId: options.originalId,
    policy: transportPolicy(options),
    workspace: options.workspace,
  })
  return created.kind === 'created-session' ? created.session : created
}
async function userMessage(options: TerminalSessionOptions, text: string) {
  const read = await sendSessionHostRequest({
    home: options.home,
    signal: options.signal,
    policy: transportPolicy(options),
    request: { format: 'omne-session-host/1', binding: options.binding, command: 'readClock' },
  })
  if (read.kind !== 'reply') return undefined
  const clock = clockReading.safeParse(read.result)
  if (!clock.success) return undefined
  const message = judgeMessage({
    id: options.originalId(),
    type: 'user',
    createdAt: clock.data.timestamp,
    blocks: [
      {
        id: options.originalId(),
        kind: 'text',
        text,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in message || message.ok.type !== 'user') return undefined
  return message.ok
}
function blocked(reason: string): EntryExecution {
  return { outcome: { kind: 'blocked', reason }, diagnostics: [] }
}

function transportPolicy(options: TerminalSessionOptions) {
  return { timeoutMs: options.policy.timeoutMs, maxResponseBytes: options.policy.maxResponseBytes }
}

const initialModel = z.strictObject({
  kind: z.literal('initialModel'),
  routeName: z.string().min(1),
})
const clockReading = z.strictObject({ kind: z.literal('clock'), timestamp: z.string() })
async function connect(options: TerminalSessionOptions): Promise<string | undefined> {
  const attached = await connectProductionSessionHost(
    {
      format: 'omne-session-host-startup/1',
      home: options.home,
      binding: options.binding,
      routeName: options.routeName,
    },
    options.signal,
    {
      timeoutMs: options.policy.timeoutMs,
      maxResponseBytes: options.policy.maxResponseBytes,
      startupTimeoutMs: 30_000,
      pollIntervalMs: options.policy.pollIntervalMs,
    },
  )
  if (attached.kind !== 'connected') return attached.reason
  const model = await sendSessionHostRequest({
    home: options.home,
    signal: options.signal,
    policy: transportPolicy(options),
    request: {
      format: 'omne-session-host/1',
      binding: options.binding,
      command: 'readInitialModel',
    },
  })
  if (model.kind !== 'reply') return model.reason
  const actual = initialModel.safeParse(model.result)
  return actual.success && actual.data.routeName === options.routeName
    ? undefined
    : 'host-model-mismatch'
}
