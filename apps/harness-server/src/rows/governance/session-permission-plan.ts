import type { FactCommandV2 } from '@omne-harness/sql-contract'
import {
  governanceDefinitionProjectionCommand,
  type GovernanceExternalWriteOptions,
} from '@omne-harness/governance-local'
import type { SessionPermissionWriteContext } from './session-permission-commit.ts'
import { sessionPermissionResolvedQualificationSchema } from './session-permission-discovery.ts'
import {
  sessionPermissionBasisIdentity,
  sessionPermissionBasisConfigurationSchema,
} from './session-permission-basis.ts'
import { SESSION_PERMISSION_RESULT } from './session-permission-result.ts'
import { targetSnapshotCommands } from './target-snapshot.ts'

type Plan = GovernanceExternalWriteOptions<SessionPermissionWriteContext>['plan']
type Mode = 'clear' | 'unmapped' | 'mapped'
type Registration = Readonly<{
  combination: ReturnType<Plan>['combination']
  requiredConstraintIds: readonly string[]
}>
export function createSessionPermissionWritePlan(
  registrations: Readonly<Record<Mode, Registration>>,
): Plan {
  const fixed = structuredClone(registrations)
  const participant = (mode: Mode) =>
    sessionPermissionBasisIdentity(
      sessionPermissionBasisConfigurationSchema.parse({
        mode,
        requiredConstraintIds: fixed[mode].requiredConstraintIds,
      }),
    ).participant
  const basis = {
    clear: participant('clear'),
    unmapped: participant('unmapped'),
    mapped: participant('mapped'),
  }
  return input => {
    const selected = sessionPermissionResolvedQualificationSchema.parse(
      input.command.write.qualification,
    )
    const mode = selected.kind === 'clear' ? 'clear' : selected.settings.kind
    const commands: FactCommandV2[] = [selected.original.commandFacts]
    if (selected.kind === 'set') {
      const binding = {
        scope: input.binding.ref.scope,
        epoch: input.epoch,
        principalRef: input.binding.ref.principalRef,
        captureId: input.binding.ref.operationId,
        transactionDomain: input.transactionDomain,
        definition: selected.definition,
      }
      commands.push(governanceDefinitionProjectionCommand(binding))
      if (selected.settings.kind === 'mapped')
        commands.push(
          ...targetSnapshotCommands({
            ...binding,
            mode: 'management',
            target: selected.settings.target,
          }),
        )
    }
    commands.push(
      { participant: basis[mode], facts: {} },
      { participant: SESSION_PERMISSION_RESULT.participant, facts: {} },
    )
    return { combination: fixed[mode].combination, writer: 'session', commands }
  }
}
