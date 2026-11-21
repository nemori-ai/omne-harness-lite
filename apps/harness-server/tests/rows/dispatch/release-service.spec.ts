// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { CallContext, Dispatch, SessionRef } from '@omne-harness/dispatch-contract'
import { tenantIdSchema } from '@omne-harness/dispatch-contract'
import { dispatchingKey } from '@omne-harness/dispatch-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  toolCallsThenText,
} from '../../support/release-tree.ts'

const textOf = (entries: readonly { kind: string; payload: unknown }[], kind: string) =>
  entries.filter(entry => entry.kind === kind).map(entry => JSON.stringify(entry.payload))

describe('a dispatch on the release tree, asked through the service', () => {
  it(
    'creates an unattended child session, takes its last reply as the report, and sends the report to the dispatching session when no call waits',
    { timeout: 300_000 },
    async () => {
      await onReleaseTree(
        {
          script: toolCallsThenText(() => []),
          permission: 'bypass-permissions',
          extraHistoryKinds: ['message.system_reminder'],
        },
        async tree => {
          const { tenant } = tree.registrar()
          const parent = await tree.startSession('Say hello.')
          await pollUntil(
            'the first run of the parent',
            () => historyOf(tree, parent),
            entries => entries.some(entry => entry.kind === 'run.terminal'),
          )
          const text = tenantCodec.encode(tenant)
          if (!text.ok) throw new Error('the tenant has no text')
          const issued = await toolRuntimeHolder(tree.scope)
            .workPrincipals()
            ?.forSession({ actor: 'coordinator', tenant, session: parent as never })
          if (issued === undefined || !('ok' in issued)) throw new Error(JSON.stringify(issued))
          const dispatching = tree.scope.get(dispatchingKey)
          if (dispatching === undefined) throw new Error('no dispatching service')
          const ctx: CallContext = {
            tenant: tenantIdSchema.parse(text.value),
            subject: issued.ok,
            session: parent as unknown as SessionRef,
          }
          const request = {
            mode: 'delegate',
            agent: 'coding',
            instruction: 'Summarize this in one line: the sky is blue.',
            expectation: 'One line.',
            call: 'call-that-no-tool-made',
          } as const
          const accepted = await dispatching.dispatch(ctx, request)
          if (accepted.kind !== 'done') throw new Error(JSON.stringify(accepted))
          expect(accepted.recalled).toBe(false)
          const { id, session: child } = accepted.value
          expect(await dispatching.dispatch(ctx, request)).toMatchObject({
            kind: 'done',
            recalled: true,
            value: { id, session: child },
          })

          const shown = await pollUntil(
            'the delivery of the report',
            () => dispatching.show(ctx, id),
            answer => answer.kind === 'done' && answer.value.delivery?.kind === 'delivered',
          )
          expect(shown).toMatchObject({
            kind: 'done',
            value: {
              state: 'reported',
              report: { text: 'done', origin: 'final-reply' },
              delivery: { kind: 'delivered', to: 'input' },
            } satisfies Partial<Dispatch>,
          })

          const started = textOf(await historyOf(tree, child), 'message.system_reminder')
          expect(started.some(entry => entry.includes('the sky is blue'))).toBe(true)
          expect(started.some(entry => entry.includes(id) && entry.includes(parent))).toBe(true)
          const arrived = await pollUntil(
            'the report in the parent',
            async () => textOf(await historyOf(tree, parent), 'message.system_reminder'),
            entries =>
              entries.some(entry => entry.includes('arrived after your call stopped waiting')),
          )
          expect(arrived.some(entry => entry.includes(child) && entry.includes('coding'))).toBe(
            true,
          )
          await pollUntil(
            'the run the report woke',
            () => historyOf(tree, parent),
            entries => entries.filter(entry => entry.kind === 'run.terminal').length >= 2,
          )
        },
      )
    },
  )
})
