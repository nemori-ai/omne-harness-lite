import type { TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import type {
  Asker,
  CommandEntry,
  EntrySource,
  Origin,
  Param,
  Taken,
} from '@omne-harness/slash-command-contract'
import type { PromptBody } from './contract.ts'

export const PROMPT_SPACE = 'prompt'

/** One prompt command as the asker's layers have it: the one in force with where it came from, or a disabled one. */
export type PromptHolding =
  | Readonly<{
      kind: 'in-force'
      body: PromptBody
      from: Readonly<{ layer: string; version: string; digest: string }>
    }>
  | Readonly<{ kind: 'disabled'; name: string }>

export type PromptSourcePorts<P> = Readonly<{
  held(asker: Asker<P>): Promise<Outcome<readonly PromptHolding[], 'unavailable'>>
  one(asker: Asker<P>, name: string): Promise<Outcome<PromptHolding | null, 'unavailable'>>
  changes?(tenant: TenantId, changed: () => void): () => void
}>

const DISABLED = 'This prompt command is disabled.'

/** The arguments an argument hint names, each word one; a word in square brackets may be left out. */
export function paramsOf(hint: string): readonly Param[] {
  return hint
    .split(/\s+/u)
    .filter(Boolean)
    .map(word => {
      const optional = word.startsWith('[') && word.endsWith(']')
      const name = word.replace(/^[<[]|[>\]]$/gu, '')
      return optional ? { name, optional: true } : { name }
    })
}

function entryOf(holding: PromptHolding): CommandEntry {
  if (holding.kind === 'disabled')
    return {
      space: PROMPT_SPACE,
      name: holding.name,
      kind: 'prompt',
      title: holding.name,
      unavailable: DISABLED,
    }
  const { name, description, argumentHint } = holding.body
  return {
    space: PROMPT_SPACE,
    name,
    kind: 'prompt',
    title: description,
    ...(argumentHint === undefined ? {} : { hint: argumentHint, params: paramsOf(argumentHint) }),
  }
}

/** The prompt commands of the asker's layers as command entries; taking one hands over its prompt with where it came from. */
export function createPromptEntrySource<P>(ports: PromptSourcePorts<P>): EntrySource<P> {
  return {
    name: PROMPT_SPACE,
    space: PROMPT_SPACE,
    async list(asker) {
      const held = await ports.held(asker)
      return 'ok' in held ? succeed(held.ok.map(entryOf)) : held
    },
    async take(asker, { name }): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>> {
      const one = await ports.one(asker, name)
      if (!('ok' in one)) return one
      if (one.ok === null || one.ok.kind === 'disabled') return fail('not-listed')
      const origin: Origin = { name: `${PROMPT_SPACE}:${name}`, ...one.ok.from }
      return succeed({ kind: 'text', text: one.ok.body.prompt, origin })
    },
    ...(ports.changes === undefined ? {} : { watch: ports.changes }),
  }
}
