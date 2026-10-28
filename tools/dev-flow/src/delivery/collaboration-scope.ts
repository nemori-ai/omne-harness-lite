import { array, fields, integer, literal, string } from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import { collaborationBlock } from './collaboration-block.ts'
import { fullSha, hash256, parseReference, parseWave, uuid } from './collaboration-values.ts'
import type { CommentReference, WaveIdentity } from './collaboration-records.ts'

export const SCOPE_MARKER = 'omne-collaboration-scope:v1'
export const STOP_MARKER = 'omne-collaboration-stop:v1'
export const RESPONSIBILITY_FIELD = '卡负责人、主结果接受者及授权依据'

export type DeclaredAcceptanceResponsibility = {
  fieldSha256: string
  owner: string
  acceptor: string
  authorization: CommentReference
}

export type CollaborationScope = {
  schemaVersion: 1
  context: WaveIdentity
  epoch: string
  lines: { lineParent: number; login: string }[]
  workflow: { path: string; ref: string; head: string }
  previous: { dispatch: CommentReference; stopped: CommentReference } | null
  acceptanceResponsibility: DeclaredAcceptanceResponsibility | null
}

export function parseCollaborationScope(body: string): CollaborationScope {
  const v = fields(
    collaborationBlock(body, SCOPE_MARKER),
    [
      'schemaVersion',
      'context',
      'epoch',
      'lines',
      'workflow',
      'previous',
      'acceptanceResponsibility',
    ],
    'collaboration scope',
  )
  const lines = array(v.lines, 'scope.lines').map(item => {
    const line = fields(item, ['lineParent', 'login'], 'scope.line')
    return {
      lineParent: integer(line.lineParent, 'lineParent'),
      login: string(line.login, 'login'),
    }
  })
  if (new Set(lines.map(line => line.lineParent)).size !== lines.length)
    throw new InputError('collaboration-scope-duplicate-line')
  const workflow = fields(v.workflow, ['path', 'ref', 'head'], 'scope.workflow')
  const path = string(workflow.path, 'scope.workflow.path')
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(path))
    throw new InputError('collaboration-scope-workflow-path')
  const previous =
    v.previous === null ? null : fields(v.previous, ['dispatch', 'stopped'], 'scope.previous')
  const acceptance =
    v.acceptanceResponsibility === null
      ? null
      : fields(
          v.acceptanceResponsibility,
          ['fieldSha256', 'owner', 'acceptor', 'authorization'],
          'scope.acceptanceResponsibility',
        )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'scope.schemaVersion'),
    context: parseWave(v.context),
    epoch: uuid(v.epoch, 'scope.epoch'),
    lines,
    workflow: {
      path,
      ref: string(workflow.ref, 'scope.workflow.ref'),
      head: fullSha(workflow.head, 'scope.workflow.head'),
    },
    previous:
      previous === null
        ? null
        : {
            dispatch: parseReference(previous.dispatch),
            stopped: parseReference(previous.stopped),
          },
    acceptanceResponsibility:
      acceptance === null
        ? null
        : {
            fieldSha256: hash256(
              acceptance.fieldSha256,
              'scope.acceptanceResponsibility.fieldSha256',
            ),
            owner: string(acceptance.owner, 'scope.acceptanceResponsibility.owner'),
            acceptor: string(acceptance.acceptor, 'scope.acceptanceResponsibility.acceptor'),
            authorization: parseReference(acceptance.authorization),
          },
  }
}
