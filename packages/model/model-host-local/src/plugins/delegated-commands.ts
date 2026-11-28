import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'

// A Service may keep its methods on its prototype, so the object is not spread:
// every method is called on `commands`.
export function delegatedCommands(commands: ModelCommands<unknown>): ModelCommands<unknown> {
  return {
    admit: input => commands.admit(input),
    recall: input => commands.recall(input),
    scanPending: input => commands.scanPending(input),
    loadRecovery: input => commands.loadRecovery(input),
    loadControl: input => commands.loadControl(input),
    loadOrigin: input => commands.loadOrigin(input),
    loadRequest: input => commands.loadRequest(input),
    claim: input => commands.claim(input),
    prepareDispatch: input => commands.prepareDispatch(input),
    recordMaterialization: input => commands.recordMaterialization(input),
    recordSend: input => commands.recordSend(input),
    openReceiveWindow: input => commands.openReceiveWindow(input),
    preserve: input => commands.preserve(input),
    recordLateFact: input => commands.recordLateFact(input),
    prepareRetry: input => commands.prepareRetry(input),
    decideRetry: input => commands.decideRetry(input),
    settle: input => commands.settle(input),
    control: input => commands.control(input),
    acquireRead: input => commands.acquireRead(input),
    nextRead: input => commands.nextRead(input),
    endRead: input => commands.endRead(input),
    handoff: input => commands.handoff(input),
    abandon: input => commands.abandon(input),
    confirmAccount: input => commands.confirmAccount(input),
    advanceCleanup: input => commands.advanceCleanup(input),
    query: input => commands.query(input),
    dispatches: input => commands.dispatches(input),
  }
}

// The commands of the result push: a committed handoff or settlement, or a handoff whose commit
// is unknown, wakes the push of that call.
export function wakingCommands(
  commands: ModelCommands<unknown>,
  wake: (target: Readonly<{ tenant: TenantId; call: ModelCallId }>) => void,
  recordLateFact: ModelCommands<unknown>['recordLateFact'],
): ModelCommands<unknown> {
  return {
    ...delegatedCommands(commands),
    async handoff(handoff) {
      const result = await commands.handoff(handoff)
      if ('ok' in result || result.failure.kind === 'commit-unknown')
        wake({ tenant: handoff.tenant, call: handoff.call })
      return result
    },
    async settle(settle) {
      const result = await commands.settle(settle)
      if ('ok' in result) wake({ tenant: settle.tenant, call: settle.call })
      return result
    },
    recordLateFact,
  }
}
