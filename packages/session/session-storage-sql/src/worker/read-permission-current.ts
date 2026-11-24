import {
  SESSION_PERMISSION_CURRENT_HANDLER,
  SessionPermissionCurrentRequestSchema,
} from '../permission-current.ts'
import { readAuthorizations } from './authorization-context.ts'
import { readPermissionCurrent } from './permission-current.ts'
import { handler } from './support.ts'

export default handler(SESSION_PERMISSION_CURRENT_HANDLER, (input, port) => {
  const { consumer, ...request } = SessionPermissionCurrentRequestSchema.parse(input)
  const current = readPermissionCurrent(port, request)
  return current.kind === 'not-ready'
    ? current
    : {
        ...current,
        authorizations: readAuthorizations(port, request, {
          ...request,
          consumer: consumer ?? null,
        }),
      }
})
