// The module file of the read handler `model.call`. A provider loads a handler by the default export
// of its module file (sql-contract §4.1); the handler itself is in `reads.ts`.
import { callHandler } from './reads.ts'

export default callHandler
