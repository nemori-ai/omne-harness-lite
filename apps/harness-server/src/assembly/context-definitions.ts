// The assembly's `SessionContextDefinitions` (AD-12, `context-input.ts`「The definitions」): what JSON
// cannot hold, given back from one exact adopted definition. A need binding's shape and translation
// and a stateful block's schema and reducer are functions, so a Context material only references
// them, and the assembly, which adopted the definitions, gives them back. AD-12 compares by object
// identity (`definitions.binding(ref) !== binding`), so one table is built once from the declared
// blocks and every query returns the object it was built from, never a copy.
//
// The definitions the M2 release adopts declare no Context block: the mapping table of the
// `agent-adoptions` row (`rows/agent-adoptions/config.ts`) has no field that could carry one, and an
// `AgentDefinition` holds asset references and attribute items only (agent-contract
// `definition.ts`). So `adoptedContextDefinitions` is the table over no declaration and answers
// every query `undefined`: the material is then not restorable because there is nothing to restore.
// That is the truthful answer of the release, not a stand-in. A release that adopts a definition
// with Context blocks lists it in `ADOPTED` with the functions of the member that owns them.
import type {
  ContextBlockKey,
  NeedBinding,
  StatefulBlockDescriptor,
} from '@omne-harness/runtime-context-contract'
import type { SessionContextDefinitions } from '@omne-harness/session-adapters/cordis'
import type { Adoption } from '@omne-harness/session-contract'

/** The Context blocks that one exact adopted definition declares. */
export type DeclaredContextBlocks = Readonly<{
  definition: Adoption
  /** The need bindings of the definition; one per need name and block key. */
  bindings: readonly NeedBinding[]
  /** The stateful blocks the definition declares; one per block key. */
  declarations: readonly StatefulBlockDescriptor<ContextBlockKey, unknown, unknown>[]
}>

type Declaration = StatefulBlockDescriptor<ContextBlockKey, unknown, unknown>

type DefinitionTable = Readonly<{
  bindings: ReadonlyMap<string, NeedBinding>
  declarations: ReadonlyMap<ContextBlockKey, Declaration>
}>

/** The exact adoption: every field counts, the digest included. */
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

/**
 * One table over the declared blocks of the adopted definitions, built once. A query of a
 * definition, need or key the table does not hold is `undefined`. A table that lists one definition
 * twice, binds one need and key twice or declares one key twice is refused at construction.
 */
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

/** The declared Context blocks of the definitions the release adopts: none (see the module comment). */
const ADOPTED: readonly DeclaredContextBlocks[] = []

/** The definitions of the release, for the `session-ad12` row. */
export const adoptedContextDefinitions: SessionContextDefinitions =
  createContextDefinitions(ADOPTED)
