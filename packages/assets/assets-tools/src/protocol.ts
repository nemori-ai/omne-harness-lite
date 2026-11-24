import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const extensionsAdoption = describedAdoption({
  owner: '@omne-harness/assets-tools',
  name: 'extensions-protocol',
  revision: '1',
  changes: 'One declaration over the management and publishing services of the assets.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/assets-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
export const limits = {
  maxBytes: 262_144,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 1024,
  maxStringLength: 65_536,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('OmneExtensions protocol JSON is not bounded')
  return read.value
}

export const extensionsCommandNames = [
  'help',
  'categories',
  'list',
  'show',
  'export',
  'impact',
  'publish',
  'enable',
  'disable',
  'remove',
  'result',
] as const
export type ExtensionsCommandName = (typeof extensionsCommandNames)[number]

/** Category and name are open strings: they are checked against what exists at the call, never against a list here. */
const name = z.string().min(1).max(200)
const id = z.string().min(1).max(200)
const path = z.string().min(1).max(1000)
const held = z.strictObject({ id, category: name, name })

const shapes = {
  help: z.strictObject({
    name: z.enum(extensionsCommandNames).optional(),
    category: name.optional(),
  }),
  categories: z.strictObject({}),
  list: z.strictObject({
    category: name,
    after: z.string().min(1).max(400).optional(),
    limit: z.int().min(1).max(100).optional(),
  }),
  show: z.strictObject({ category: name, name }),
  export: z.strictObject({ category: name, name, dir: path }),
  impact: z.strictObject({
    category: name,
    dir: path.optional(),
    name: name.optional(),
    change: z.enum(['publish', 'enable', 'disable', 'remove']).optional(),
  }),
  publish: z.strictObject({
    id,
    category: name,
    name,
    dir: path.optional(),
    data: z.unknown().optional(),
  }),
  enable: held,
  disable: held,
  remove: held,
  result: z.strictObject({ id }),
} as const satisfies Record<ExtensionsCommandName, z.ZodType>

export type ExtensionsArguments = {
  [K in ExtensionsCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[ExtensionsCommandName]
export type ArgumentsOf<K extends ExtensionsCommandName> = Extract<
  ExtensionsArguments,
  { command: K }
>

export const extensionsSummaries: Readonly<Record<ExtensionsCommandName, string>> = {
  help: 'Read command usage. With publish and a category: the layout that category asks for.',
  categories:
    'List the categories that exist now, each with a line from its owner on what it is and how one is made: from a directory, from a body, or not through this tool.',
  list: 'List what the tenant holds in one category: name, version, enabled.',
  show: 'Read one held extension: version, enabled, origin, summary, what it places and whether each is in effect, with the reason when it is not.',
  export:
    'Write the files of a held extension into a directory, so they can be edited and published again. Changes nothing that is held.',
  impact:
    'What would change if this were done: which contributions would appear, go away, or stop being in effect. Changes nothing. Give dir for a directory not yet published, or name for a held one.',
  publish:
    'Publish a new version and hold it. A new holding is enabled, so it takes effect at once; a held one that follows the latest moves to the new version at once.',
  enable: 'Enable a held extension. It takes effect at once.',
  disable:
    'Disable a held extension and keep it. It stops taking effect at once; what it had replaced comes back.',
  remove: 'Remove the holding.',
  result: 'Recall what the publish, enable, disable or remove with this id did.',
}

export function extensionsContract(command: ExtensionsCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[command])
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function extensionsParameterCodec(
  command: ExtensionsCommandName,
): ParameterCodec<ExtensionsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: extensionsAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[command].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path: at, message }) =>
          at.length === 0 ? message : `${at.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      return succeed({ command, params: parsed.data } as ExtensionsArguments)
    },
  }
}
