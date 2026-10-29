import type { GuardCommand, SessionCommand, WorkSnapshot } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  initializationFixtureFacts,
  initializationFixtureGuard,
} from '@omne-harness/session-contract/testing'

export function initializationGuards(
  command: SessionCommand,
  snapshot: WorkSnapshot | null,
): readonly GuardCommand[] {
  if (command.kind !== 'create' && command.kind !== 'completeInitialization') return []
  return [
    initializationFixtureGuard(
      initializationFixtureFacts(
        command,
        snapshot,
        command.kind === 'create' ? adoptedInitializationFixture(command) : null,
      ),
    ),
  ]
}
