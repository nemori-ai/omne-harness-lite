import type { Context } from '@deepseek-ai/cordis'
import type {
  DurableEvidence,
  ModalityRequirement,
  ProfileResolution,
} from '@omne-harness/model-contract'
import type { SessionRequirement } from '@omne-harness/model-access'
import { supportedReasoningEfforts } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import {
  nativeRequirement,
  unmetBy,
  type NativeRequirement,
} from '@omne-harness/request-context-contract'
import type { ModelTargetCheck, ModelTargets } from '@omne-harness/session-access'
import type {
  ModelViewBasis,
  ModelViewRow,
  SessionHistory,
  SessionId,
} from '@omne-harness/session-contract'
import { sessionKey, sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { TenantId } from '@omne-harness/legal-identity'

/** A selection needs words, and natively whatever the history of its session has no other form of. */
export const SELECTION_REQUIREMENT_SOURCE: DurableEvidence = Object.freeze({
  owner: 'harness-server',
  record: 'session-access/select-model',
  revision: '1',
  digest: '0'.repeat(64),
})

const CREDENTIAL = {
  available: 'available',
  missing: 'missing',
  unreadable: 'unknown',
  unavailable: 'unknown',
} as const

export function targetOf(resolution: ProfileResolution): ModelTargetCheck {
  if (resolution.kind === 'absent') return { kind: 'refused', reason: resolution.reason }
  const [reason] = resolution.reasons
  if (!resolution.selectable)
    return reason === undefined
      ? { kind: 'unavailable' }
      : { kind: 'refused', reason: reason === 'not-enabled' ? 'excluded' : reason }
  const { owner, name, revision, digest } = resolution.profile.adoption
  return {
    kind: 'selectable',
    credential: CREDENTIAL[resolution.credential],
    reasoningEfforts: supportedReasoningEfforts(resolution.profile.definition),
    basis: { owner, record: name, revision, digest },
  }
}

type Message = ModelViewRow['message']
type Located = Readonly<{ tenant: TenantId; session: SessionId }>
export type SessionModelView = (session: Located) => Promise<readonly Message[] | null>

const NOTHING: NativeRequirement = { modalities: [], fileTypes: [], blocks: [] }

function requirementOf(needs: NativeRequirement): ModalityRequirement {
  const others = needs.modalities.filter(modality => modality !== 'text')
  return {
    modalities: ['text', ...others],
    ...(needs.fileTypes.length === 0 ? {} : { fileTypes: needs.fileTypes }),
    source: SELECTION_REQUIREMENT_SOURCE,
  }
}

function requirementFrom(needs: NativeRequirement): SessionRequirement {
  return {
    required: requirementOf(needs),
    unmetBy: definition =>
      unmetBy(needs, definition).map(({ message, block }) => ({ message, block })),
  }
}

/** What selecting a model in this session judges by; null when its history cannot be read. */
export async function sessionRequirementOf(
  view: SessionModelView | undefined,
  session: Located,
): Promise<SessionRequirement | null> {
  try {
    const messages = (await view?.(session)) ?? null
    return messages === null ? null : requirementFrom(nativeRequirement(messages))
  } catch {
    return null
  }
}

export function modelTargetsOf(
  profiles: ModelProfiles<unknown> | undefined,
  view?: SessionModelView,
): ModelTargets | undefined {
  if (profiles === undefined) return undefined
  return {
    async check({ principal, tenant, route, session }) {
      // A history that cannot be read is not an empty history: the target is not judged without it.
      const requirement =
        session === undefined
          ? requirementFrom(NOTHING)
          : await sessionRequirementOf(view, { tenant, session })
      if (requirement === null) return { kind: 'unavailable' }
      const { required } = requirement
      const resolved = await profiles.resolve({ principal, tenant, route, required })
      if (!('ok' in resolved)) return { kind: 'unavailable' }
      const target = targetOf(resolved.ok)
      if (resolved.ok.kind !== 'resolved' || target.kind !== 'refused') return target
      if (target.reason !== 'modality') return target
      return { ...target, blocks: requirement.unmetBy(resolved.ok.profile.definition) }
    },
  }
}

const PAGE_BYTES = 1_048_576
const EPOCH_RETRIES = 3

type ReadPage = (
  at: Readonly<{ basis: ModelViewBasis | null; after: string | null; pageBytes: number }>,
) => ReturnType<SessionHistory<unknown>['readModelView']>

/** One whole view, page after page; 'changed' when the epoch moved under it; null when a page fails. */
async function wholeView(read: ReadPage): Promise<readonly Message[] | 'changed' | null> {
  const messages: Message[] = []
  let basis: ModelViewBasis | null = null
  let after: string | null = null
  for (;;) {
    const page = await read({ basis, after, pageBytes: PAGE_BYTES })
    if ('failure' in page) return null
    if (page.ok.kind === 'epoch-changed') return 'changed'
    messages.push(...page.ok.rows.map(row => row.message))
    if (page.ok.next === null) return messages
    ;({ basis, next: after } = page.ok)
  }
}

export async function readModelView(read: ReadPage): Promise<readonly Message[] | null> {
  for (let attempt = 0; attempt < EPOCH_RETRIES; attempt += 1) {
    const view = await wholeView(read)
    if (view !== 'changed') return view
  }
  return null
}

/** Reads as the session's coordinator: a login may not, and was admitted by the caller. */
export function sessionModelView(ctx: Context): SessionModelView {
  return async ({ tenant, session }) => {
    const coordinator = await ctx
      .get(sessionWorkPrincipalsKey)
      ?.forSession({ actor: 'coordinator', tenant, session })
    const history = ctx.intercept(sessionKey, { caller: 'reader' }).get(sessionKey, false)?.history
    if (coordinator === undefined || 'failure' in coordinator || history === undefined) return null
    const access = { principal: coordinator.ok, tenant, session }
    return readModelView(at => history.readModelView({ ...access, ...at }))
  }
}

export function modelTargets(ctx: Context): ModelTargets | undefined {
  const profiles = ctx.get(modelProfilesKey, false) as ModelProfiles<unknown> | undefined
  return modelTargetsOf(profiles, sessionModelView(ctx))
}
