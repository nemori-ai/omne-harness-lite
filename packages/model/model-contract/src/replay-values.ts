// Runtime values of the design section "推理回放": the replay declaration of a supplier and the
// replay projection that an adapter and a meter share. This file imports types only from the
// chapter files. Nothing here reads the payload of a reasoning state part.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { REPLAY_TAG_MAX_LENGTH, type MessageId } from '@omne-harness/message'
import type {
  ForeignThinking,
  ProfileSupplier,
  ReplayDeclaration,
  ReplayDiagnostic,
  ReplayProjection,
  ReplayProjectionInput,
  ReplayTreatment,
} from './profile.ts'
import type { ModelFailure } from './result.ts'

const FOREIGN_THINKING: readonly ForeignThinking[] = ['omit', 'text', 'adapter']

/**
 * The declaration of a supplier with every default applied: `produces` is the exact model identity
 * (recipient, `/`, model), `accepts` holds only `produces`, `foreignThinking` is `omit`. The result
 * is frozen. It is not checked: `judgeReplayDeclaration` checks it.
 */
export function expandReplayDeclaration(
  supplier: Pick<ProfileSupplier, 'recipient' | 'model' | 'replay'>,
): ReplayDeclaration {
  const declared = supplier.replay
  const produces = declared?.produces ?? `${supplier.recipient}/${supplier.model}`
  return Object.freeze({
    produces,
    accepts: Object.freeze([...(declared?.accepts ?? [produces])]),
    foreignThinking: declared?.foreignThinking ?? 'omit',
  })
}

function isTag(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= REPLAY_TAG_MAX_LENGTH
}

function invalid(index: number, reason: string) {
  return fail({ kind: 'invalid', field: `suppliers[${index}].replay`, reason } as const)
}

const REPLAY_KEYS: readonly string[] = ['produces', 'accepts', 'foreignThinking']

/**
 * The reason a declared value read from a store or a configuration does not have the declared
 * shape, or null. `replay` is a plain object with only the three keys, `produces` is text and
 * `accepts` is a dense array of text; an absent key takes its default.
 */
function shapeReason(declared: unknown): string | null {
  if (declared === undefined) return null
  if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) return 'replay'
  if (Object.keys(declared).some(key => !REPLAY_KEYS.includes(key))) return 'replay'
  const produces = 'produces' in declared ? declared.produces : undefined
  const accepts = 'accepts' in declared ? declared.accepts : undefined
  if (produces !== undefined && typeof produces !== 'string') return 'produces'
  if (accepts === undefined) return null
  if (!Array.isArray(accepts)) return 'accepts'
  for (let i = 0; i < accepts.length; i += 1) {
    if (!Object.hasOwn(accepts, i) || typeof accepts[i] !== 'string') return 'accepts'
  }
  return null
}

/**
 * Expands and checks the declaration of the supplier at `index` of a profile definition. The first
 * failure in this order is returned: the shape of `replay` as stored, `produces` (also when it is
 * a default that is too long), each item of `accepts`, duplicates, `produces` missing from
 * `accepts`, `foreignThinking`. `field` is `suppliers[index].replay`.
 */
export function judgeReplayDeclaration(
  supplier: Pick<ProfileSupplier, 'recipient' | 'model' | 'replay'>,
  index: number,
): Outcome<ReplayDeclaration, Extract<ModelFailure, { kind: 'invalid' }>> {
  const shape = shapeReason(supplier.replay)
  if (shape !== null) return invalid(index, shape)
  const declaration = expandReplayDeclaration(supplier)
  if (!isTag(declaration.produces)) return invalid(index, 'produces')
  if (!declaration.accepts.every(isTag)) return invalid(index, 'accepts')
  if (new Set(declaration.accepts).size !== declaration.accepts.length)
    return invalid(index, 'accepts-duplicate')
  if (!declaration.accepts.includes(declaration.produces))
    return invalid(index, 'accepts-lacks-produces')
  if (!FOREIGN_THINKING.includes(declaration.foreignThinking))
    return invalid(index, 'foreign-thinking')
  return succeed(declaration)
}

/**
 * The replay projection of one dispatch: one treatment for each message of the role assistant, in
 * the order of `messages`, and the diagnostics of the messages that lose reasoning state parts.
 * A message can continue when it has `replay`, its `scope` is in `accepts`, its `format` is known,
 * replay is not off and a re-dispatch does not leave it out. A part is found by `replay.at`.
 */
export function projectReplay(input: ReplayProjectionInput): ReplayProjection {
  const accepted = new Set(input.declaration.accepts)
  const treatments: ReplayTreatment[] = []
  const diagnostics: ReplayDiagnostic[] = []
  input.messages.forEach((message, index) => {
    if (message.role !== 'assistant') return
    const replay = message.replay
    const continuable =
      !input.off &&
      replay !== undefined &&
      accepted.has(replay.scope) &&
      input.formats.has(replay.format) &&
      !input.resent.has(message.id)
    const at = replay?.at ?? []
    treatments.push(
      Object.freeze({
        index,
        message: message.id,
        continuable,
        carry: continuable ? at : [],
        omit: continuable ? [] : at,
        thinking: continuable ? 'native' : input.declaration.foreignThinking,
      }),
    )
    if (!continuable && replay !== undefined && at.length > 0)
      diagnostics.push(
        Object.freeze({
          message: message.id,
          scope: replay.scope,
          format: replay.format,
          omittedParts: at.length,
        }),
      )
  })
  return Object.freeze({
    treatments: Object.freeze(treatments),
    diagnostics: Object.freeze(diagnostics),
  })
}

/**
 * The messages that a projection continues. A re-dispatch after `replay-rejected` passes them as
 * `resent`, so none of them continues again.
 */
export function continuedMessages(projection: ReplayProjection): ReadonlySet<MessageId> {
  return new Set(projection.treatments.filter(item => item.continuable).map(item => item.message))
}
