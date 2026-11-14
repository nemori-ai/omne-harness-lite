import type { PendingCall, ToolCallLiveness } from '@omne-harness/tool'
import type { DurableEvidence, Reply, ToolInstanceId } from '@omne-harness/tool-contract'
import type { CallAccess, ToolRecovery } from '@omne-harness/tool-contract/provider'
import { owesWork } from './call-dormancy.ts'

export type LostContact = (instance: string) => DurableEvidence | null

const POSSIBLY_LIVE: ReadonlySet<string> = new Set(['starting', 'live', 'unknown'])

export function startedElsewhere(
  recovery: Pick<ToolRecovery, 'start' | 'execution' | 'state'>,
  instance: ToolInstanceId | null,
): ToolInstanceId | null {
  const owner = recovery.start?.execution.instance ?? recovery.execution?.instance
  return owner !== undefined &&
    owner !== instance &&
    POSSIBLY_LIVE.has(recovery.state.execution.kind)
    ? owner
    : null
}

export type CallAttachment = Readonly<{
  instance(): ToolInstanceId | null
  settings: Readonly<{
    lostContact?: LostContact
    resolveAccess(call: PendingCall): Reply<CallAccess<unknown>>
  }>
  dependencies: Readonly<{
    commands: Readonly<{ loadRecovery(access: CallAccess<unknown>): Reply<ToolRecovery> }>
    instances: Readonly<{ schedule(call: PendingCall): Promise<unknown> }>
  }>
}>

export async function attachCall(
  { instance, settings, dependencies }: CallAttachment,
  remember: (call: PendingCall) => boolean,
  call: PendingCall,
): Promise<boolean> {
  const access = await settings.resolveAccess(call)
  if ('failure' in access) return false
  const recovery = await dependencies.commands.loadRecovery(access.ok)
  if ('failure' in recovery) return false
  if (recovery.ok.state.phase === 'settled' && !owesWork(recovery.ok)) return false
  const owner = startedElsewhere(recovery.ok, instance())
  if (owner !== null && (settings.lostContact?.(owner) ?? null) === null) return false
  if (!remember(call)) return false
  void dependencies.instances.schedule(call).catch(() => undefined)
  return true
}

export type ExecutorCalls = Readonly<{
  live(): boolean
  remember(call: PendingCall, purpose?: 'execute' | 'body-recovery'): boolean
  rejectAdmission(call: PendingCall): void
  knows(call: PendingCall): boolean
  attach(call: PendingCall): Promise<boolean>
}>

export type CallAdmission = Readonly<{
  admit(call: PendingCall | null, purpose?: 'execute' | 'body-recovery'): boolean
  rejectAdmission(call: PendingCall): void
  knows(call: PendingCall): boolean
  liveness: ToolCallLiveness
}>

export function executorCalls({
  executor,
  retired,
}: Readonly<{ executor(): ExecutorCalls | null; retired(): boolean }>): CallAdmission {
  return {
    admit(call, purpose) {
      const current = executor()
      if (retired() || current === null) return false
      return call === null ? current.live() : current.remember(call, purpose)
    },
    rejectAdmission: call => executor()?.rejectAdmission(call),
    knows: call => executor()?.knows(call) ?? false,
    liveness: {
      holds: call => executor()?.knows(call) ?? false,
      attach: async call => !retired() && ((await executor()?.attach(call)) ?? false),
    },
  }
}
