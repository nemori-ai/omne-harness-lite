import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const extensionPointsAdoption = describedAdoption({
  owner: '@omne-harness/plugin-tools',
  name: 'extension-points-protocol',
  revision: '1',
  changes: 'One read-only declaration over the server and client extension trees.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/plugin-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 16_384,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 400,
  maxNumberLength: 16,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('OmneExtensionPoints protocol JSON is not bounded')
  return read.value
}

export const extensionPointsCommandNames = ['help', 'tree', 'find', 'show', 'changes'] as const
export type ExtensionPointsCommandName = (typeof extensionPointsCommandNames)[number]

/** A name is an open string: it is checked against what exists at the call, never against a list here. */
const name = z.string().min(1).max(200)
const side = z.enum(['server', 'client'])

const shapes = {
  help: z.strictObject({ name: z.enum(extensionPointsCommandNames).optional() }),
  tree: z.strictObject({
    side: side.optional(),
    under: name.optional(),
    depth: z.int().min(1).max(32).optional(),
  }),
  find: z.strictObject({
    query: z.string().min(1).max(200),
    side: side.optional(),
    limit: z.int().min(1).max(100).optional(),
  }),
  show: z.strictObject({ name }),
  changes: z.strictObject({ since: z.string().min(1).max(100).optional() }),
} as const satisfies Record<ExtensionPointsCommandName, z.ZodType>

export type ExtensionPointsArguments = {
  [K in ExtensionPointsCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[ExtensionPointsCommandName]
export type ArgumentsOf<K extends ExtensionPointsCommandName> = Extract<
  ExtensionPointsArguments,
  { command: K }
>

export const extensionPointsSummaries: Readonly<Record<ExtensionPointsCommandName, string>> = {
  help: 'Read command usage.',
  tree: 'Show hosts, points, keys and what is placed on them, as an indented tree. Start here when you do not know a name.',
  find: 'Find points and interface parts by the words a person would use ("send button", "chat background"). Returns names to pass to show.',
  show: 'Read one point or one interface part in full: its rules, what a contribution must give, what the host gives it, and what is placed there now. Given a protocol as <name>/v<major>, read each operation with its body field by field and what each field allows.',
  changes:
    'What appeared, went away or changed state since a tree revision: points, categories, contributions. Every result ends with the current revision.',
}

export function extensionPointsContract(command: ExtensionPointsCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[command])
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function extensionPointsParameterCodec(
  command: ExtensionPointsCommandName,
): ParameterCodec<ExtensionPointsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: extensionPointsAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[command].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) =>
          path.length === 0 ? message : `${path.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      return succeed({ command, params: parsed.data } as ExtensionPointsArguments)
    },
  }
}
