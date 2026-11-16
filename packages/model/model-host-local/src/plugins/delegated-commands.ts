import type { ModelCommands } from '@omne-harness/model-contract/provider'

// A Service may keep its methods on its prototype, so the object is not spread:
// every method is called on `commands`.
export function delegatedCommands(commands: ModelCommands<unknown>): ModelCommands<unknown> {
  return {
    admit: input => commands.admit(input),
    recall: input => commands.recall(input),
    scanPending: input => commands.scanPending(input),
    loadRecovery: input => commands.loadRecovery(input),
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
    advanceCleanup: input => commands.advanceCleanup(input),
    query: input => commands.query(input),
    dispatches: input => commands.dispatches(input),
  }
}
