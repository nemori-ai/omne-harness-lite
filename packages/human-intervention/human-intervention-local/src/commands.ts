import { WAIT_PLANNER, WAIT_WRITER } from './wait-schema.ts'
import type { FactCommandV2 } from '@omne-harness/sql-contract'
import type { WaitRef } from '@omne-harness/human-intervention'
import { digest, json } from './encoding.ts'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import {
  REQUEST_PLANNER,
  REQUEST_WRITER,
  SqlCommandSchema,
  type SqlCommand,
} from './request-schema.ts'
import { IndependentCommandSchema, type IndependentCommand } from './independent-schema.ts'

export function independentControlCommands(input: IndependentCommand): readonly FactCommandV2[] {
  const parsed = IndependentCommandSchema.parse(input)
  if (parsed.kind === 'request') return independentRequestCommands(parsed.input, parsed.waitRef)
  const operation = parsed.kind === 'prepare' ? parsed.operation : parsed.command.operation
  const binding = { operationRef: operation, inputDigest: digest(parsed) }
  return [
    { participant: TERMINAL_PARTICIPANT, facts: { kind: 'consume', binding: json(binding) } },
    { participant: WAIT_PLANNER, facts: { input: json(parsed) } },
    { participant: REQUEST_PLANNER, facts: { binding: json(binding) } },
    { participant: WAIT_WRITER, facts: { binding: json(binding) } },
  ]
}
export function independentRequestCommands(
  input: SqlCommand,
  waitRef: WaitRef,
): readonly FactCommandV2[] {
  const parsed = SqlCommandSchema.parse(input)
  const binding = { operationRef: parsed.command.operation, inputDigest: digest(parsed) }
  return [
    { participant: TERMINAL_PARTICIPANT, facts: { kind: 'consume', binding: json(binding) } },
    {
      participant: WAIT_PLANNER,
      facts: { input: json({ kind: 'request', input: parsed, waitRef }) },
    },
    { participant: REQUEST_PLANNER, facts: { input: json(parsed) } },
    { participant: WAIT_WRITER, facts: { binding: json(binding) } },
    { participant: REQUEST_WRITER, facts: { binding: json(binding) } },
  ]
}
