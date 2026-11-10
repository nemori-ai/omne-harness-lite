import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionEvidenceCommand,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'
import { canonicalText } from '@omne-harness/server-entry/cordis'
import {
  modesInitialization,
  modesPreparationRecord,
  type ModesPreparationRecord,
} from '../../assembly/session-modes-initialization.ts'
import { sessionModesInstallationKey } from '../session-ad03/modes.ts'

type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

export async function prepareInitialModes<P>(
  ctx: Context,
  command: Create,
  access: SessionAccess<P> | undefined,
): Promise<Outcome<ModesPreparationRecord | undefined, SessionFailure>> {
  if (!command.input.creation.initialization?.sources.length) return succeed(undefined)
  const unavailable = () =>
    fail({
      kind: 'unavailable' as const,
      owner: 'session.modes',
      diagnostic: 'initial modes preparation is not available',
    })
  if (access === undefined) return unavailable()
  const installation = ctx.get(sessionModesInstallationKey)
  if (installation === undefined) return unavailable()
  const mounted = await installation.ensure(command.input.tenant)
  if (mounted.kind !== 'ready') return unavailable()
  const input = { ...command.input, principal: access.principal }
  const expected = modesInitialization(input)
  const prepared = await installation.prepareInitial(input)
  if ('failure' in prepared) return prepared
  const actual = modesPreparationRecord(input, {
    coverage: prepared.ok.judged.coverage,
    currentRevision: prepared.ok.currentRevision,
  })
  if (canonicalText(actual) !== canonicalText(expected.preparation)) return unavailable()
  return succeed(actual)
}
