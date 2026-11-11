import { readAttemptTerminal } from './attempt-terminal.ts'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  PREPARATION_READ,
  preparationReadSchema,
  type PreparationRead,
} from './preparation-read-schema.ts'
import { readSettingsIntent, readSettingsAttempt } from './intent-records.ts'
import { readStandingCustody } from './standing-custody.ts'
import { readSourceCustody, listSourceCustody } from './source-custody.ts'
import { json } from './encoding.ts'

function observe(port: ReadPort, request: PreparationRead) {
  switch (request.kind) {
    case 'terminal':
      return readAttemptTerminal(port, request.binding)
    case 'root':
      return readSettingsIntent(port, request.identity)
    case 'attempt':
      return readSettingsAttempt(port, request.input.identity, request.input.attemptId)
    case 'standing':
      return readStandingCustody(port, request.input.identity, request.input.attemptId)
    case 'source':
      return readSourceCustody(port, request.input)
    case 'sources':
      return listSourceCustody(port, request.input)
  }
}
export default {
  ...PREPARATION_READ,
  read(input, port) {
    return { kind: 'read', output: json(observe(port, preparationReadSchema.parse(input))) }
  },
} satisfies ReadHandlerModule
