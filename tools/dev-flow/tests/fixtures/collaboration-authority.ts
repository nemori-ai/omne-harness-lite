import { canonical, digest } from '../../src/integration/parse.ts'
import { parsePolicy } from '../../src/integration/policy.ts'
import { dispatchComment } from '../../src/delivery/dispatch.ts'
import { BINDING_MARKERS, type TaskBindingV2 } from '../../src/delivery/binding.ts'
import type { CollaborationScope } from '../../src/delivery/collaboration-scope.ts'
import { SCOPE_MARKER, STOP_MARKER } from '../../src/delivery/collaboration-scope.ts'
import type { GhRead } from '../../src/delivery/github-read.ts'
import { policyDocument } from './integration.ts'
import { BASE, context, evidence, NEXT_UUID, TOOL, UUID } from './collaboration.ts'

export const policy = parsePolicy(policyDocument(BASE, 'unused'))
export const responsibility = '卡负责人 @owner；主结果接受者 @acceptor；授权依据为本卡具名决定'

export function scope(): CollaborationScope {
  return {
    schemaVersion: 1,
    context: { ...context },
    epoch: UUID,
    lines: [{ lineParent: 10, login: 'line-owner' }],
    workflow: { path: '.github/workflows/integration-request.yml', ref: 'github-gate', head: TOOL },
    previous: null,
    acceptanceResponsibility: null,
  }
}

export function taskBinding(commentId = 1, revision = 1): TaskBindingV2 {
  return {
    schemaVersion: 2,
    issue: {
      repository: context.repo,
      number: 100,
      id: 'I_100',
      url: 'https://github.com/owner/repo/issues/100',
    },
    revision,
    attempt: `100-r${revision}-a1`,
    responsible: 'owner',
    branch: 'owner/collaboration',
    route: { kind: 'track', track: 'runtime' },
    completionTarget: 'track',
    taskBase: BASE,
    writeScope: ['tools/dev-flow'],
    dispatch: `https://github.com/owner/repo/issues/100#issuecomment-${commentId}`,
    conditions: [],
    authorization: ['https://github.com/owner/repo/issues/100'],
    line: 'integration',
    nature: 'integration',
    contractChange: 'none',
    milestone: 'Fixture milestone',
  }
}

export function block(marker: string, value: unknown): string {
  return `\`\`\`json ${marker}\n${canonical(value)}\n\`\`\`\n`
}

export function rawComment(
  id: number,
  body: string,
  time = '2026-10-27T09:00:00Z',
  author = 'owner',
) {
  return {
    id,
    body,
    html_url: `https://github.com/owner/repo/issues/100#issuecomment-${id}`,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/100',
    user: { login: author, node_id: `U_${author}`, type: 'User' },
    created_at: time,
    updated_at: time,
  }
}

export function dispatch(binding = taskBinding(), value = scope(), id = 1, time?: string) {
  return rawComment(
    id,
    dispatchComment(block(SCOPE_MARKER, value), {
      schemaVersion: 1,
      responsible: binding.responsible,
      basis: ['Fixture authorized dispatch'],
      action: 'dispatch',
      task: binding,
      confirmations: [],
    }),
    time,
    binding.responsible,
  )
}

export function backend(binding = taskBinding(), comments = [dispatch(binding)]) {
  const data = {
    number: 100,
    node_id: 'I_100',
    html_url: binding.issue.url,
    state: 'open',
    body: `- 交付修订：${binding.revision}\n- 卡负责人、主结果接受者及授权依据：${responsibility}\n\n${block(BINDING_MARKERS[2], binding)}`,
    updated_at: '2026-10-27T12:00:00Z',
    labels: [],
    milestone: { number: 1, title: 'Fixture milestone' },
  }
  const calls: string[] = []
  const reviewers = [{ type: 'User', reviewer: { login: 'owner', node_id: 'U_owner' } }]
  const read: GhRead = argv => {
    const path = argv.at(-1) ?? ''
    calls.push(path)
    if (path === 'repos/owner/repo/issues/100') return { ...data, comments: comments.length }
    if (path === 'repos/owner/repo/environments/publish')
      return { protection_rules: [{ type: 'required_reviewers', reviewers }] }
    const page = /issues\/100\/comments\?per_page=100&page=(\d+)$/.exec(path)
    if (page !== null) return comments.slice((Number(page[1]) - 1) * 100, Number(page[1]) * 100)
    const single = /issues\/comments\/(\d+)$/.exec(path)
    if (single !== null) {
      const comment = comments.find(item => item.id === Number(single[1]))
      if (comment !== undefined) return comment
      throw new Error('404 missing comment fixture')
    }
    throw new Error(`Unexpected endpoint ${path}`)
  }
  return { data, comments, reviewers, calls, read }
}

export function historyBackend(oldOwner = 'owner') {
  const oldBinding = taskBinding()
  oldBinding.responsible = oldOwner
  oldBinding.branch = `${oldOwner}/collaboration`
  const old = dispatch(oldBinding)
  const stopped = rawComment(
    2,
    block(STOP_MARKER, {
      schemaVersion: 1,
      context,
      epoch: UUID,
      writer: oldOwner,
      stopped: true,
      evidence: [evidence],
    }),
    '2026-10-27T10:00:00Z',
  )
  const currentScope = scope()
  currentScope.context.planRevision = 2
  currentScope.epoch = NEXT_UUID
  currentScope.previous = {
    dispatch: { issue: 100, commentId: 1, sha256: digest(old.body) },
    stopped: { issue: 100, commentId: 2, sha256: digest(stopped.body) },
  }
  const binding = taskBinding(3, 2)
  const current = dispatch(binding, currentScope, 3, '2026-10-27T11:00:00Z')
  return {
    ...backend(binding, [old, stopped, current]),
    old,
    stopped,
    current,
    currentScope,
    binding,
  }
}
