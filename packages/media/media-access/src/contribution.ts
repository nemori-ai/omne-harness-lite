import type {
  AccessContribution,
  AnswerOf,
  LoginIdentity,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { UploadStatus } from '@omne-harness/media-contract'
import { mediaProtocol, type MediaProtocol } from '@omne-harness/media-protocol'
import type { MediaFace, TargetTenantPrincipals } from './ports.ts'

export type MediaContributionInput = Readonly<{
  media: () => MediaFace | undefined
  principals: TargetTenantPrincipals
}>

type Operations = MediaProtocol['operations']
type Name = keyof Operations
type Answer<K extends Name> = AnswerOf<Operations[K]>
type Reply<T, F> = { readonly ok: T } | { readonly failure: F }
type Shared = { readonly kind: 'unavailable' } | { readonly kind: 'outcome-unknown' }
/** For each refusal of the domain other than the two every operation shares, the answer it becomes. */
type Table<F extends { kind: string }, A> = {
  readonly [K in Exclude<F['kind'], Shared['kind']>]: (failure: Extract<F, { kind: K }>) => A
}

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })
const UNKNOWN = Object.freeze({ outcome: 'unknown' as const })
const NOT_FOUND = Object.freeze({ outcome: 'not-found' as const, body: {} })

const standing = (status: UploadStatus) => ({
  outcome: 'succeeded' as const,
  body: {
    status:
      status.kind === 'uploading'
        ? {
            kind: 'uploading' as const,
            nextSequence: status.ticket.nextSequence,
            partBytes: status.ticket.partBytes,
          }
        : { kind: 'committed' as const, ...status.committed },
  },
})

/** What a reply of the domain becomes: its value, a shared refusal, or the answer its own refusal maps to. */
function settled<T, F extends { kind: string }, A>(
  reply: Reply<T, F>,
  succeeded: (value: T) => A,
  refusals: Table<F, A>,
): A | typeof UNAVAILABLE {
  if ('ok' in reply) return succeeded(reply.ok)
  const { failure } = reply
  if (failure.kind === 'unavailable' || failure.kind === 'outcome-unknown') return UNAVAILABLE
  const own = refusals as unknown as Record<string, (failure: F) => A>
  return own[failure.kind]!(failure)
}

/** A read: the domain throwing is basis-unavailable. */
async function read<T, F extends { kind: string }, A>(
  call: () => Promise<Reply<T, F>>,
  succeeded: (value: T) => A,
  refusals: Table<F, A>,
): Promise<A | typeof UNAVAILABLE> {
  try {
    return settled(await call(), succeeded, refusals)
  } catch {
    return UNAVAILABLE
  }
}

/** A commit: the domain throwing, like a write it does not know the end of, is unknown. */
async function write<T, F extends { kind: string }, A>(
  call: () => Promise<Reply<T, F>>,
  succeeded: (value: T) => A,
  refusals: Table<F, A>,
): Promise<A | typeof UNAVAILABLE | typeof UNKNOWN> {
  try {
    const reply = await call()
    if ('failure' in reply && reply.failure.kind === 'outcome-unknown') return UNKNOWN
    return settled(reply, succeeded, refusals)
  } catch {
    return UNKNOWN
  }
}

export function createMediaContribution(
  input: MediaContributionInput,
): AccessContribution<MediaProtocol> {
  /** Steps one to three of every handler: the acting, then the face of media at this call. */
  async function admitted(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<MediaFace | typeof DENIED | typeof UNAVAILABLE> {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) throw new TypeError('media-access: tenant is not a minted TenantId')
    const issued = await input.principals
      .actingFor(login, text.value)
      .catch(() => ({ refused: 'basis-unavailable' as const }))
    if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
    return input.media() ?? UNAVAILABLE
  }

  return {
    protocol: mediaProtocol,
    operations: {
      async 'begin-upload'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return write(
          () => media.uploads.begin(body),
          (ok): Answer<'begin-upload'> => standing(ok),
          {
            'too-large': ({ limit }) => ({ outcome: 'limited', body: { limit } }),
            'unsupported-type': () => ({ outcome: 'unsupported', body: {} }),
            invalid: ({ field }) => ({ outcome: 'invalid', body: { field } }),
          },
        )
      },
      async 'append-upload-part'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return write(
          () => media.uploads.append(body),
          (ok): Answer<'append-upload-part'> => ({ outcome: 'succeeded', body: ok }),
          {
            'not-found': () => NOT_FOUND,
            committed: () => ({ outcome: 'conflict', body: { reason: 'committed' } }),
            conflict: () => ({ outcome: 'conflict', body: { reason: 'other-bytes' } }),
            gap: ({ nextSequence }) => ({
              outcome: 'invalid',
              body: { reason: 'gap', nextSequence },
            }),
            'beyond-declared': () => ({ outcome: 'invalid', body: { reason: 'beyond-declared' } }),
            'part-too-large': ({ limit }) => ({ outcome: 'limited', body: { limit } }),
          },
        )
      },
      async 'commit-upload'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return write(
          () => media.uploads.commit(body),
          (ok): Answer<'commit-upload'> => ({ outcome: 'succeeded', body: ok }),
          {
            'not-found': () => NOT_FOUND,
            incomplete: ({ nextSequence }) => ({
              outcome: 'invalid',
              body: { reason: 'incomplete', nextSequence },
            }),
            'digest-mismatch': ({ kind }) => ({ outcome: 'invalid', body: { reason: kind } }),
            'type-mismatch': ({ kind }) => ({ outcome: 'invalid', body: { reason: kind } }),
            'over-budget': ({ kind }) => ({ outcome: 'invalid', body: { reason: kind } }),
          },
        )
      },
      async 'query-upload'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return read(
          () => media.uploads.status(body),
          (ok): Answer<'query-upload'> => standing(ok),
          { 'not-found': () => NOT_FOUND },
        )
      },
      async 'read-media-page'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return read(
          () => media.reads.page({ ...body, target: body.target ?? null }),
          (ok): Answer<'read-media-page'> => ({ outcome: 'succeeded', body: ok }),
          {
            'invalid-reference': () => ({ outcome: 'not-found', body: { reason: 'reference' } }),
            'material-unavailable': () => ({ outcome: 'not-found', body: { reason: 'material' } }),
            'too-large': () => ({ outcome: 'limited', body: {} }),
          },
        )
      },
      async 'describe-media'(call, body) {
        const media = await admitted(call.principal, body.tenant)
        if ('outcome' in media) return media
        return read(
          () => media.custody.describe(body),
          (ok): Answer<'describe-media'> => ({ outcome: 'succeeded', body: ok }),
          { 'invalid-reference': () => NOT_FOUND },
        )
      },
    },
    observations: {},
  }
}
