import { slot } from './shape.ts'

export {
  readToolOperation,
  readToolRegistration,
  type ToolOperationSlot,
  type ToolRegistrationSlot,
} from './registration.ts'
export type OwnSlot = ReturnType<typeof slot>
export { slot as readOwnSlot }
