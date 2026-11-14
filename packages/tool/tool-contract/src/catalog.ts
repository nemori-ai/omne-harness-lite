import type { AvailabilityFacts, ToolPresentation } from './authoring.ts'
import type { ToolAvailability, ToolDefinition } from './definitions.ts'

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

const requiredDependencies: Condition = facts =>
  facts.definition.requiredCapabilities
    .filter(name => !facts.dependencies.some(fact => fact.name === name && fact.available))
    .map(name => `dependency-unavailable:${name}`)

const AVAILABILITY_CONDITIONS: readonly Condition[] = [
  unmet(facts => facts.qualification === 'allowed', 'qualification-denied'),
  requiredDependencies,
  unmet(facts => facts.inputCompatible, 'input-incompatible'),
  unmet(facts => facts.outputCompatible, 'output-incompatible'),
  unmet(facts => facts.attachmentsReadable, 'attachments-unreadable'),
]

export function evaluateToolAvailability(facts: AvailabilityFacts): ToolAvailability {
  const reasons = AVAILABILITY_CONDITIONS.flatMap(condition => condition(facts))
  if (reasons.length === 0)
    return Object.freeze({
      kind: 'available',
      definition: facts.definition,
      executor: facts.executor,
      layer: facts.layer,
    })
  return Object.freeze({
    kind: 'known-unavailable',
    definition: facts.definition,
    reason: reasons.join('; '),
  })
}
