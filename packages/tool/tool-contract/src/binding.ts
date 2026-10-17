// The `./binding` entry: the readers of the author capability that an operation handle and an
// author registration keep. Only a trusted execution-binding provider (G7) imports this entry.
// The root entry does not export these readers, because a handle and a registration hide the
// executor from every other holder; no script, catalog or consumer receives them.
export {
  readToolOperation,
  readToolRegistration,
  type ToolOperationSlot,
  type ToolRegistrationSlot,
} from './registration.ts'
