import type { ToolReturnDeclaration } from './definitions.ts'
import type { Adoption } from './identity.ts'
import { adoption } from './testing-values.ts'

/** An unconstrained ordinary value for fixtures whose output validator accepts any value. */
export function ordinaryReturnFixture(
  codec: Adoption,
): Extract<ToolReturnDeclaration, { kind: 'ordinary' }> {
  return {
    kind: 'ordinary',
    value: {
      kind: 'encoded-value',
      codec,
      value: {
        identity: { id: 'fixture-value', revision: '1', digest: 'sha256:fixture-value' },
        definition: {
          schema: { kind: 'object', entries: [] },
          vocabulary: adoption('json-schema'),
          descriptions: [],
        },
      },
    },
    program: { kind: 'none' },
    body: { kind: 'text', codec: adoption('utf8') },
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  }
}

export function structuredReturnFixture(
  contract: Adoption,
): Extract<ToolReturnDeclaration, { kind: 'structured' }> {
  return {
    kind: 'structured',
    value: { kind: 'tool-result', contract },
    program: { kind: 'none' },
    body: { kind: 'text', codec: adoption('utf8') },
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  }
}
