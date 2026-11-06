import type { SettingsCommitResult, SettingsRebase } from '@omne-harness/settings'
import { SettingsReferenceSchema, SettingsRebaseSchema } from '@omne-harness/settings'
import type { SettingsSqlTerminalOptions } from './terminals.ts'
import { createSettingsSqlRebaser } from './rebase-provider.ts'
import { createSettingsTargetGuards, type SettingsProjectionCommands } from './catalog.ts'
import { domainSchema } from './schema.ts'
import { createSettingsSqlBackend } from './provider.ts'
import { withinBudget } from './encoding.ts'

/** Deployment owner capability; do not expose it as an ordinary tenant settings command. */
export function createSettingsMaintenance(
  input: SettingsSqlTerminalOptions & { ownerRef: string; project: SettingsProjectionCommands },
) {
  const domain = domainSchema.parse(input.domain),
    ownerRef = SettingsReferenceSchema.parse(input.ownerRef)
  const options = {
    ...input,
    domain,
    guards: createSettingsTargetGuards(input.project),
    access: {
      async authorize(
        _context: undefined,
        request: { target: { scopeRef: string; policyId: string; targetRef: string } },
      ) {
        if (domain.scope.kind !== 'tenant' || request.target.scopeRef !== domain.scope.tenant)
          return { kind: 'rejected' as const, reason: 'forbidden' as const }
        return {
          kind: 'authorized' as const,
          scope: domain.scope,
          target: request.target,
          principalRef: `maintenance/${ownerRef}`,
        }
      },
    },
  }
  const rebase = createSettingsSqlRebaser(options),
    backend = createSettingsSqlBackend(options)
  const active = new Set<Promise<SettingsCommitResult>>()
  let closing: Promise<void> | undefined
  return {
    rebase(raw: SettingsRebase): Promise<SettingsCommitResult> {
      if (closing) return Promise.resolve({ kind: 'rejected', reason: 'closing' })
      if (!withinBudget(raw)) return Promise.resolve({ kind: 'rejected', reason: 'limit_exceeded' })
      const parsed = SettingsRebaseSchema.safeParse(raw)
      if (!parsed.success) return Promise.resolve({ kind: 'rejected', reason: 'invalid_input' })
      const pending = rebase(undefined, parsed.data).catch((): SettingsCommitResult => ({
        kind: 'unknown',
        operationId: parsed.data.operationId,
      }))
      active.add(pending)
      void pending.then(() => active.delete(pending))
      return pending
    },
    getOperation: (request: Parameters<typeof backend.getOperation>[1]) =>
      closing
        ? Promise.resolve({ kind: 'rejected' as const, reason: 'closing' as const })
        : backend.getOperation(undefined, request),
    close() {
      return (closing ??= Promise.allSettled(active).then(() => backend.close()))
    },
  }
}
