import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { refused } from './notices.ts'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'background-call' | 'stop-call'>

const UNREAD = '租户读不懂'
const said = (answer: Readonly<{ outcome: string }>, prefix: string): string | null =>
  answer.outcome === 'succeeded' ? null : refused(answer.outcome, prefix).text

/** The two controls of one tool call the run is waiting on; each answers null, or why it did not happen. */
export class CallControls {
  readonly #client: Client

  constructor(client: Client) {
    this.#client = client
  }

  async background(scope: string, session: string, call: string): Promise<string | null> {
    const tenant = readTenantText(scope)
    if (tenant === undefined) return UNREAD
    const producer = { kind: 'tool', call } as const
    const controlId = crypto.randomUUID()
    const answer = await notSent(() =>
      this.#client['background-call']({ tenant, session, controlId, producer }),
    )
    return said(answer, '没有转到后台：')
  }

  async stop(scope: string, session: string, call: string): Promise<string | null> {
    const tenant = readTenantText(scope)
    if (tenant === undefined) return UNREAD
    const producer = { kind: 'tool', call } as const
    const controlId = crypto.randomUUID()
    const answer = await notSent(() =>
      this.#client['stop-call']({ tenant, session, controlId, producer }),
    )
    return said(answer, '没有停掉这个调用：')
  }
}
