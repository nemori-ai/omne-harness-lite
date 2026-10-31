// The `./binding` entry: the readers of the author capability that an operation handle and an
// author registration keep, and the own-property reader that every implementation uses to read
// an untrusted value the same way. Only a trusted execution-binding provider (G7) or a Tool
// implementation imports this entry. The root entry does not export these readers, because a
// handle and a registration hide the executor from every other holder; no script, catalog or
// consumer receives them.
import { slot } from './shape.ts'

export {
  readToolOperation,
  readToolRegistration,
  type ToolOperationSlot,
  type ToolRegistrationSlot,
} from './registration.ts'
/** What `readOwnSlot` answers: the property is absent, an accessor, or holds a value. */
export type OwnSlot = ReturnType<typeof slot>
export { slot as readOwnSlot }
