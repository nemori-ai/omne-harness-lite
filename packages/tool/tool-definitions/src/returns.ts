import type { Adoption, ToolReturnDeclaration } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { tree } from './protocol.ts'

export const textBody = {
  kind: 'text',
  codec: describedAdoption({
    owner: '@omne-harness/tool-definitions',
    name: 'utf8-text-body',
    revision: '1',
    encoding: 'UTF-8',
  }),
} as const

const stringSchema = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'string-output',
  revision: '1',
  schema: { type: 'string' },
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})

export function textReturns(codec: Adoption): Extract<ToolReturnDeclaration, { kind: 'ordinary' }> {
  return {
    kind: 'ordinary',
    value: {
      kind: 'encoded-value',
      codec,
      value: {
        identity: {
          id: stringSchema.name,
          revision: stringSchema.revision,
          digest: stringSchema.digest,
        },
        definition: {
          schema: tree({ type: 'string' }),
          vocabulary,
          descriptions: [],
        },
      },
    },
    program: { kind: 'none' },
    body: textBody,
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  }
}
