import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import type { SwitchTarget } from './port.ts'

const OWNER = '@omne-harness/workspace-tools'
export const switchAdoption = describedAdoption({
  owner: OWNER,
  name: 'switch-workspace-protocol',
  revision: '1',
  changes: 'One target of three: a directory, a workspace, or none.',
})
const vocabulary = describedAdoption({
  owner: OWNER,
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 16_384,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 4096,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('SwitchWorkspace protocol JSON is not bounded')
  return read.value
}

const text = { type: 'string', minLength: 1, maxLength: 4096 }
const DESCRIPTIONS = {
  directory:
    'The absolute path of a directory: the root of an instance of a workspace you can use, or another working copy of the repository of the current workspace. Such a working copy is made an instance of the current workspace first; create it beforehand, for example with git worktree add.',
  workspace: 'The id of a workspace you can use. It must have exactly one instance.',
  none: 'true: work in no workspace, in the default directory.',
}

export const switchContract: ParameterContract = {
  schema: tree({
    type: 'object',
    additionalProperties: false,
    properties: { directory: text, workspace: text, none: { const: true } },
  }),
  vocabulary,
  descriptions: Object.entries(DESCRIPTIONS).map(([path, description]) => ({
    path,
    text: description,
  })),
}

const shape = z.strictObject({
  directory: z.string().min(1).max(4096).optional(),
  workspace: z.string().min(1).max(4096).optional(),
  none: z.literal(true).optional(),
})
const ONE = 'give exactly one of directory, workspace, none'

function targetOf({ directory, workspace, none }: z.infer<typeof shape>): SwitchTarget | null {
  const given = [directory, workspace, none].filter(value => value !== undefined).length
  if (given !== 1) return null
  if (directory !== undefined) return { kind: 'directory', directory }
  return workspace === undefined ? { kind: 'none' } : { kind: 'workspace', workspace }
}

const strictJson = createDefaultParameterCodec(limits)

/** Unknown fields, a wrong type, and none or more than one target are invalid. */
export function switchParameterCodec(): ParameterCodec<SwitchTarget> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: switchAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const params = shape.safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!params.success) return fail({ kind: 'invalid', reason: params.error.message })
      const target = targetOf(params.data)
      return target === null ? fail({ kind: 'invalid', reason: ONE }) : succeed(target)
    },
  }
}
