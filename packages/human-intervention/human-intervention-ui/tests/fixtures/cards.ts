import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'

export const TENANT_REF = 'tenant-ref-1'

export function questionItem(cardId = 'card-1', revision = '3'): HumanInterventionCardItem {
  return {
    card: {
      kind: 'pending',
      ref: { request: { tenantRef: TENANT_REF, requestId: `request-${cardId}` }, cardId },
      revision,
      question: {
        kind: 'question',
        cardId,
        title: '用哪个分支发布？',
        description: '有两个候选分支。',
        declineConsequence: '跳过之后这一轮按没有回答继续。',
        options: [
          { id: 'main', label: '主干', description: '从主干发布。' },
          { id: 'next', label: '下一版', description: '' },
        ],
      },
    },
    origin: { kind: 'tool', sessionRef: 'ses_0123456789abcdef', toolCallRef: 'call-1' },
    displayContext: 'Ask',
  }
}

/** The question with a description too long for a button, so a paper of it alone answers in rows under 提交. */
export function rowedItem(cardId = 'card-1', revision = '3'): HumanInterventionCardItem {
  const item = questionItem(cardId, revision)
  const question = item.card.question
  if (question.kind === 'release') return item
  const options = question.options.map(option =>
    option.id === 'main'
      ? { ...option, description: '从主干发布，这是团队约好的默认分支。' }
      : option,
  )
  return { ...item, card: { ...item.card, question: { ...question, options } } }
}

export function extensionItem(cardId = 'card-2'): HumanInterventionCardItem {
  return {
    card: {
      kind: 'pending',
      ref: { request: { tenantRef: TENANT_REF, requestId: `request-${cardId}` }, cardId },
      revision: '1',
      question: {
        kind: 'extension',
        cardId,
        title: '发布窗口开着吗？',
        description: '',
        declineConsequence: '',
        options: [
          { id: 'allow', label: '开着', description: '可以发布。' },
          { id: 'deny', label: '关了', description: '' },
        ],
      },
    },
    origin: { kind: 'agent-extension' },
    displayContext: '',
  }
}

export function releaseItem(cardId = 'card-3'): HumanInterventionCardItem {
  const option = (
    id: string,
    label: string,
    offered: boolean,
    lasting: boolean,
    role: 'approve' | 'reject',
  ) => ({
    id,
    label,
    description: `${label}的作用范围`,
    role,
    offered,
    lasting,
  })
  return {
    card: {
      kind: 'pending',
      ref: { request: { tenantRef: TENANT_REF, requestId: `request-${cardId}` }, cardId },
      revision: '1',
      question: {
        kind: 'release',
        cardId,
        title: '要执行 Shell run，放行吗？',
        description: '',
        declineConsequence: '这一次调用不执行。',
        target: { tool: 'Shell', command: 'run', preview: 'ls -la' },
        gateTitle: '执行',
        arguments: { text: '{"cmd":"ls -la"}', truncated: true, digest: 'digest-of-all' },
        origin: { session: 'ses_0123456789abcdef', agent: 'exe-1' },
        options: [
          option('deny-once', '本次不放行', true, false, 'reject'),
          option('allow-once', '本次放行', false, false, 'approve'),
          option('allow-session', '本会话放行', false, true, 'approve'),
          option('allow-always', '始终放行', false, true, 'approve'),
          option('deny-always', '始终禁止', false, true, 'reject'),
        ],
      },
    },
    origin: { kind: 'admission', sessionRef: 'ses_0123456789abcdef' },
    displayContext: '',
  }
}

export const page = (
  items: readonly HumanInterventionCardItem[],
  next: string | null = null,
  completeness: 'complete' | 'partial' = 'complete',
) => ({
  outcome: 'succeeded' as const,
  body: { items: [...items], next, snapshotRef: 'snap-1', completeness },
})
