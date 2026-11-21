import { useEffect, useMemo, useState } from 'react'
import type {
  HumanInterventionCardItem,
  HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import { CardsHub, SessionCards } from '@omne-harness/human-intervention-ui'
import '@omne-harness/human-intervention-ui/human-intervention-ui.css'
import type { ClientOf } from '@omne-harness/sdk/core'

/**
 * The decision paper drawn from card data, for the states the real app cannot be brought to on purpose (R7): a
 * section closed elsewhere. The cards are the walk's own question and a release card; a client in the page lists
 * them, says the question was already decided elsewhere when it is submitted, and lists the release card after.
 */
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_visualwalk00000001'
const TENANT_REF = 'tenant-specimen'

const ref = (cardId: string) => ({
  request: { tenantRef: TENANT_REF, requestId: `request-${cardId}` },
  cardId,
})

const QUESTION: HumanInterventionCardItem = {
  card: {
    kind: 'pending',
    ref: ref('port'),
    revision: '1',
    question: {
      kind: 'question',
      cardId: 'port',
      title: '开发服务器用哪个端口？',
      description: '8080 被本机另一个进程占用。',
      declineConsequence: '跳过之后这一轮按没有回答继续。',
      options: [
        { id: 'p8081', label: '8081（推荐）', description: '下一个空闲的端口。' },
        { id: 'p3000', label: '3000', description: '框架的缺省端口。' },
      ],
    },
  },
  origin: { kind: 'tool', sessionRef: SESSION, toolCallRef: 'call-ask' },
  displayContext: 'Ask',
}

const option = (id: string, label: string, scope: string, offered: boolean, lasting: boolean) => ({
  id,
  label,
  description: scope,
  offered,
  lasting,
})

const RELEASE: HumanInterventionCardItem = {
  card: {
    kind: 'pending',
    ref: ref('release'),
    revision: '1',
    question: {
      kind: 'release',
      cardId: 'release',
      title: '删除资料「搬家清单草稿」',
      description: '',
      declineConsequence: '这一次调用不执行。',
      target: { tool: 'Shell', command: 'execute', preview: 'rm 资料库/搬家清单草稿.md' },
      gateTitle: '执行命令',
      arguments: { text: '{"script":"rm 资料库/搬家清单草稿.md"}', truncated: false, digest: '' },
      origin: { session: SESSION, agent: 'exe-visual' },
      options: [
        option('deny-once', '这一次不放行', '只对这一次调用。', true, false),
        option('allow-once', '这一次放行', '只对这一次调用。', true, false),
        option('allow-session', '这个会话里都放行', '这个会话里同一类动作。', true, true),
        option('allow-always', '以后都放行', '以后同一类动作。', true, true),
        option('deny-always', '以后都不放行', '以后同一类动作。', true, true),
      ],
    },
  },
  origin: { kind: 'admission', sessionRef: SESSION },
  displayContext: '',
}

type Client = ClientOf<HumanInterventionProtocol>

function specimenClient(): Client {
  let pending: HumanInterventionCardItem[] = [QUESTION, RELEASE]
  const wakers = new Set<() => void>()
  const changed = () => {
    for (const wake of wakers) wake()
  }
  const page = () => ({
    outcome: 'succeeded',
    body: { items: pending, next: null, snapshotRef: 'specimen', completeness: 'complete' },
  })
  return {
    'list-cards': async () => page(),
    'read-card': async () => ({ outcome: 'unavailable' }),
    'submit-reply': async (body: { card: { cardId: string } }) => {
      pending = pending.filter(item => item.card.ref.cardId !== body.card.cardId)
      queueMicrotask(changed)
      return {
        outcome: 'succeeded',
        body: {
          kind: 'already-decided',
          decision: {
            ref: {
              card: ref(body.card.cardId),
              decisionId: 'decided-elsewhere',
              submission: { tenantRef: TENANT_REF, actorRef: 'elsewhere', operationId: 'o' },
            },
            reply: { kind: 'selection', optionId: 'p3000' },
            basisRef: 'basis',
            commitReceipt: 'receipt',
          },
        },
      }
    },
    'query-submit-reply': async () => ({ outcome: 'unknown' }),
    observe: {
      'observe-cards': (_open: unknown, options: { signal: AbortSignal }) =>
        (async function* frames() {
          while (!options.signal.aborted) {
            await new Promise<void>(resolve => {
              wakers.add(resolve)
              options.signal.addEventListener('abort', () => resolve(), { once: true })
            })
            wakers.clear()
            if (!options.signal.aborted) yield { kind: 'changed' }
          }
          return { kind: 'aborted' }
        })(),
    },
  } as unknown as Client
}

export function DecisionSpecimen() {
  const hub = useMemo(() => new CardsHub({ client: specimenClient() }), [])
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <main className="specimen-decision" data-specimen={ready ? 'ready' : 'loading'}>
      <SessionCards hub={hub} tenant={TENANT} session={SESSION} />
    </main>
  )
}
