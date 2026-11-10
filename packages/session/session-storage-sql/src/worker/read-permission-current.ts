import {
  SESSION_PERMISSION_CURRENT_HANDLER,
  SessionPermissionReadSchema,
} from '../permission-current.ts'
import { readPermissionCurrent } from './permission-current.ts'
import { handler } from './support.ts'

export default handler(SESSION_PERMISSION_CURRENT_HANDLER, (input, port) =>
  readPermissionCurrent(port, SessionPermissionReadSchema.parse(input)),
)
