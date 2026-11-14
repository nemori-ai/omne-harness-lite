// AD-12 compares these definitions by object identity, so the table is built once and every query
// returns the object it was built from, never a copy.
import type {
  ContextBlockKey,
  NeedBinding,
  StatefulBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import {
  sessionModesBindings,
  type SessionContextDefinitions,
} from '@omne-harness/session-adapters/cordis'
import { SESSION_MODES_PUBLICATION } from '@omne-harness/session-adapters'
import type { Adoption } from '@omne-harness/session-contract'

export type DeclaredContextBlocks = Readonly<{
  definition: Adoption
  bindings: readonly NeedBinding[]
  declarations: readonly StatefulBlockDescriptor<ContextBlockKey, unknown, unknown>[]
}>

type Declaration = StatefulBlockDescriptor<ContextBlockKey, unknown, unknown>

type DefinitionTable = Readonly<{
  bindings: ReadonlyMap<string, NeedBinding>
  declarations: ReadonlyMap<ContextBlockKey, Declaration>
}>

const adoptionKey = (adoption: Adoption): string =>
  JSON.stringify([adoption.owner, adoption.name, adoption.revision, adoption.digest])

const bindingKey = (need: string, key: ContextBlockKey): string => JSON.stringify([need, key])

function tableOf(declared: DeclaredContextBlocks): DefinitionTable {
  const bindings = new Map<string, NeedBinding>()
  for (const binding of declared.bindings) {
    const at = bindingKey(binding.need.name, binding.key)
    if (bindings.has(at))
      throw new Error(
        `definition ${declared.definition.name} binds need "${binding.need.name}" to ${binding.key} twice`,
      )
    bindings.set(at, binding)
  }
  const declarations = new Map<ContextBlockKey, Declaration>()
  for (const declaration of declared.declarations) {
    if (declarations.has(declaration.key))
      throw new Error(
        `definition ${declared.definition.name} declares block ${declaration.key} twice`,
      )
    declarations.set(declaration.key, declaration)
  }
  return { bindings, declarations }
}

export function createContextDefinitions(
  declared: readonly DeclaredContextBlocks[],
): SessionContextDefinitions {
  const tables = new Map<string, DefinitionTable>()
  for (const entry of declared) {
    const at = adoptionKey(entry.definition)
    if (tables.has(at))
      throw new Error(`definition ${entry.definition.name} is listed twice (${at})`)
    tables.set(at, tableOf(entry))
  }
  const definitions: SessionContextDefinitions = {
    binding: ref =>
      tables.get(adoptionKey(ref.definition))?.bindings.get(bindingKey(ref.need, ref.key)),
    declaration: ref => tables.get(adoptionKey(ref.definition))?.declarations.get(ref.key),
  }
  return Object.freeze(definitions)
}

const ADOPTED: readonly DeclaredContextBlocks[] = [
  {
    definition: SESSION_MODES_PUBLICATION,
    bindings: sessionModesBindings,
    declarations: [],
  },
]

export const adoptedContextDefinitions: SessionContextDefinitions =
  createContextDefinitions(ADOPTED)
