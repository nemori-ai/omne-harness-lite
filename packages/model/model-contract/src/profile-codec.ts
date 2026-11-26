import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { z } from 'zod'
import {
  isNativeFileType,
  LIMIT_METRICS,
  type ProfileResolution,
  type ProfileScope,
} from './profile.ts'
import { REASONING_EFFORTS, type Parameter, type ToolDeclaration } from './root.ts'
import type { ModelInputRejection } from './judge-request.ts'
import { InputTree, freezeTree, rejected } from './input-tree.ts'
import { adoption, parameter, tool } from './request-shape.ts'
import { decodeProviderName } from './provider-name.ts'
import { decodeRevision } from './identity-values.ts'

function checked<T>(parse: (value: unknown) => Outcome<T, unknown>) {
  return z.unknown().transform((value, ctx) => {
    const result = parse(value)
    if ('ok' in result) return result.ok
    ctx.addIssue({ code: 'custom', message: 'invalid domain value' })
    return z.NEVER
  })
}
const text = z.string().min(1)
const integer = z.string().regex(/^(0|[1-9][0-9]*)$/u)
const adopted = checked(value => adoption(value, ''))
const evidence = z.strictObject({ owner: text, record: text, revision: text, digest: text })
const scope = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('factory') }),
  z.strictObject({
    kind: z.literal('organization'),
    organization: checked(value => {
      const parsed = typeof value === 'string' ? organizationCodec.parse(value) : null
      return parsed?.ok ? succeed(parsed.value) : fail('identity')
    }),
  }),
  z.strictObject({
    kind: z.literal('tenant'),
    tenant: checked(value => {
      const parsed = typeof value === 'string' ? tenantCodec.parse(value) : null
      return parsed?.ok ? succeed(parsed.value) : fail('identity')
    }),
  }),
])
const upstream = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown') }),
  z.strictObject({ kind: z.literal('finite'), amount: integer, source: adopted }),
  z.strictObject({ kind: z.enum(['unlimited', 'not-applicable']), source: adopted }),
])
const tokenLimit = z.strictObject({
  provided: integer,
  upstream: z.array(z.strictObject({ supplier: adopted, limit: upstream })),
})
const replay = z
  .strictObject({
    produces: text.optional(),
    accepts: z.array(text).optional(),
    foreignThinking: z.enum(['omit', 'text', 'adapter']).optional(),
  })
  .transform(value => ({
    ...(value.produces === undefined ? {} : { produces: value.produces }),
    ...(value.accepts === undefined ? {} : { accepts: value.accepts }),
    ...(value.foreignThinking === undefined ? {} : { foreignThinking: value.foreignThinking }),
  }))
const supplier = z
  .strictObject({
    adoption: adopted,
    provider: checked(decodeProviderName),
    model: text,
    replay: replay.optional(),
  })
  .transform(({ replay, ...value }) => ({ ...value, ...(replay === undefined ? {} : { replay }) }))
const modality = z.enum(['text', 'image', 'voice'])
const metric = z.enum(LIMIT_METRICS)
const parameters = z.array(checked(value => parameter(value, '')))
const tools = z.array(checked(value => tool(value, '')))
const profile = z.strictObject({
  identity: z.strictObject({ scope, route: text }),
  adoption: adopted,
  revision: checked(decodeRevision),
  updatedAt: text,
  availability: z.enum(['active', 'withdrawn']),
  definition: z
    .strictObject({
      suppliers: z.tuple([supplier]).rest(supplier),
      fallback: z.boolean(),
      input: z.tuple([modality]).rest(modality),
      fileTypes: z.array(z.string().refine(isNativeFileType)).optional(),
      output: z.tuple([modality]).rest(modality),
      context: z.strictObject({
        window: tokenLimit,
        input: tokenLimit.nullable(),
        output: tokenLimit,
        compactionTriggerPercent: z.string().regex(/^(?:[1-9][0-9]?|100)$/u),
      }),
      limits: z.array(tokenLimit.extend({ metric })),
      parameters,
      reasoningEfforts: z
        .partialRecord(z.enum(REASONING_EFFORTS), z.enum([...REASONING_EFFORTS, 'max']))
        .optional(),
      representation: adopted,
      meter: adopted,
      retryPolicy: adopted,
    })
    .transform(({ fileTypes, reasoningEfforts, ...value }) => ({
      ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
      ...value,
      ...(fileTypes === undefined ? {} : { fileTypes }),
    })),
})
const resolution = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('resolved'),
    profile,
    source: evidence,
    selectable: z.boolean(),
    reasons: z.array(z.enum(['modality', 'locked', 'scope'])),
    credential: z.enum(['available', 'missing', 'unreadable', 'unavailable']),
    shadowed: z.array(adopted),
  }),
  z.strictObject({
    kind: z.literal('absent'),
    reason: z.enum(['unknown-name', 'withdrawn', 'excluded']),
  }),
])

function read<T>(schema: z.ZodType<T>, value: unknown): Outcome<T, ModelInputRejection> {
  const copied = new InputTree().copy(value, '')
  if ('failure' in copied) return copied
  const parsed = schema.safeParse(copied.ok)
  return parsed.success
    ? succeed(freezeTree(parsed.data))
    : rejected(parsed.error.issues[0]?.path.join('/') ?? '', 'value')
}

function scopeValue(value: ProfileScope): Outcome<unknown, ModelInputRejection> {
  if (value.kind === 'factory') return succeed({ kind: 'factory' })
  const encoded =
    value.kind === 'tenant'
      ? tenantCodec.encode(value.tenant)
      : organizationCodec.encode(value.organization)
  if (!encoded.ok) return rejected('profile/identity/scope', 'identity')
  return succeed(
    value.kind === 'tenant'
      ? { kind: 'tenant', tenant: encoded.value }
      : { kind: 'organization', organization: encoded.value },
  )
}

export function profileResolutionValue(
  value: ProfileResolution,
): Outcome<unknown, ModelInputRejection> {
  if (value.kind === 'absent') return new InputTree().copy(value, '')
  const scope = scopeValue(value.profile.identity.scope)
  if ('failure' in scope) return scope
  return new InputTree().copy(
    {
      ...value,
      profile: { ...value.profile, identity: { ...value.profile.identity, scope: scope.ok } },
    },
    '',
  )
}

export function readProfileResolution(
  value: unknown,
): Outcome<ProfileResolution, ModelInputRejection> {
  return read(resolution, value)
}

export function judgeModelParameters(
  value: unknown,
): Outcome<readonly Parameter[], ModelInputRejection> {
  return read(parameters, value)
}

export function judgeToolDeclarations(
  value: unknown,
): Outcome<readonly ToolDeclaration[], ModelInputRejection> {
  return read(tools, value)
}
