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

const modalities: Check<readonly Modality[]> = (value, at) => {
  const copied = list(element)(value, at)
  if ('failure' in copied) return copied
  const judged = judgeModalities(copied.ok)
  if ('ok' in judged) return judged
  return reject(item(at, judged.index ?? 0), judged.rejected)
}

export const environmentDeclaration = record({ adoption, value: jsonValue })

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
const command = record(commandFields)

const functionShapeFields = {
  kind: literal('function'),
  parameters: parameterContract,
  returns: returnDeclaration,
}
const commandsShapeFields = {
  kind: literal('commands'),
  encoding: literal(...COMMAND_CALL_ENCODINGS),
  commands: unique(nonEmpty(list(command)), entry => entry.name, 'name'),
}
const commandsShapeOptional = { guide: nonBlank }

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
  function: record({ ...metadataFields, ...functionShapeFields }, metadataOptional),
  commands: flatCallable(
    record(
      { ...metadataFields, ...commandsShapeFields },
      { ...metadataOptional, ...commandsShapeOptional },
    ),
  ),
})

const implementationFacts: Check<ToolImplementationFacts> = record({
  ...declarationFields,
  implements: variant('kind', {
    function: record(functionShapeFields),
    commands: flatCallable(record(commandsShapeFields, commandsShapeOptional)),
  }),
})

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
