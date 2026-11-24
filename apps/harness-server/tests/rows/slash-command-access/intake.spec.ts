import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import { userMessageId } from '@omne-harness/session-protocol'
import { settledSession } from '../../governance/tenant-settings-support.ts'
import { savedTenant } from '../../r9/support.ts'
import { treeOf } from '../media-intake/support.ts'
import { sessionRef, tenantOf, type ProtocolClients } from '../../support/protocol-clients.ts'
import {
  type Entry,
  historyOf,
  onReleaseTree,
  pollUntil,
  type ReleaseTree,
  toolCallsThenText,
} from '../../support/release-tree.ts'

type Assets = ProtocolClients['assets']
type Send = Parameters<ReleaseTree['clients']['session']['send-input']>[0]
type Seen = Readonly<{ command: string | null; references: readonly string[] }>

const skill = (name: string, body: string) => `---
name: ${name}
description: ${name} 的说明。
---

# ${name}

${body}
`

async function publish(assets: Assets, tenant: TenantId, name: string, body: string) {
  const bytes = new TextEncoder().encode(skill(name, body))
  const operation = `publish-${name}`
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category: 'skill',
    name,
    manifest: [{ path: 'SKILL.md', bytes: bytes.length }],
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${begun.outcome}`)
  const sent = await assets['append-asset-upload']({
    tenant,
    upload: operation,
    path: 'SKILL.md',
    offset: 0,
    bytes,
  })
  if (sent.outcome !== 'succeeded') throw new Error(`append: ${sent.outcome}`)
  const made = await assets['commit-asset-upload']({ tenant, upload: operation })
  if (made.outcome !== 'succeeded') throw new Error(`commit: ${made.outcome}`)
  return made.body as { holding: string }
}

const text = (entry: Entry): string => JSON.stringify(entry.payload)
const terminals = (entries: readonly Entry[]) =>
  entries.filter(entry => entry.kind === 'run.terminal').length
const messages = (entries: readonly Entry[]) =>
  entries.filter(entry => entry.kind === 'message.user')

describe('a member names a Skill in a sentence, on the release tree', () => {
  it(
    'carries each named body in its own block after the words, refuses what is no command, and refuses what changed since it was shown',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const requests: string[] = []
      const script = toolCallsThenText(body => {
        requests.push(body)
        return []
      })
      const exitCode = await onReleaseTree({ script }, async tree => {
        const session = await settledSession(tree, 'hello')
        const tenant = tenantOf(savedTenant(tree.home))
        await publish(tree.clients.assets, tenant, 'review', '评审的记号 MARK-REVIEW')
        await publish(tree.clients.assets, tenant, 'check', '检查的记号 MARK-CHECK')
        const gone = await publish(tree.clients.assets, tenant, 'gone', '这一份会被禁用')
        let n = 0
        const send = async (words: string, seen?: Seen, again?: number) => {
          if (again === undefined) n += 1
          const input = `in-${String(again ?? n)}`
          const message = treeOf({
            id: await userMessageId(input),
            role: 'user',
            blocks: [
              { kind: 'text', id: 'b1', visibility: { toHuman: true, toModel: true }, text: words },
            ],
          })
          return tree.clients.session['send-input']({
            tenant,
            session: sessionRef(session),
            acceptId: `accept-${input}`,
            inputId: input,
            message,
            ...(seen === undefined ? {} : { seen }),
          } as unknown as Send)
        }
        const settle = async (count: number) =>
          pollUntil(
            'the run to end',
            () => historyOf(tree, session),
            entries => terminals(entries) >= count,
          )

        expect(
          await send('帮我用 /review 看一下', { command: null, references: ['skill:review'] }),
        ).toMatchObject({ outcome: 'succeeded' })
        let entries = await settle(2)
        const first = messages(entries).at(-1)
        expect(text(first!)).toContain('帮我用 /review 看一下')
        expect(text(first!)).toContain('MARK-REVIEW')
        expect(text(first!)).toContain('skill:review')
        expect(requests.at(-1)).toContain('MARK-REVIEW')
        expect(requests.at(-1)).toContain('named by the person')
        const once = messages(entries).length
        expect(
          await send('帮我用 /review 看一下', { command: null, references: ['skill:review'] }, 1),
        ).toEqual({ outcome: 'succeeded', body: { recovered: true } })
        expect(messages(await historyOf(tree, session)).length).toBe(once)

        expect(await send('先 /review 再 /check，再 /review 一次')).toMatchObject({
          outcome: 'succeeded',
        })
        entries = await settle(3)
        const both = text(messages(entries).at(-1)!)
        expect(both.split('MARK-REVIEW').length - 1).toBe(1)
        expect(both).toContain('MARK-CHECK')

        const before = requests.length
        expect(await send('/nope 做点什么')).toEqual({
          outcome: 'invalid',
          body: { field: 'value.message', reason: 'no such command: /nope' },
        })
        expect(await send('\\/usr 是什么，看看 /etc/hosts 与 https://a.b/c')).toMatchObject({
          outcome: 'succeeded',
        })
        entries = await settle(4)
        expect(text(messages(entries).at(-1)!)).not.toContain('origin')
        expect(requests.length).toBe(before + 1)

        expect(
          await tree.clients.assets['set-asset-enabled']({
            tenant,
            operation: 'disable-gone',
            holding: gone.holding,
            enabled: false,
          } as never),
        ).toMatchObject({ outcome: 'succeeded' })
        const changed = await send('照 /gone 做', { command: null, references: ['skill:gone'] })
        expect(changed).toMatchObject({ outcome: 'invalid', body: { field: 'value.message' } })
        expect(JSON.stringify(changed)).toContain('what was shown changed')
        expect(await send('/gone 做', { command: null, references: [] })).toMatchObject({
          outcome: 'invalid',
          body: { reason: 'not usable now: /skill:gone: This Skill is disabled.' },
        })
        expect(await send('照 /gone 做')).toMatchObject({ outcome: 'succeeded' })
        entries = await settle(5)
        expect(text(messages(entries).at(-1)!)).not.toContain('这一份会被禁用')

        const pending = await tree.clients.session['read-pending']({
          tenant,
          session: sessionRef(session),
          after: null,
          limit: 10,
        } as never)
        expect(pending).toMatchObject({ outcome: 'succeeded', body: { inputs: [] } })
      })
      expect(exitCode).toBe(0)
    },
  )
})
