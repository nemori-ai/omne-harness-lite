// Pure catalog projections: the discovery summary and the availability judgment (P02).
import type { AvailabilityFacts, ToolPresentation } from './authoring.ts'
import type { ToolAvailability, ToolDefinition } from './definitions.ts'

/**
 * The discovery summary of a definition. Only boolean `true` is a programmable permission. A
 * multi-command tool lists one line per command; a function tool lists none. The summary does
 * not replace the complete definition when a request assembler builds a model declaration.
 */
export function presentTool(definition: ToolDefinition): ToolPresentation {
  const commands =
    definition.kind === 'commands'
      ? definition.commands.map(command =>
          Object.freeze({ name: command.name, summary: command.summary }),
        )
      : []
  return Object.freeze({
    name: definition.name,
    description: definition.description,
    programmable: definition.programmable === true,
    commands: Object.freeze(commands),
  })
}

type Condition = (facts: AvailabilityFacts) => readonly string[]

function unmet(holds: (facts: AvailabilityFacts) => boolean, reason: string): Condition {
  return facts => (holds(facts) ? [] : [reason])
}

/** Each required capability needs a verified fact that it is available. A missing fact is unmet. */
const requiredDependencies: Condition = facts =>
  facts.definition.requiredCapabilities
    .filter(name => !facts.dependencies.some(fact => fact.name === name && fact.available))
    .map(name => `dependency-unavailable:${name}`)

/** The availability conditions in report order. All must hold for `available`. */
const AVAILABILITY_CONDITIONS: readonly Condition[] = [
  unmet(facts => facts.qualification === 'allowed', 'qualification-denied'),
  requiredDependencies,
  unmet(facts => facts.inputCompatible, 'input-incompatible'),
  unmet(facts => facts.outputCompatible, 'output-incompatible'),
  unmet(facts => facts.attachmentsReadable, 'attachments-unreadable'),
]

/**
 * Judges availability from facts that a trusted caller has already verified. It does no
 * authorization of its own. An unavailable result names every unmet condition, so a caller
 * does not hit the same gap again and again. Optional dependencies are not required.
 */
export function evaluateToolAvailability(facts: AvailabilityFacts): ToolAvailability {
  const reasons = AVAILABILITY_CONDITIONS.flatMap(condition => condition(facts))
  if (reasons.length === 0)
    return Object.freeze({
      kind: 'available',
      definition: facts.definition,
      executor: facts.executor,
    })
  return Object.freeze({
    kind: 'known-unavailable',
    definition: facts.definition,
    reason: reasons.join('; '),
  })
}
