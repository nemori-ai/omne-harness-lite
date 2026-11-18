// @module-tag slow
// Slow: runs the release tree in process; reads and changes the permission mode over session/v1.
import { describe, expect, it } from 'vitest'
import { sessionInquiryBinding } from '@omne-harness/session-adapters/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import {
  publishedViewPortsOf,
  readPublishedView,
} from '../../../src/rows/session-ad03/published-view.ts'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { onReleaseTree, type ReleaseTree } from '../../support/release-tree.ts'

type Answer = Readonly<{ status: number; outcome: string; body: Record<string, unknown> }>

let sequence = 0

async function call(tree: ReleaseTree, operation: string, body: object): Promise<Answer> {
  sequence += 1
  const response = await fetch(
    `http://127.0.0.1:${String(tree.port)}/api/session/v1/${operation}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${savedLoginProof(tree.home)}`,
        'content-type': 'application/json',
        'omne-message-id': `m-permission-mode-${String(sequence)}`,
      },
      body: JSON.stringify(body),
    },
  )
  const parsed = JSON.parse(await response.text()) as {
    outcome: string
    body?: Record<string, unknown>
  }
  return { status: response.status, outcome: parsed.outcome, body: parsed.body ?? {} }
}

async function inquiryOf(tree: ReleaseTree, session: string) {
  const ports = publishedViewPortsOf(tree.env.readTrusted('sessionModesInstallation'))
  if (ports === null) throw new Error('no published view ports')
  const { tenant } = tree.registrar()
  const issued = await tree.env
    .readTrusted('sessionWorkPrincipals')
    .get('sessionWorkPrincipals')
    ?.forSession({ actor: 'coordinator', tenant, session: session as SessionId })
  if (issued === undefined || 'failure' in issued) throw new Error('no work principal')
  const principal = issued.ok
  const read = await readPublishedView(
    ports,
    { principal, tenant, session: session as SessionId },
    sessionInquiryBinding,
  )
  if ('failure' in read) throw new Error(read.failure)
  return read.ok
}

describe('the permission mode over session/v1 on the release tree', () => {
  it(
    'reads the mode in force, changes it at the revision read, and authorization reads the new value',
    { timeout: 180_000 },
    async () => {
      const script = () => ({ status: 500, contentType: 'text/plain', body: 'no model call' })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await tree.startSession('hello')
        const target = { tenant: savedTenant(tree.home), session }
        const before = await call(tree, 'read-permission-mode', target)
        expect(before, JSON.stringify(before)).toMatchObject({
          status: 200,
          outcome: 'succeeded',
          body: { mode: 'bypass-permissions' },
        })
        const revision = before.body['revision'] as string
        expect((await inquiryOf(tree, session)).inquiry.policy.onAsk).toBe('skip-ask')

        expect(
          await call(tree, 'change-permission-mode', {
            ...target,
            mode: 'bypass-permissions',
            expectedRevision: revision,
          }),
        ).toMatchObject({ outcome: 'no-change', body: { mode: 'bypass-permissions', revision } })

        const changed = await call(tree, 'change-permission-mode', {
          ...target,
          mode: 'auto_permission',
          expectedRevision: revision,
        })
        const next = String(BigInt(revision) + 1n)
        expect(changed, JSON.stringify(changed)).toMatchObject({
          outcome: 'succeeded',
          body: { mode: 'auto_permission', revision: next },
        })
        expect(await call(tree, 'read-permission-mode', target)).toMatchObject({
          outcome: 'succeeded',
          body: { mode: 'auto_permission', revision: next },
        })
        const inquiry = await inquiryOf(tree, session)
        expect(inquiry.inquiry.policy.onAsk).toBe('ask-human')
        expect(inquiry.basis.permissionRevision).toBe(next)

        expect(
          await call(tree, 'change-permission-mode', {
            ...target,
            mode: 'never',
            expectedRevision: revision,
          }),
        ).toMatchObject({ outcome: 'conflict' })
        expect((await inquiryOf(tree, session)).inquiry.policy.onAsk).toBe('ask-human')
      })
      expect(exitCode).toBe(0)
    },
  )
})
