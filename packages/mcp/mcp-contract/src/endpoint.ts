// The endpoint body: the parser and the category port of `mcp`.
import {
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type JudgeContext,
  type Judgment,
} from '@omne-harness/assets'
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { ENDPOINT_BODY_SCHEMA } from './endpoint-schema.ts'
import { hasOnly, isObject, member, textOf } from './json.ts'
import { isEndpointName } from './brands.ts'
import type { AuthKind, EndpointDefinition } from './values.ts'

/** Why a body is not an endpoint definition. The set is closed. */
export type EndpointBodyRejection =
  | 'malformed'
  | 'name-mismatch'
  | 'transport-unknown'
  | 'auth-unknown'

const BODY_MEMBERS = ['name', 'transport', 'auth'] as const
const AUTH_KINDS: readonly AuthKind[] = ['none', 'static', 'oauth']

function isAuthKind(value: string): value is AuthKind {
  return AUTH_KINDS.some(known => known === value)
}

/**
 * Reads an endpoint body. The input is a JSON tree of `@omne-harness/json-text`; anything else
 * is `malformed`. The function does not throw. The order of the checks is part of the contract
 * (SPEC E2), so it stays in this one function: a structural defect first, then a name that
 * differs from the given capability name, a transport other than Streamable HTTP, and last an
 * unknown authentication kind.
 */
export function parseEndpointBody(
  body: unknown,
  capabilityName?: string,
): Outcome<EndpointDefinition, EndpointBodyRejection> {
  const judged = judgeJsonValue(body)
  if ('rejected' in judged || !isObject(judged.ok) || !hasOnly(judged.ok, BODY_MEMBERS))
    return fail('malformed')
  const document = judged.ok
  const name = textOf(member(document, 'name'))
  const transport = textOf(member(document, 'transport'))
  const auth = textOf(member(document, 'auth'))
  if (!isEndpointName(name) || transport === undefined || auth === undefined)
    return fail('malformed')
  if (capabilityName !== undefined && name !== capabilityName) return fail('name-mismatch')
  if (transport !== 'streamable-http') return fail('transport-unknown')
  if (!isAuthKind(auth)) return fail('auth-unknown')
  return succeed({ name, transport: { kind: 'streamable-http' }, auth })
}

const TARGET = 'setting:placement-identity:target'
const CREDENTIAL = 'setting:placement-identity:credential'
const CONNECT_TIMEOUT = 'setting:preference:connect-timeout'

/**
 * The setting declarations of an endpoint: the connection target, the credential only when
 * authentication is not `none`, and the connect timeout.
 */
function declarationsOf(definition: EndpointDefinition): readonly string[] {
  return [TARGET, ...(definition.auth === 'none' ? [] : [CREDENTIAL]), CONNECT_TIMEOUT]
}

const SCHEMA_LIMITS = {
  maxBytes: 20_000,
  maxDepth: 16,
  maxItems: 1_000,
  maxMembers: 32,
  maxStringLength: 1_000,
  maxNumberLength: 20,
} as const

const schemaRead = readBodyText(ENDPOINT_BODY_SCHEMA, SCHEMA_LIMITS)
if (schemaRead.kind !== 'ok') throw new TypeError('the MCP endpoint body schema is not JSON')
const schema: JsonValue = schemaRead.value

/**
 * Parses a read body. A body that did not come from the asset reader is refused with
 * `incomplete-reference`, as the asset contract requires of every category port.
 */
function definitionOf(
  body: unknown,
  context?: JudgeContext,
): Outcome<EndpointDefinition, EndpointBodyRejection | 'incomplete-reference'> {
  if (!isReadBody(body)) return fail('incomplete-reference')
  return parseEndpointBody(readSnapshot(body), context?.capabilityName)
}

function judge(body: unknown, context?: JudgeContext): Judgment {
  const parsed = definitionOf(body, context)
  return 'failure' in parsed ? refusal(parsed.failure) : { ok: true }
}

function judgedDefinition(body: unknown, context?: JudgeContext): EndpointDefinition {
  const parsed = definitionOf(body, context)
  if ('failure' in parsed)
    throw new TypeError(`MCP endpoint body failed judgment: ${parsed.failure}`)
  return parsed.ok
}

/** The category port of MCP endpoint bodies. Category `mcp`. */
export function mcpEndpointBodyContract(): BodyContract {
  return {
    category: 'mcp',
    schema,
    judge,
    deriveDeclarations(body, context) {
      return { entries: declarationsOf(judgedDefinition(body, context)) }
    },
    references(body, context) {
      judgedDefinition(body, context)
      return []
    },
  }
}
