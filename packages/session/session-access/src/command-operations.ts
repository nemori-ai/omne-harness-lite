import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { OperationAsked } from '@omne-harness/session-contract'
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
type Operation = Exclude<OperationAsked, { invalid: string }>

export type PerformOperation = (
  admitted: Admitted,
  request: Operation,
  controlId: string,
) => Promise<Performed>

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
  fields: Operation['fields']
  controlId: string
}>

async function pickModel({ as, target, fields, controlId }: Ask): Promise<Performed> {
  const model = String(fields['model'])
  return performed(await selectModel(as, NO_LOGIN, { ...target, controlId, model }))
}

async function changeMode({ as, target, fields }: Ask): Promise<Performed> {
  const now = await readPermissionMode(as, NO_LOGIN, target)
  if (now.outcome !== 'succeeded') return performed(now)
  const mode = fields['mode'] as 'never' | 'auto_permission' | 'bypass-permissions'
  const body = { ...target, mode, expectedRevision: now.body.revision }
  return performed(await changePermissionMode(as, NO_LOGIN, body))
}

async function archive({ as, target, controlId }: Ask): Promise<Performed> {
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
      fields: request.fields,
      controlId,
    })
  }
}
