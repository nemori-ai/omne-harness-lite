import { z } from 'zod'
import {
  SESSION_PERMISSION_MODE_HANDLER,
  SessionPermissionModeSchema,
  SessionPermissionReadSchema,
} from '../permission-current.ts'
import { readPermissionHead } from './permission-current.ts'
import binding from './read-binding.ts'
import { handler } from './support.ts'

const scopeSchema = SessionPermissionReadSchema.pick({ tenant: true, session: true })
const creationSchema = z.strictObject({
  kind: z.literal('bound'),
  ...scopeSchema.shape,
  source: SessionPermissionModeSchema.shape.creationSource,
})

export default handler(SESSION_PERMISSION_MODE_HANDLER, (input, port) => {
  const scope = scopeSchema.parse(input)
  const current = readPermissionHead(port, scope)
  if (current.kind === 'not-ready') return current
  const result = binding.read(scope, port)
  if (result.kind !== 'read') throw new Error('Session creation evidence is unavailable')
  const creation = creationSchema.parse(result.output)
  if (creation.tenant !== scope.tenant || creation.session !== scope.session)
    throw new Error('Session creation evidence does not match its permission head')
  return SessionPermissionModeSchema.parse({ ...current, creationSource: creation.source })
})
