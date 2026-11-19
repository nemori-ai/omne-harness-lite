import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionEvidenceCommand,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'
import { canonicalText } from '../agent-adoptions/definition-mappings.ts'
import {
  contextInitialization,
  contextPreparationRecord,
  type ContextPreparationRecord,
} from '../../assembly/session-context-initialization.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'

type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

/** Each initial block as Runtime Context judges it now; any that differs from the plan stops the creation. */
export async function prepareInitialContext<P>(
  ctx: Context,
  command: Create,
  access: SessionAccess<P> | undefined,
): Promise<Outcome<readonly ContextPreparationRecord[] | undefined, SessionFailure>> {
  if (!command.input.creation.initialization?.sources.length) return succeed(undefined)
  const unavailable = () =>
    fail({
      kind: 'unavailable' as const,
      owner: 'session.context',
      diagnostic: 'initial context preparation is not available',
    })
  if (access === undefined) return unavailable()
  const installation = ctx.get(sessionModesInstallationKey)
  if (installation === undefined) return unavailable()
  const mounted = await installation.ensure(command.input.tenant)
  if (mounted.kind !== 'ready') return unavailable()
  const input = { ...command.input, principal: access.principal }
  const records: ContextPreparationRecord[] = []
  for (const { block, preparation } of contextInitialization(input).blocks) {
    const prepared = await installation.prepareInitial(input, block)
    if ('failure' in prepared) return prepared
    const actual = contextPreparationRecord(block, input, {
      coverage: prepared.ok.judged.coverage,
      currentRevision: prepared.ok.currentRevision,
    })
    if (canonicalText(actual) !== canonicalText(preparation)) return unavailable()
    records.push(actual)
  }
  return succeed(records)
}
