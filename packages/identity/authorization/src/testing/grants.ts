import { grantSnapshot, type MaintenanceGrantReading } from '../system-action.ts'
import type { MaintenanceGrantSource } from '../system-reference.ts'

type GrantRequest = Parameters<MaintenanceGrantSource['read']>[0]

export type ScriptedMaintenanceGrants = Readonly<{
  source: MaintenanceGrantSource
  /** Queues answers, one per read, in order. */
  script(...answers: readonly MaintenanceGrantReading[]): void
  /** How many reads the source answered, including reads after the script ran out. */
  calls(): number
  /** The requests of the reads, in order. */
  requests(): readonly GrantRequest[]
}>

function copyOf(answer: MaintenanceGrantReading): MaintenanceGrantReading {
  switch (answer.kind) {
    case 'found':
      return Object.freeze({ kind: 'found', grant: grantSnapshot(answer.grant) })
    case 'none':
      return Object.freeze({ kind: 'none' })
    case 'unavailable':
      return Object.freeze({ kind: 'unavailable', diagnostic: answer.diagnostic })
  }
}

/**
 * A grant source whose every answer is scripted. A read after the script ran out answers
 * `unavailable`: the double never repeats an earlier answer and never grants by default.
 */
export function scriptedMaintenanceGrants(): ScriptedMaintenanceGrants {
  const queue: MaintenanceGrantReading[] = []
  const asked: GrantRequest[] = []
  const source: MaintenanceGrantSource = {
    read: input => {
      asked.push(input)
      const answer = queue.shift()
      return Promise.resolve(
        answer ?? {
          kind: 'unavailable',
          diagnostic: 'the scripted grant source ran out of answers',
        },
      )
    },
  }
  return {
    source,
    script: (...answers) => {
      queue.push(...answers.map(copyOf))
    },
    calls: () => asked.length,
    requests: () => [...asked],
  }
}
