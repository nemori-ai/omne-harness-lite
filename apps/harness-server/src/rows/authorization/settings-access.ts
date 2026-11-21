import type { DecisionCards, DurableEvidence } from '@omne-harness/agent-contract'
import { canonicalText, noArguments, type AdmissionInput } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { AdmissionReader } from './action-admission.ts'
import { classify } from './principals.ts'

export type SettingsAction = 'list' | 'set' | 'describe' | 'clear'

export type SettingsVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export type SettingsAdmissionInput = Readonly<{
  principal: unknown
  tenant: TenantId
  action: SettingsAction
}>

/** A session's work changes a tenant setting only on the answer a person gave on a card. */
export type CardStanding = Readonly<{
  kind: 'card-answer'
  principal: unknown
  card: DurableEvidence
  source: DurableEvidence
  option: string
}>
export type CardsReader = () => DecisionCards<unknown> | undefined

function cardStandingOf(value: unknown): CardStanding | null {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'card-answer'
    ? (value as CardStanding)
    : null
}

// Where card answers count, a session's work reads one item, and sets one on a card answer.
const WORK_ACTIONS: readonly SettingsAction[] = ['describe', 'set']

/** A login acts on every setting action; `cardAnswers` says this face also takes a session's work. */
export function settingsAdmission(
  input: SettingsAdmissionInput,
  cardAnswers = false,
): AdmissionInput | undefined {
  const standing = cardStandingOf(input.principal)
  const who = classify(standing === null ? input.principal : standing.principal)
  const tenantText = tenantCodec.encode(input.tenant)
  if (who === null || who.column === 'system' || !tenantText.ok) return undefined
  if (!tenantEquals(who.principal.tenant, input.tenant)) return undefined
  const admitted =
    who.column === 'login'
      ? standing === null
      : cardAnswers &&
        WORK_ACTIONS.includes(input.action) &&
        (input.action === 'set') === (standing !== null)
  if (!admitted) return undefined
  return {
    access: { principal: who.principal, tenant: input.tenant },
    operation: { owner: 'settings', name: `setting-${input.action}` },
    target: { owner: 'settings', kind: 'tenant-scope', key: tenantText.value },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

// The answer is read back where the card recorded it, not taken from the caller.
async function answered(
  standing: CardStanding,
  request: AdmissionInput,
  cards: DecisionCards<unknown> | undefined,
): Promise<SettingsVerdict> {
  if (cards === undefined) return { kind: 'unavailable' }
  const read = await cards.read({ ...request.access, card: standing.card })
  if ('failure' in read) return { kind: 'unavailable' }
  const reply = read.ok
  return reply.kind === 'chosen' &&
    reply.option === standing.option &&
    canonicalText(reply.evidence) === canonicalText(standing.source)
    ? { kind: 'allowed' }
    : { kind: 'denied' }
}

export function createSettingsGuard(readAdmission: AdmissionReader, readCards?: CardsReader) {
  const qualify = async (input: SettingsAdmissionInput): Promise<SettingsVerdict> => {
    try {
      const request = settingsAdmission(input, readCards !== undefined)
      if (request === undefined) return { kind: 'denied' }
      const admission = readAdmission()
      if (admission === undefined) return { kind: 'unavailable' }
      const answer = await admission.check(request)
      if (answer.kind === 'denied') return { kind: 'denied' }
      if (answer.kind !== 'allowed') return { kind: 'unavailable' }
      const standing = cardStandingOf(input.principal)
      return standing === null
        ? { kind: 'allowed' }
        : await answered(standing, request, readCards?.())
    } catch {
      return { kind: 'unavailable' }
    }
  }
  return Object.freeze({ qualify })
}
