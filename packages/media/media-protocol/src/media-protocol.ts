import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const count = { kind: 'count' } as const
const bytes = { kind: 'bytes' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const ofTenant = { tenant: { rule: { kind: 'tenant' } } } as const
const ofUpload = { ...ofTenant, upload: { rule: text } } as const

/** The content reference of the common contract: not an address to fetch from and not a right to read. */
const reference = object({
  storage: { rule: text },
  key: { rule: text },
  mediaType: { rule: text },
  bytes: { rule: text },
  digest: { rule: text },
})
const ofMedium = { ...ofTenant, ref: { rule: reference } } as const

const facts = oneOf(
  object({
    kind: { rule: literal('image') },
    widthPixels: { rule: count },
    heightPixels: { rule: count },
  }),
  object({
    kind: { rule: literal('voice') },
    durationMs: { rule: count },
    sampleRate: { rule: count },
    channels: { rule: count },
  }),
  object({ kind: { rule: literal('file') } }),
)
const committedFields = { ref: { rule: reference }, facts: { rule: facts } } as const

/** Where an upload stands: what to send next, or the reference it was committed to. */
const status = oneOf(
  object({
    kind: { rule: literal('uploading') },
    nextSequence: { rule: count },
    partBytes: { rule: count },
  }),
  object({ kind: { rule: literal('committed') }, ...committedFields }),
)

/** The limits a version for display must be within. */
const target = object({
  mediaTypes: { rule: array(text) },
  maxBytes: { rule: count },
  maxWidth: { rule: count },
  maxHeight: { rule: count },
})

const empty = ruleCodec(object({}))
const standing = ruleCodec(object({ status: { rule: status } }))
const limit = ruleCodec(object({ limit: { rule: count } }))

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const
const write = { identity: 'login', effect: 'commit', limit: 'small', countsAsAccess: true } as const

/** media/v1. The client names an upload; after a lost answer `query-upload` says where it stands. */
export const mediaProtocol = defineProtocol({
  name: 'media',
  major: 1,
  operations: {
    'begin-upload': {
      ...write,
      body: ruleCodec(object({ ...ofUpload, mediaType: { rule: text }, bytes: { rule: count } })),
      outcomes: {
        succeeded: standing,
        limited: limit,
        unsupported: empty,
        invalid: ruleCodec(object({ field: { rule: literal('upload', 'bytes') } })),
      },
    },
    'append-upload-part': {
      ...write,
      limit: 'input',
      body: ruleCodec(object({ ...ofUpload, sequence: { rule: count }, part: { rule: bytes } })),
      outcomes: {
        succeeded: ruleCodec(object({ nextSequence: { rule: count } })),
        'not-found': empty,
        conflict: ruleCodec(object({ reason: { rule: literal('other-bytes', 'committed') } })),
        invalid: ruleCodec(
          oneOf(
            object({ reason: { rule: literal('gap') }, nextSequence: { rule: count } }),
            object({ reason: { rule: literal('beyond-declared') } }),
          ),
        ),
        limited: limit,
      },
    },
    'commit-upload': {
      ...write,
      body: ruleCodec(object({ ...ofUpload, digest: { rule: text } })),
      outcomes: {
        succeeded: ruleCodec(object(committedFields)),
        'not-found': empty,
        invalid: ruleCodec(
          oneOf(
            object({ reason: { rule: literal('incomplete') }, nextSequence: { rule: count } }),
            object({
              reason: { rule: literal('digest-mismatch', 'type-mismatch', 'over-budget') },
            }),
          ),
        ),
      },
    },
    'query-upload': {
      ...read,
      body: ruleCodec(object(ofUpload)),
      outcomes: { succeeded: standing, 'not-found': empty },
    },
    'read-media-page': {
      ...read,
      body: ruleCodec(
        object({
          ...ofMedium,
          offset: { rule: count },
          limit: { rule: count },
          target: { rule: target, optional: true },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            part: { rule: bytes },
            next: { rule: oneOf(count, nothing) },
            mediaType: { rule: text },
            bytes: { rule: count },
            facts: { rule: facts },
          }),
        ),
        'not-found': ruleCodec(object({ reason: { rule: literal('reference', 'material') } })),
        limited: empty,
      },
    },
    'describe-media': {
      ...read,
      body: ruleCodec(object(ofMedium)),
      outcomes: {
        succeeded: ruleCodec(
          object({ state: { rule: literal('staged', 'held') }, facts: { rule: facts } }),
        ),
        'not-found': empty,
      },
    },
  },
  observations: {},
})
