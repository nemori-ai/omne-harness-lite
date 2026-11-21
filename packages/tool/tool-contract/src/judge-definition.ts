import { capabilityId } from '@omne-harness/assets'
import type { JsonValue } from '@omne-harness/json-text'
import { judgeModalities, type Modality } from '@omne-harness/modality'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ToolDeclarations,
  ToolSettingPresentation,
  ToolSettingsDeclaration,
} from './authoring.ts'
import type { ToolImplementationDeclaration } from './authoring.ts'
import type {
  ParameterContract,
  ToolCommandDeclaration,
  ToolDefinition,
  ToolGate,
  ToolImplementationFacts,
  ToolProgramDeclaration,
  ToolBodyDeclaration,
  ToolOffloadingDeclaration,
  ToolPublishedSchema,
  ToolReturnDeclaration,
} from './definitions.ts'
import { COMMAND_CALL_ENCODINGS, flatConflict } from './command-call.ts'
import { jsonObject, jsonValue } from './json-tree.ts'
import {
  bool,
  filled,
  item,
  judgeUnknown,
  list,
  literal,
  member,
  nonBlank,
  nonEmpty,
  nullable,
  oneLine,
  positiveSafeInteger,
  record,
  refine,
  reject,
  unique,
  variant,
  type Check,
  type ShapeRejection,
} from './shape.ts'
import { adoption, schemaIdentity } from './value-shapes.ts'

export const parameterContract: Check<ParameterContract> = record({
  schema: jsonObject,
  vocabulary: adoption,
  descriptions: unique(
    list(record({ path: filled, text: nonBlank })),
    description => description.path,
    'path',
  ),
})

export const programDeclaration: Check<ToolProgramDeclaration> = variant('kind', {
  none: record({ kind: literal('none') }),
  json: record({
    kind: literal('json'),
    contract: adoption,
    schema: schemaIdentity,
    definition: parameterContract,
    maxBytes: positiveSafeInteger,
  }),
})

const publishedSchema: Check<ToolPublishedSchema> = record({
  identity: schemaIdentity,
  definition: parameterContract,
})

const bodyDeclaration: Check<ToolBodyDeclaration> = variant('kind', {
  none: record({ kind: literal('none') }),
  text: record({ kind: literal('text'), codec: adoption }),
  'json-document': record({
    kind: literal('json-document'),
    codec: adoption,
    document: publishedSchema,
  }),
  'json-lines': record({ kind: literal('json-lines'), codec: adoption, record: publishedSchema }),
})

const offloadingDeclaration: Check<ToolOffloadingDeclaration> = record(
  {
    inline: variant('kind', {
      system: record({ kind: literal('system') }),
      bounded: record({ kind: literal('bounded'), maxInlineUtf8Bytes: positiveSafeInteger }),
    }),
    retention: variant('kind', {
      system: record({ kind: literal('system') }),
      bounded: record({ kind: literal('bounded'), maxRetentionMs: positiveSafeInteger }),
    }),
  },
  {
    preview: variant('kind', {
      system: record({ kind: literal('system') }),
      bounded: record({ kind: literal('bounded'), maxPreviewUtf8Bytes: positiveSafeInteger }),
    }),
  },
)

const returnFields = {
  program: programDeclaration,
  body: bodyDeclaration,
  offloading: offloadingDeclaration,
}

export const returnDeclaration: Check<ToolReturnDeclaration> = refine(
  variant('kind', {
    ordinary: record({
      ...returnFields,
      kind: literal('ordinary'),
      value: record({ kind: literal('encoded-value'), codec: adoption, value: publishedSchema }),
    }),
    structured: record({
      ...returnFields,
      kind: literal('structured'),
      value: record({ kind: literal('tool-result'), contract: adoption }),
    }),
  }),
  (value, at) =>
    value.body.kind === 'none' &&
    (value.offloading.inline.kind !== 'system' ||
      value.offloading.retention.kind !== 'system' ||
      (value.offloading.preview ?? { kind: 'system' }).kind !== 'system')
      ? { field: member(at, 'offloading'), reason: 'body-required' }
      : undefined,
)

function startsWith(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment)
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && startsWith(left, right)
}

function itemOverlap(
  items: ToolSettingsDeclaration['items'],
  at: string,
): ShapeRejection | undefined {
  for (const [later, { path }] of items.entries())
    for (const { path: earlier } of items.slice(0, later)) {
      if (!startsWith(path, earlier) && !startsWith(earlier, path)) continue
      const reason = samePath(path, earlier) ? 'duplicate' : 'overlap'
      return { field: member(item(member(at, 'items'), later), 'path'), reason }
    }
  return undefined
}

function undeclaredDefault(
  tree: JsonValue,
  path: readonly string[],
  items: ToolSettingsDeclaration['items'],
  at: string,
): ShapeRejection | undefined {
  if (tree.kind !== 'object') return undefined
  for (const entry of tree.entries) {
    const next = [...path, entry.key]
    const field = member(at, entry.key)
    if (items.some(declared => samePath(declared.path, next))) continue
    const leadsToItem = items.some(declared => startsWith(declared.path, next))
    if (!leadsToItem || entry.value.kind !== 'object') return { field, reason: 'undeclared' }
    const failure = undeclaredDefault(entry.value, next, items, field)
    if (failure !== undefined) return failure
  }
  return undefined
}

const settingPresentation: Check<ToolSettingPresentation> = record(
  {
    title: nonBlank,
    description: nonBlank,
    impact: nonBlank,
    clear: nonBlank,
    adoption: literal('next-read', 'next-boundary', 'reload', 'creation'),
  },
  { localizationKey: filled, unit: nonBlank },
)

const settingsDeclaration: Check<ToolSettingsDeclaration> = refine(
  record({
    schema: parameterContract,
    defaults: jsonValue,
    items: list(
      record({
        path: nonEmpty(list(filled)),
        category: literal('preference', 'binding', 'placement-identity', 'governance'),
        sensitive: bool,
        presentation: settingPresentation,
      }),
    ),
  }),
  (settings, at) =>
    itemOverlap(settings.items, at) ??
    (settings.defaults.kind === 'object'
      ? undeclaredDefault(settings.defaults, [], settings.items, member(at, 'defaults'))
      : { field: member(at, 'defaults'), reason: 'type' }),
)

const names = (check: Check<string>) => unique(list(check), name => name)

const element: Check<unknown> = value => succeed(value)

export const modalities: Check<readonly Modality[]> = (value, at) => {
  const copied = list(element)(value, at)
  if ('failure' in copied) return copied
  const judged = judgeModalities(copied.ok)
  if ('ok' in judged) return judged
  return reject(item(at, judged.index ?? 0), judged.rejected)
}

const environmentDeclaration = record({ adoption, value: jsonValue })

export const toolDeclarations: Check<ToolDeclarations> = record({
  adoption,
  environment: nullable(environmentDeclaration),
  attachments: list(record({ store: filled, mediaTypes: names(filled) })),
  inputModalities: modalities,
  outputModalities: modalities,
  settings: nullable(settingsDeclaration),
})

const toolName: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  const identity = capabilityId('tool', value)
  return identity.ok ? succeed(value) : reject(at, identity.rejected)
}

export const commandName: Check<string> = filled

export const commandSummary: Check<string> = oneLine

const declarationFields = {
  description: nonBlank,
  backgroundAllowed: bool,
  declarations: toolDeclarations,
}
const governanceFields = {
  adoption,
  name: toolName,
  requiredCapabilities: names(filled),
}
const metadataFields = { ...governanceFields, ...declarationFields }
const metadataOptional = { programmable: bool }

export const implementationDeclaration: Check<ToolImplementationDeclaration> =
  record(declarationFields)

const commandFields = {
  name: commandName,
  summary: commandSummary,
  parameters: variant('kind', {
    declared: record({ kind: literal('declared'), value: parameterContract }),
    'executor-owned': record({ kind: literal('executor-owned') }),
  }),
  returns: returnDeclaration,
}
const gateId: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return /^[a-z][a-z0-9-]{0,47}$/u.test(value) ? succeed(value) : reject(at, 'gate-id')
}
const gate = record({ id: gateId, title: oneLine, default: literal('deny', 'ask', 'auto') })
export const toolGates = unique(nonEmpty(list(gate)), entry => entry.id, 'id')
const detailKind: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*@[1-9][0-9]{0,5}$/u.test(value) && value.length <= 128
    ? succeed(value)
    : reject(at, 'detail-kind')
}
export const commandRelease = record(
  { gate: nullable(gateId) },
  { detail: record({ kind: detailKind, schema: jsonObject }) },
)
export const commandModalities = nonEmpty(modalities)
const conditionName: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  return /^[a-z][a-z0-9-]{0,47}$/u.test(value) ? succeed(value) : reject(at, 'condition-name')
}
export const callConditions = nonEmpty(names(conditionName))
const command = record(commandFields, {
  background: record({ unless: names(filled) }),
  release: commandRelease,
  modalities: commandModalities,
  conditions: callConditions,
})

// A command names only a gate its tool declares; a tool declaring none has no gate to name.
export function unknownGateAt(
  gates: readonly Pick<ToolGate, 'id'>[] | undefined,
  commands: readonly Pick<ToolCommandDeclaration, 'release'>[],
): number {
  const ids = new Set((gates ?? []).map(entry => entry.id))
  return commands.findIndex(
    entry => typeof entry.release?.gate === 'string' && !ids.has(entry.release.gate),
  )
}

function releasedGates(
  gates: readonly Pick<ToolGate, 'id'>[] | undefined,
  commands: readonly Pick<ToolCommandDeclaration, 'release'>[],
  at: string,
): Readonly<{ field: string; reason: string }> | undefined {
  const index = unknownGateAt(gates, commands)
  return index < 0
    ? undefined
    : { field: member(member(item(at, index), 'release'), 'gate'), reason: 'unknown-gate' }
}

// A command tool permits the background only where a command declares it, and only if the tool does.
function backgroundDeclared(
  allowed: boolean,
  commands: readonly Pick<ToolCommandDeclaration, 'background'>[],
  at: string,
): Readonly<{ field: string; reason: string }> | undefined {
  const index = commands.findIndex(entry => entry.background !== undefined)
  if (!allowed && index >= 0)
    return { field: member(item(at, index), 'background'), reason: 'background-not-allowed' }
  return allowed && index < 0 ? { field: at, reason: 'no-background-command' } : undefined
}

const functionShapeFields = {
  kind: literal('function'),
  parameters: parameterContract,
  returns: returnDeclaration,
}
const functionShapeOptional = { conditions: callConditions }
const commandsShapeFields = {
  kind: literal('commands'),
  encoding: literal(...COMMAND_CALL_ENCODINGS),
  commands: unique(nonEmpty(list(command)), entry => entry.name, 'name'),
}
const commandsShapeOptional = { guide: nonBlank, gates: toolGates }

function gatesNamed<
  T extends Readonly<{
    gates?: readonly Pick<ToolGate, 'id'>[]
    commands: readonly Pick<ToolCommandDeclaration, 'release'>[]
  }>,
>(check: Check<T>): Check<T> {
  return refine(check, (value, at) =>
    releasedGates(value.gates, value.commands, member(at, 'commands')),
  )
}

function flatCallable<
  T extends Readonly<{
    encoding: string
    commands: readonly Pick<ToolCommandDeclaration, 'name' | 'parameters'>[]
  }>,
>(check: Check<T>): Check<T> {
  return refine(check, (value, at) => {
    if (value.encoding !== 'flat') return undefined
    const conflict = flatConflict(value.commands)
    return conflict === undefined
      ? undefined
      : { field: member(at, 'commands'), reason: `flat-conflict:${conflict}` }
  })
}

export const toolDefinition: Check<ToolDefinition> = variant('kind', {
  function: record(
    { ...metadataFields, ...functionShapeFields },
    { ...metadataOptional, ...functionShapeOptional },
  ),
  commands: refine(
    gatesNamed(
      flatCallable(
        record(
          { ...metadataFields, ...commandsShapeFields },
          { ...metadataOptional, ...commandsShapeOptional },
        ),
      ),
    ),
    (value, at) =>
      backgroundDeclared(value.backgroundAllowed, value.commands, member(at, 'commands')),
  ),
})

const implementationFacts: Check<ToolImplementationFacts> = refine(
  record({
    ...declarationFields,
    implements: variant('kind', {
      function: record(functionShapeFields, functionShapeOptional),
      commands: gatesNamed(flatCallable(record(commandsShapeFields, commandsShapeOptional))),
    }),
  }),
  (value, at) =>
    value.implements.kind === 'commands'
      ? backgroundDeclared(
          value.backgroundAllowed,
          value.implements.commands,
          member(member(at, 'implements'), 'commands'),
        )
      : undefined,
)

export function judgeImplementationFacts(
  value: unknown,
): Outcome<ToolImplementationFacts, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(implementationFacts, value, 'ToolImplementationFacts')
}

export function judgeToolDefinition(
  value: unknown,
): Outcome<ToolDefinition, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(toolDefinition, value, 'ToolDefinition')
}
