import type { ContentBlock } from '@omne-harness/content-block'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  defineSchema,
  jsonSchemaDefinition,
  validate,
  type SchemaProvider,
} from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  ReleaseDetailAnswer,
  ReleaseDetailPolicy,
  ToolCommandReleaseDetail,
  ToolReleaseDescriber,
  ToolReleaseDetails,
} from '@omne-harness/tool-contract'
import { readToolRegistration, type ToolOperationSlot } from '@omne-harness/tool-contract/binding'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  commandArguments,
  judgeReleaseDescription,
} from '@omne-harness/tool-contract/provider'
import type { LocalToolBindingRegistry } from './bindings.ts'

/** Attaches what a tool reads while it describes, under the description's signal; returns the detach. */
export type ReleaseDetailAttach<P> = (
  input: Readonly<{ principal: P; tenant: TenantId; name: string; signal: AbortSignal }>,
) => () => void

export type LocalReleaseDetailsInput<P, E, B extends ContentBlock> = Readonly<{
  registry: () => LocalToolBindingRegistry<P, E, B> | undefined
  provider: SchemaProvider
  policy?: ReleaseDetailPolicy
  attach?: ReleaseDetailAttach<P>
}>

const unavailable = (reason: string): ReleaseDetailAnswer => ({ kind: 'unavailable', reason })
const TIMED_OUT = Symbol('timed-out')

async function within<T>(work: () => Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  try {
    return await Promise.race([work(), expired])
  } finally {
    clearTimeout(timer)
  }
}

async function schemaVerdict(
  provider: SchemaProvider,
  declared: ToolCommandReleaseDetail,
  value: string,
  maxBytes: number,
): Promise<string> {
  const read = readJsonText(value, {
    maxBytes,
    maxDepth: 32,
    maxItems: 4096,
    maxMembers: 512,
    maxStringLength: maxBytes,
    maxNumberLength: 64,
  })
  const reference = defineSchema({
    id: `release-detail:${canonicalDigest(declared)}`,
    load: async () =>
      jsonSchemaDefinition({
        document: JSON.parse(writeJsonText(declared.schema as JsonValue)),
        numbers: 'exact-or-reject',
      }),
  })
  return (await validate(provider, reference, read)).kind
}

type Asked<P> = Parameters<ToolReleaseDetails<P>['describe']>[0]
type Describing = Readonly<{ describe: ToolReleaseDescriber<unknown>; arguments: unknown }>

function slotOf<P, E, B extends ContentBlock>(
  registry: LocalToolBindingRegistry<P, E, B> | undefined,
  { principal, tenant, availability, command }: Asked<P>,
): ToolOperationSlot | ReleaseDetailAnswer {
  if (registry === undefined) return unavailable('no-registry')
  const loaded = registry.peek({ principal, tenant }, availability)
  if ('failure' in loaded) return unavailable('no-registration')
  const registration = readToolRegistration(loaded.ok.implementation)
  const slot =
    registration?.kind === 'commands'
      ? registration.operations.find(([name]) => name === command)?.[1]
      : registration?.operation
  return slot ?? { kind: 'none' }
}

// The arguments the command's own parser reads from the effective text, as a start would read them.
function describing<P>(slot: ToolOperationSlot, asked: Asked<P>): Describing | ReleaseDetailAnswer {
  if (slot.describeRelease === null) return { kind: 'none' }
  const text = asked.effectiveArguments
  const cut = commandArguments(asked.availability.definition, asked.command, {
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in cut) return unavailable('arguments')
  const parsed = slot.author.parameters.parse(cut.ok)
  return 'failure' in parsed
    ? unavailable('arguments')
    : { describe: slot.describeRelease, arguments: parsed.ok }
}

function declaredOf<P>({ availability: { definition }, command }: Asked<P>) {
  return definition.kind === 'commands'
    ? definition.commands.find(entry => entry.name === command)?.release?.detail
    : undefined
}

export function createLocalReleaseDetails<P, E, B extends ContentBlock>(
  input: LocalReleaseDetailsInput<P, E, B>,
): ToolReleaseDetails<P> {
  const policy = input.policy ?? DEFAULT_RELEASE_DETAIL_POLICY
  const checked = async (described: unknown, asked: Asked<P>): Promise<ReleaseDetailAnswer> => {
    const declared = declaredOf(asked)
    const judged = judgeReleaseDescription(described, declared, policy)
    if ('failure' in judged) return unavailable(judged.failure)
    if (judged.ok.typed === undefined || declared === undefined)
      return { kind: 'detail', ...judged.ok }
    const verdict = await schemaVerdict(
      input.provider,
      declared,
      judged.ok.typed.value,
      policy.maxTypedBytes,
    )
    if (verdict === 'valid') return { kind: 'detail', ...judged.ok }
    return unavailable(verdict === 'invalid' ? 'typed-schema' : `schema-${verdict}`)
  }
  const answer = async (asked: Asked<P>): Promise<ReleaseDetailAnswer> => {
    const slot = slotOf(input.registry(), asked)
    if ('kind' in slot) return slot
    const call = describing(slot, asked)
    if ('kind' in call) return call
    const { principal, tenant } = asked
    const controller = new AbortController()
    const { signal } = controller
    const detach = input.attach?.({
      principal,
      tenant,
      name: asked.availability.definition.name,
      signal,
    })
    try {
      const described = await within(
        () => call.describe({ principal, tenant, arguments: call.arguments, signal }),
        policy.timeoutMs,
      )
      return described === TIMED_OUT ? unavailable('timeout') : checked(described, asked)
    } finally {
      controller.abort()
      detach?.()
    }
  }
  return {
    async describe(request) {
      try {
        return await answer(request)
      } catch {
        return unavailable('threw')
      }
    },
  }
}
