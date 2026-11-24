import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { OperationRequest } from '@omne-harness/session-contract'
import type { Admitted } from './answers.ts'
import { archiveSession } from './archive.ts'
import {
  changePermissionMode,
  readPermissionMode,
  type PermissionModePorts,
} from './permission-mode.ts'
import { selectModel, type SelectModelPorts } from './select-model.ts'

/** How an operation a command asked for came out, said as the operation itself said it. */
export type Performed = Readonly<{ outcome: string; detail: string | null }>

export type CommandOperationPorts = Omit<SelectModelPorts & PermissionModePorts, 'admit'>
export type PerformOperation = (
  admitted: Admitted,
  request: OperationRequest,
  controlId: string,
) => Promise<Performed>

const PERMISSION_MODES = ['never', 'auto_permission', 'bypass-permissions'] as const
const NO_LOGIN = undefined as unknown as LoginIdentity

function performed(answer: Readonly<{ outcome: string; body?: unknown }>): Performed {
  const body = answer.body as Record<string, unknown> | undefined
  const said = body?.['reason'] ?? body?.['mode'] ?? body?.['model'] ?? body?.['kind']
  return { outcome: answer.outcome, detail: typeof said === 'string' ? said : null }
}

/** Does the session protocol's own operation for a command, as the member already let in; nothing of its own. */
export function createOperationPerformer(ports: CommandOperationPorts): PerformOperation {
  return async (admitted, request, controlId) => {
    const as = { ...ports, admit: async () => admitted }
    const target = { tenant: admitted.access.tenant, session: admitted.access.session }
    const args = request.args.trim()
    switch (request.operation) {
      case 'select-model':
        if (args === '' || /\s/u.test(args)) return { outcome: 'invalid', detail: 'name one model' }
        return performed(await selectModel(as, NO_LOGIN, { ...target, controlId, model: args }))
      case 'change-permission-mode': {
        const mode = PERMISSION_MODES.find(each => each === args)
        if (mode === undefined)
          return { outcome: 'invalid', detail: `name one mode: ${PERMISSION_MODES.join(', ')}` }
        const now = await readPermissionMode(as, NO_LOGIN, target)
        if (now.outcome !== 'succeeded') return performed(now)
        const body = { ...target, mode, expectedRevision: now.body.revision }
        return performed(await changePermissionMode(as, NO_LOGIN, body))
      }
      case 'archive-session':
        if (args !== '') return { outcome: 'invalid', detail: 'it takes no arguments' }
        return performed(await archiveSession(as, NO_LOGIN, { ...target, controlId }))
      default:
        return { outcome: 'unsupported', detail: request.operation }
    }
  }
}
