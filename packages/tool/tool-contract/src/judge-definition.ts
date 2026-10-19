// The closed judgment of a Tool definition (P02, P13, P15).
import { capabilityId } from '@omne-harness/assets'
import type { JsonValue } from '@omne-harness/json-text'
import { judgeModalities, type Modality } from '@omne-harness/modality'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDeclarations, ToolSettingsDeclaration } from './authoring.ts'
import type {
  ParameterContract,
  ToolDefinition,
  ToolDefinitionMetadata,
  ToolProgramDeclaration,
  ToolReturnDeclaration,
} from './definitions.ts'
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

/**
 * The parameter description rules that do not depend on the schema vocabulary: every entry has
 * a path and a non-blank text, and a path is described once. Which parameters a schema declares
 * depends on its vocabulary, and this member has no vocabulary interpreter.
 */
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

export const returnDeclaration: Check<ToolReturnDeclaration> = record({
  kind: literal('ordinary', 'structured'),
  program: programDeclaration,
})

function startsWith(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment)
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && startsWith(left, right)
}

/** P15: settings paths are a closed list, so no path repeats or contains another one. */
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

/** P15: a default value sits at a declared item path. Members outside every item are rejected. */
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

const settingsDeclaration: Check<ToolSettingsDeclaration> = refine(
  record({
    schema: parameterContract,
    defaults: jsonValue,
    items: list(
      record({
        path: nonEmpty(list(filled)),
        category: literal('preference', 'binding', 'placement-identity', 'governance'),
        sensitive: bool,
      }),
    ),
  }),
  (settings, at) =>
    itemOverlap(settings.items, at) ??
    (settings.defaults.kind === 'object'
      ? undeclaredDefault(settings.defaults, [], settings.items, member(at, 'defaults'))
      : { field: member(at, 'defaults'), reason: 'type' }),
)

/** A list of distinct names. */
const names = (check: Check<string>) => unique(list(check), name => name)

/** Every element as it was read: `list` copies the array and rejects a hole or an accessor. */
const element: Check<unknown> = value => succeed(value)

/**
 * A modality declaration: the shared judgment of `@omne-harness/modality` (`type`, `modality`,
 * `duplicate`) over the copy that `list` reads, so an element is read as an own data property.
 * A value outside the four modalities is rejected, never mapped.
 */
const modalities: Check<readonly Modality[]> = (value, at) => {
  const copied = list(element)(value, at)
  if ('failure' in copied) return copied
  const judged = judgeModalities(copied.ok)
  if ('ok' in judged) return judged
  // The copy is an array, so the judgment names an element.
  return reject(item(at, judged.index ?? 0), judged.rejected)
}

export const toolDeclarations: Check<ToolDeclarations> = record({
  adoption,
  environment: nullable(adoption),
  attachments: list(record({ store: filled, mediaTypes: names(filled) })),
  inputModalities: modalities,
  outputModalities: modalities,
  settings: nullable(settingsDeclaration),
})

/** A Tool name follows the asset identity rule: exact and case-sensitive, never normalized. */
const toolName: Check<string> = (value, at) => {
  if (typeof value !== 'string') return reject(at, 'type')
  const identity = capabilityId('tool', value)
  return identity.ok ? succeed(value) : reject(at, identity.rejected)
}

/** A command name is the own key of the command table. It is not trimmed or normalized. */
export const commandName: Check<string> = filled

/** A command summary is one line (P02). */
export const commandSummary: Check<string> = oneLine

const metadataFields = {
  adoption,
  name: toolName,
  description: nonBlank,
  requiredCapabilities: names(filled),
  backgroundAllowed: bool,
  declarations: toolDeclarations,
}
/** `programmable` is optional. An omitted value stays omitted; only boolean `true` permits. */
const metadataOptional = { programmable: bool }

export const toolDefinitionMetadata: Check<ToolDefinitionMetadata> = record(
  metadataFields,
  metadataOptional,
)

const command = record({
  name: commandName,
  summary: commandSummary,
  parameters: variant('kind', {
    declared: record({ kind: literal('declared'), value: parameterContract }),
    'executor-owned': record({ kind: literal('executor-owned') }),
  }),
  returns: returnDeclaration,
})

/** The closed shape of a complete definition, shared with the fixed-request judgment. */
export const toolDefinition: Check<ToolDefinition> = variant('kind', {
  function: record(
    {
      ...metadataFields,
      kind: literal('function'),
      parameters: parameterContract,
      returns: returnDeclaration,
    },
    metadataOptional,
  ),
  commands: record(
    {
      ...metadataFields,
      kind: literal('commands'),
      commands: unique(nonEmpty(list(command)), entry => entry.name, 'name'),
    },
    metadataOptional,
  ),
})

/**
 * Judges an untrusted value as a complete Tool definition (P02). The check is closed: an unknown
 * field, a wrong type, a blank description or summary, a repeated command name and a non-boolean
 * `programmable` are rejected, and `field` names the path. The result is a frozen copy.
 */
export function judgeToolDefinition(
  value: unknown,
): Outcome<ToolDefinition, Readonly<{ field: string; reason: string }>> {
  return judgeUnknown(toolDefinition, value, 'ToolDefinition')
}
