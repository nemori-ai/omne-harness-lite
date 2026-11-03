// The endpoint body: the parser, the local-command judgment and the category port of `mcp`.
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
import { hasOnly, isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import { isEndpointName } from './brands.ts'
import type {
  AuthKind,
  EndpointDefinition,
  EnvironmentBinding,
  StdioLaunch,
  TransportDeclaration,
} from './values.ts'

/** Why a body is not an endpoint definition. The set is closed. */
export type EndpointBodyRejection =
  | 'malformed'
  | 'name-mismatch'
  | 'transport-unknown'
  | 'auth-unknown'
  | 'launch-missing'
  | 'launch-unexpected'

const BODY_MEMBERS = ['name', 'transport', 'auth', 'launch'] as const
const LAUNCH_MEMBERS = ['command', 'args', 'cwd', 'env', 'facilities'] as const
const ENVIRONMENT_MEMBERS = ['name', 'source'] as const
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u
const FACILITY = /^[a-z][a-z0-9-]{0,31}$/u
const TRANSPORTS = ['stdio', 'streamable-http'] as const
const AUTH_KINDS: readonly AuthKind[] = ['none', 'static', 'oauth']

type Transport = (typeof TRANSPORTS)[number]

function isTransport(value: string): value is Transport {
  return TRANSPORTS.some(known => known === value)
}

function isAuthKind(value: string): value is AuthKind {
  return AUTH_KINDS.some(known => known === value)
}

/**
 * Reads an endpoint body. The input is a JSON tree of `@omne-harness/json-text`; anything else
 * is `malformed`. The function does not throw. The order of the checks is part of the contract
 * (SPEC E2), so it stays in this one function: a structural defect first, then a name that
 * differs from the given capability name, an unknown transport, an unknown authentication kind,
 * an unlawful combination, and last a launch declaration that the transport requires or forbids.
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
  const launchValue = member(document, 'launch')
  const launch = launchValue === undefined ? undefined : launchOf(launchValue)
  if (launch === 'malformed') return fail('malformed')
  if (capabilityName !== undefined && name !== capabilityName) return fail('name-mismatch')
  if (!isTransport(transport)) return fail('transport-unknown')
  if (!isAuthKind(auth)) return fail('auth-unknown')
  if (!isLawfulCombination(transport, auth, launch)) return fail('malformed')
  const declaration = transportOf(transport, launch)
  if (declaration === 'launch-missing' || declaration === 'launch-unexpected')
    return fail(declaration)
  return succeed({ name, transport: declaration, auth })
}

/** OAuth is for HTTP only, and without authentication no variable comes from a credential. */
function isLawfulCombination(
  transport: Transport,
  auth: AuthKind,
  launch: StdioLaunch | undefined,
): boolean {
  if (transport === 'stdio' && auth === 'oauth') return false
  return auth !== 'none' || launch === undefined || launch.env.every(isSettingSourced)
}

function isSettingSourced(binding: EnvironmentBinding): boolean {
  return binding.source === 'setting'
}

/** stdio needs a launch declaration; Streamable HTTP must not have one. */
function transportOf(
  transport: Transport,
  launch: StdioLaunch | undefined,
): TransportDeclaration | 'launch-missing' | 'launch-unexpected' {
  if (transport === 'streamable-http')
    return launch === undefined ? { kind: 'streamable-http' } : 'launch-unexpected'
  return launch === undefined ? 'launch-missing' : { kind: 'stdio', launch }
}

function launchOf(value: JsonValue): StdioLaunch | 'malformed' {
  if (!isObject(value) || !hasOnly(value, LAUNCH_MEMBERS)) return 'malformed'
  const command = textOf(member(value, 'command'))
  const args = textsOf(member(value, 'args'))
  const cwd = optionalNonEmptyText(member(value, 'cwd'))
  const env = environmentOf(member(value, 'env'))
  const facilities = facilitiesOf(member(value, 'facilities'))
  if (command === undefined || command === '' || cwd === 'malformed') return 'malformed'
  if (args === undefined || env === undefined || facilities === undefined) return 'malformed'
  return cwd === undefined
    ? { command, args, env, facilities }
    : { command, args, cwd, env, facilities }
}

/** An omitted value is undefined; a present value must be non-empty text. */
function optionalNonEmptyText(value: JsonValue | undefined): string | 'malformed' | undefined {
  if (value === undefined) return undefined
  const text = textOf(value)
  return text === undefined || text === '' ? 'malformed' : text
}

/** An omitted list reads as empty. Each name follows the facility lexicon and appears once. */
function facilitiesOf(value: JsonValue | undefined): readonly string[] | undefined {
  const names = textsOf(value)
  if (names === undefined || !names.every(name => FACILITY.test(name))) return undefined
  return new Set(names).size === names.length ? names : undefined
}

/** An omitted list reads as empty. A list with a member that is not text is undefined. */
function textsOf(value: JsonValue | undefined): readonly string[] | undefined {
  if (value === undefined) return []
  const items = itemsOf(value)
  if (items === undefined) return undefined
  const texts: string[] = []
  for (const item of items) {
    const text = textOf(item)
    if (text === undefined) return undefined
    texts.push(text)
  }
  return texts
}

function environmentOf(value: JsonValue | undefined): readonly EnvironmentBinding[] | undefined {
  if (value === undefined) return []
  const items = itemsOf(value)
  if (items === undefined) return undefined
  const bindings: EnvironmentBinding[] = []
  for (const item of items) {
    const binding = isObject(item) ? bindingOf(item) : undefined
    if (binding === undefined || bindings.some(known => known.name === binding.name))
      return undefined
    bindings.push(binding)
  }
  return bindings
}

function bindingOf(item: JsonObject): EnvironmentBinding | undefined {
  if (!hasOnly(item, ENVIRONMENT_MEMBERS)) return undefined
  const name = textOf(member(item, 'name'))
  const source = textOf(member(item, 'source'))
  if (name === undefined || !VARIABLE_NAME.test(name)) return undefined
  if (source !== 'setting' && source !== 'credential') return undefined
  return { name, source }
}

/** True when the endpoint may start a local command. It is known when the body is loaded. */
export function launchesLocalCommand(definition: EndpointDefinition): boolean {
  return definition.transport.kind === 'stdio'
}

const TARGET = 'setting:placement-identity:target'
const CREDENTIAL = 'setting:placement-identity:credential'
const CONNECT_TIMEOUT = 'setting:preference:connect-timeout'
const ENV_PREFIX = 'setting:placement-identity:env.'

/**
 * The setting declarations of an endpoint: the connection target only for Streamable HTTP, the
 * credential only when authentication is not `none`, one item for each environment variable whose
 * source is `setting`, in body order, and the connect timeout always.
 */
function declarationsOf(definition: EndpointDefinition): readonly string[] {
  const env =
    definition.transport.kind === 'stdio'
      ? definition.transport.launch.env
          .filter(binding => binding.source === 'setting')
          .map(binding => `${ENV_PREFIX}${binding.name}`)
      : []
  return [
    ...(definition.transport.kind === 'streamable-http' ? [TARGET] : []),
    ...(definition.auth === 'none' ? [] : [CREDENTIAL]),
    ...env,
    CONNECT_TIMEOUT,
  ]
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
