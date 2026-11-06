import { REQUEST_WRITER } from './request-schema.ts'
import { TERMINAL_PARTICIPANT } from './terminal-schema.ts'
import { WAIT_CONTROL, WAIT_ACCEPT } from './independent-schema.ts'
export const REQUEST_RELATIONAL_MIGRATION = { owner: REQUEST_WRITER, id: 'hitl-requests-2' }
export const TERMINAL_RELATIONAL_MIGRATION = { owner: TERMINAL_PARTICIPANT, id: 'hitl-terminal-2' }
export const CONTROL_RETIRE_MIGRATION = { owner: WAIT_CONTROL, id: 'independent-control-retire-2' }
export const INBOX_RETIRE_MIGRATION = { owner: WAIT_ACCEPT, id: 'independent-inbox-retire-2' }
