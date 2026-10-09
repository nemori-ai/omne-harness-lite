import { z } from 'zod'
import {
  capabilityCanonicalString,
  parseCapabilityCanonicalString,
} from '@omne-harness-lite/asset-model'
import type { AttemptId } from '@omne-harness-lite/call-accounts'
import { evaluate, type CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import {
  readReport,
  requiredOwn,
  selectBody,
  type AvailabilityReport,
  type RegistryEntry,
} from '@omne-harness-lite/asset-registry'
import { copyJsonValue, readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  checkKey,
  checkLogPayload,
  compareInteger,
  factLogPayload,
  positiveInteger,
  type LogEntry,
  type SessionLog,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  judgeToolDefinition,
  modelName,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionLifecycleStep } from '@omne-harness-lite/session-runtime'

export const sessionToolActionOwner = 'session-runtime-tool-actions'
export interface SessionToolAdoption {
  readonly kind: 'tools_adopted'
  readonly call: string
  readonly run: string
  readonly attempt: AttemptId
  readonly report: AvailabilityReport
  readonly tools: readonly {
    readonly name: string
    readonly capability: string
    readonly asset: string
    readonly version: string
    readonly definition: ToolDefinition
  }[]
}
const key = z.string().refine(checkKey)
const version = z.string().refine(value => {
  const parsed = readJsonStrict(value)
  return 'ok' in parsed && positiveInteger(parsed.ok)
})
const schema = z
  .object({
    kind: z.literal('tools_adopted'),
    call: key,
    run: key,
    attempt: z.custom<SessionToolAdoption['attempt']>(positiveInteger),
    report: z.custom<AvailabilityReport>(value => {
      if (!value || typeof value !== 'object' || !('session' in value)) return false
      return typeof value.session === 'string' && readReport(value, value.session) !== undefined
    }),
    tools: z.array(
      z
        .object({
          name: key,
          capability: key.refine(value => {
            const parsed = parseCapabilityCanonicalString(value)
            return 'ok' in parsed && parsed.ok.category === 'tool'
          }),
          asset: key,
          version,
          definition: z.custom<ToolDefinition>(value => 'ok' in judgeToolDefinition(value)),
        })
        .strict(),
    ),
  })
  .strict()

function adoptionKey(call: string) {
  return `${sessionToolActionOwner}/1/adoption/${JSON.stringify(call)}`
}
function capture(value: unknown): SessionToolAdoption | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return undefined
  const checked = schema.safeParse(copied.ok)
  if (!checked.success) return undefined
  const adopted = checked.data
  if (
    adopted.report.runId !== adopted.run ||
    compareInteger(adopted.report.attempt, adopted.attempt) !== 0
  )
    return undefined
  if (new Set(adopted.tools.map(tool => tool.name)).size !== adopted.tools.length) return undefined
  if (!adopted.tools.every(toolIdentity)) return undefined
  const permissions = Object.keys(adopted.report.effectivePermissions)
  const names = new Set(adopted.tools.map(tool => tool.name))
  if (permissions.length !== adopted.tools.length || permissions.some(name => !names.has(name)))
    return undefined
  return requiredOwn(adopted)
}
function toolIdentity(tool: SessionToolAdoption['tools'][number]) {
  const capability = parseCapabilityCanonicalString(tool.capability)
  return (
    'ok' in capability &&
    capability.ok.name === tool.definition.name &&
    modelName(tool.definition.name) === tool.name
  )
}

/** Validate only this owner's fact. This check performs no IO and grants no Tool permission. */
export function inspectSessionToolAdoption(
  scope: SessionScope,
  entry: LogEntry,
):
  | { readonly kind: 'other' }
  | { readonly kind: 'adoption'; readonly adoption: SessionToolAdoption }
  | { readonly failure: 'invalidInput' } {
  const payload = checkLogPayload(entry.payload)
  if ('failure' in payload) return payload
  if (payload.kind !== 'fact' || payload.payload.owner !== sessionToolActionOwner)
    return { kind: 'other' }
  if (payload.payload.version !== '1') return { failure: 'invalidInput' }
  const adoption = capture(payload.payload.value)
  if (!adoption || !shellMatches(scope, entry, adoption)) return { failure: 'invalidInput' }
  return { kind: 'adoption', adoption }
}
function shellMatches(scope: SessionScope, entry: LogEntry, value: SessionToolAdoption) {
  return (
    entry.session === scope.session &&
    tenantIdEquals(entry.tenant, scope.tenant) &&
    entry.run === value.run &&
    entry.attempt !== undefined &&
    compareInteger(entry.attempt, value.attempt) === 0 &&
    value.report.session === scope.session &&
    entry.dedupeKey === adoptionKey(value.call)
  )
}

async function adoptedTools(
  scope: SessionScope,
  entries: readonly RegistryEntry[],
  inputs: CurrentEvaluationInputs,
): Promise<SessionToolAdoption['tools'] | undefined> {
  if (!entries.length) return []
  const read = await inputs.read(scope.session, scope.tenant)
  if (!('input' in read)) return undefined
  const evaluated = evaluate(read.input)
  if (!('ok' in evaluated)) return undefined
  const result: SessionToolAdoption['tools'][number][] = []
  for (const entry of entries) {
    const tool = selectedTool(entry, read.input, evaluated.ok)
    if (!tool) return undefined
    result.push(tool)
  }
  return result
}
function selectedTool(
  entry: RegistryEntry,
  input: Extract<Awaited<ReturnType<CurrentEvaluationInputs['read']>>, { input: unknown }>['input'],
  evaluation: Extract<ReturnType<typeof evaluate>, { ok: unknown }>['ok'],
): SessionToolAdoption['tools'][number] | undefined {
  if (entry.capability.category !== 'tool' || entry.content.category !== 'tool') return undefined
  const selected = evaluation.assets.filter(
    asset => asset.asset === entry.asset && modelLogJsonEqual(asset.capability, entry.capability),
  )
  const source = selected[0]
  if (selected.length !== 1 || !source || !modelLogJsonEqual(source.from, entry.from))
    return undefined
  const body = selectBody(input.definitions, source)
  if (!body || !modelLogJsonEqual(body.version.content, entry.content)) return undefined
  const judged = judgeToolDefinition(entry.content.definition)
  if (!('ok' in judged)) return undefined
  return {
    name: modelName(entry.capability.name),
    capability: capabilityCanonicalString(entry.capability),
    asset: entry.asset,
    version: writeJsonLossless(source.version),
    definition: entry.content.definition as unknown as ToolDefinition,
  }
}

/** Confirm the actual adopted table before the original Model IO can start. Unknown never retries. */
export async function persistDriverToolAdoption(input: {
  readonly scope: SessionScope
  readonly log: SessionLog
  readonly preparation: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
  readonly report: AvailabilityReport
  readonly entries: readonly RegistryEntry[]
  readonly inputs: CurrentEvaluationInputs
}): Promise<
  { readonly adoption: SessionToolAdoption; readonly key: string } | { readonly unavailable: true }
> {
  const { log } = input
  const { scope, report, entries, preparation } = requiredOwn({
    scope: input.scope,
    report: input.report,
    entries: input.entries,
    preparation: {
      call: input.preparation.call,
      run: input.preparation.run,
      attempt: input.preparation.attempt,
    },
  })
  if (scope.session !== report.session) return { unavailable: true }
  const tools = await adoptedTools(scope, entries, input.inputs)
  if (!tools) return { unavailable: true }
  const adoption = capture({
    kind: 'tools_adopted',
    call: preparation.call,
    run: preparation.run,
    attempt: preparation.attempt,
    report,
    tools,
  })
  if (!adoption) return { unavailable: true }
  const prefix = await log.readSince(scope.session, 0)
  if ('failure' in prefix) return { unavailable: true }
  const key = adoptionKey(preparation.call)
  const previous = prefix.entries.filter(entry => entry.dedupeKey === key)
  if (previous.length) return recognize(scope, previous, adoption, key)
  const result = await log.append(
    scope.session,
    [
      {
        tenant: scope.tenant,
        run: preparation.run,
        attempt: preparation.attempt,
        dedupeKey: key,
        readKeys: [key],
        payload: factLogPayload(sessionToolActionOwner, '1', adoption),
      },
    ],
    { kind: 'fenced', run: preparation.run, attempt: preparation.attempt },
    { kind: 'tailEquals', tail: prefix.tail },
  )
  return 'positions' in result ? { adoption, key } : { unavailable: true }
}
function recognize(
  scope: SessionScope,
  entries: readonly LogEntry[],
  value: SessionToolAdoption,
  key: string,
) {
  if (entries.length !== 1) return { unavailable: true as const }
  const parsed = inspectSessionToolAdoption(scope, entries[0]!)
  return 'adoption' in parsed && modelLogJsonEqual(parsed.adoption, value)
    ? { adoption: parsed.adoption, key }
    : { unavailable: true as const }
}
