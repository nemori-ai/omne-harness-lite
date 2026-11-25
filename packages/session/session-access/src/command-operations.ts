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

const SAID = ['reason', 'mode', 'model', 'kind'] as const

function performed(answer: Readonly<{ outcome: string; body?: unknown }>): Performed {
  const body = (answer.body ?? {}) as Record<string, unknown>
  const said = SAID.map(key => body[key]).find(value => value !== undefined)
  return { outcome: answer.outcome, detail: typeof said === 'string' ? said : null }
}

type Ask = Readonly<{
  as: Parameters<typeof selectModel>[0] & Parameters<typeof readPermissionMode>[0]
  target: Readonly<{ tenant: Admitted['access']['tenant']; session: string }>
  args: string
  controlId: string
}>

const invalid = (detail: string): Performed => ({ outcome: 'invalid', detail })

async function pickModel({ as, target, args, controlId }: Ask): Promise<Performed> {
  if (args === '' || /\s/u.test(args)) return invalid('name one model')
  return performed(await selectModel(as, NO_LOGIN, { ...target, controlId, model: args }))
}

async function changeMode({ as, target, args }: Ask): Promise<Performed> {
  const mode = PERMISSION_MODES.find(each => each === args)
  if (mode === undefined) return invalid(`name one mode: ${PERMISSION_MODES.join(', ')}`)
  const now = await readPermissionMode(as, NO_LOGIN, target)
  if (now.outcome !== 'succeeded') return performed(now)
  const body = { ...target, mode, expectedRevision: now.body.revision }
  return performed(await changePermissionMode(as, NO_LOGIN, body))
}

async function archive({ as, target, args, controlId }: Ask): Promise<Performed> {
  if (args !== '') return invalid('it takes no arguments')
  return performed(await archiveSession(as, NO_LOGIN, { ...target, controlId }))
}

const OPERATIONS: Readonly<Record<string, (ask: Ask) => Promise<Performed>>> = {
  'select-model': pickModel,
  'change-permission-mode': changeMode,
  'archive-session': archive,
}

/** Does the session protocol's own operation for a command, as the member already let in; nothing of its own. */
export function createOperationPerformer(ports: CommandOperationPorts): PerformOperation {
  return async (admitted, request, controlId) => {
    const run = OPERATIONS[request.operation]
    if (run === undefined) return { outcome: 'unsupported', detail: request.operation }
    return run({
      as: { ...ports, admit: async () => admitted },
      target: { tenant: admitted.access.tenant, session: admitted.access.session },
      args: request.args.trim(),
      controlId,
    })
  }
}
