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
  type ContextCreation,
  type ContextPreparationRecord,
} from '../../assembly/session-context-initialization.ts'
import {
  sessionModesInstallationKey,
  type SessionModesInstallation,
} from '../session-ad03/modes.ts'

type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>
type Planned = ReturnType<typeof contextInitialization>['blocks'][number]
export type PreparedBlock = Readonly<{
  record: ContextPreparationRecord
  outcome: Planned['outcome']
}>
const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    owner: 'session.context',
    diagnostic: 'initial context preparation is not available',
  })

async function judged(
  installation: SessionModesInstallation,
  input: ContextCreation,
  { block, preparation, outcome }: Planned,
): Promise<Outcome<PreparedBlock, SessionFailure>> {
  const prepared = await installation.prepareInitial(input, block)
  if ('failure' in prepared) return prepared
  const record = contextPreparationRecord(block, input, {
    coverage: prepared.ok.judged.coverage,
    currentRevision: prepared.ok.currentRevision,
  })
  return canonicalText(record) === canonicalText(preparation)
    ? succeed({ record, outcome })
    : unavailable()
}

/** Each initial block as Runtime Context judges it now; any that differs from the plan stops the creation. */
export async function prepareInitialContext<P>(
  ctx: Context,
  command: Create,
  access: SessionAccess<P> | undefined,
): Promise<Outcome<readonly PreparedBlock[], SessionFailure>> {
  if (!command.input.creation.initialization?.sources.length) return succeed([])
  if (access === undefined) return unavailable()
  const installation = ctx.get(sessionModesInstallationKey)
  if (installation === undefined) return unavailable()
  const mounted = await installation.ensure(command.input.tenant)
  if (mounted.kind !== 'ready') return unavailable()
  const input = { ...command.input, principal: access.principal }
  const blocks: PreparedBlock[] = []
  for (const planned of contextInitialization(input).blocks) {
    const block = await judged(installation, input, planned)
    if ('failure' in block) return block
    blocks.push(block.ok)
  }
  return succeed(blocks)
}
