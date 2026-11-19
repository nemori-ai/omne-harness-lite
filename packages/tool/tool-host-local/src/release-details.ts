import type { ContentBlock } from '@omne-harness/content-block'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
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
  ToolReleaseDetails,
} from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  commandArguments,
  judgeReleaseDescription,
} from '@omne-harness/tool-contract/provider'
import type { LocalToolBindingRegistry } from './bindings.ts'

export type LocalReleaseDetailsInput<P, E, B extends ContentBlock> = Readonly<{
  registry: () => LocalToolBindingRegistry<P, E, B> | undefined
  provider: SchemaProvider
  policy?: ReleaseDetailPolicy
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

async function fitsSchema(
  provider: SchemaProvider,
  declared: ToolCommandReleaseDetail,
  value: string,
): Promise<boolean> {
  const read = readJsonText(value, {
    maxBytes: 64 * 1024,
    maxDepth: 32,
    maxItems: 4096,
    maxMembers: 512,
    maxStringLength: 16 * 1024,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') return false
  const reference = defineSchema({
    id: `release-detail:${canonicalDigest(declared)}`,
    load: async () =>
      jsonSchemaDefinition({
        document: JSON.parse(writeJsonText(declared.schema as JsonValue)),
        numbers: 'exact-or-reject',
      }),
  })
  return (await validate(provider, reference, read)).kind === 'valid'
}

/**
 * Asks the implementer what one call would do, before it starts. It writes nothing: it finds the
 * registration a start would run, parses the arguments as a start would, and calls the read-only
 * describe function of the command under a time limit.
 */
export function createLocalReleaseDetails<P, E, B extends ContentBlock>(
  input: LocalReleaseDetailsInput<P, E, B>,
): ToolReleaseDetails<P> {
  const policy = input.policy ?? DEFAULT_RELEASE_DETAIL_POLICY
  return {
    async describe({ principal, tenant, availability, command, effectiveArguments }) {
      const registry = input.registry()
      if (registry === undefined) return unavailable('no-registry')
      const loaded = registry.peek({ principal, tenant }, availability)
      if ('failure' in loaded) return unavailable('no-registration')
      const registration = readToolRegistration(loaded.ok.implementation)
      const slot =
        registration?.kind === 'commands'
          ? registration.operations.find(([name]) => name === command)?.[1]
          : registration?.operation
      if (slot === undefined || slot.describeRelease === null) return { kind: 'none' }
      const { definition } = availability
      const cut = commandArguments(definition, command, {
        original: effectiveArguments,
        effective: effectiveArguments,
        complete: true,
      })
      if ('failure' in cut) return unavailable('arguments')
      const parsed = slot.author.parameters.parse(cut.ok)
      if ('failure' in parsed) return unavailable('arguments')
      const describe = slot.describeRelease
      let described: unknown
      try {
        described = await within(
          () => describe({ principal, tenant, arguments: parsed.ok }),
          policy.timeoutMs,
        )
      } catch {
        return unavailable('threw')
      }
      if (described === TIMED_OUT) return unavailable('timeout')
      const declared =
        definition.kind === 'commands'
          ? definition.commands.find(entry => entry.name === command)?.release?.detail
          : undefined
      const judged = judgeReleaseDescription(described, declared, policy)
      if ('failure' in judged) return unavailable(judged.failure)
      if (
        judged.ok.typed !== undefined &&
        declared !== undefined &&
        !(await fitsSchema(input.provider, declared, judged.ok.typed.value))
      )
        return unavailable('typed-schema')
      return { kind: 'detail', ...judged.ok }
    },
  }
}
