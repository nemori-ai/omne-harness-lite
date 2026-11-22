import { describe, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { rowDeclarationOf } from '../../../src/row.ts'
import { subscriptionCreators } from '../../../src/rows/notification/creators.ts'
import {
  notificationCombination,
  notificationConfig,
  notificationRow,
} from '../../../src/rows/notification/index.ts'
import { OWNER_POSTS } from '../../../src/rows/notification/owner-source.ts'
import { productionStorageCatalog } from '../../../src/rows/storage/production-catalog.ts'
import { NOTIFICATION_POLICY } from '../../r9/support.ts'

describe('the notification row', () => {
  it('declares the nine services of the provider and what it needs before it starts', () => {
    expect(rowDeclarationOf(notificationRow)).toMatchObject({
      row: 'notification',
      implementation: 'real',
      lifecycle: { kind: 'body', phase: 'composition' },
      manifest: {
        provides: [
          'notificationSending',
          'notificationInbox',
          'notificationSubscriptions',
          'notificationDestinations',
          'notificationCatalog',
          'notificationSources',
          'notificationChannels',
          'notificationChanges',
          'notificationStanding',
        ],
        injects: ['storage', 'tenantDomainLookup', 'tenantDomains', 'tenantDomainScannerPrincipal'],
      },
    })
  })

  it('takes one whole policy and nothing else', () => {
    expect(notificationConfig.parse({ policy: NOTIFICATION_POLICY }).policy).toEqual(
      NOTIFICATION_POLICY,
    )
    expect(notificationConfig.safeParse({ policy: NOTIFICATION_POLICY, more: 1 }).success).toBe(
      false,
    )
  })

  it.each([
    ['no policy at all', {}, 'policy'],
    [
      'a policy without its retry',
      { policy: { ...NOTIFICATION_POLICY, retry: undefined } },
      'policy.retry',
    ],
    [
      'a retry that never tries',
      { policy: { ...NOTIFICATION_POLICY, retry: { maxAttempts: 0, backoffMs: [] } } },
      'policy.retry.maxAttempts',
    ],
    [
      'a default beat outside the range',
      {
        policy: {
          ...NOTIFICATION_POLICY,
          beat: { defaultMinutes: 1, minMinutes: 5, maxMinutes: 60 },
        },
      },
      'policy',
    ],
  ])('refuses %s and names where', (_name, config, path) => {
    const parsed = notificationConfig.safeParse(config)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map(issue => issue.path.join('.'))).toContain(path)
  })

  it('registers its storage combination from the catalogue of the running code', async () => {
    const catalog = await productionStorageCatalog()
    const manifest = combinationManifest({ catalog, participants: ['notification.persistence'] })
    if (manifest.kind !== 'manifest') throw new Error('the catalogue lacks the participant')
    const digest = manifestDigest(manifest.manifest)
    expect(await notificationCombination()).toEqual({
      combinationVersion: `harness-notification/${digest.slice(0, 16)}`,
      manifestDigest: digest,
    })
  })
})

describe('who creates a subscription', () => {
  const agent = { kind: 'agent', recipient: { kind: 'agent', ref: 's-1' } } as const
  const account = `acc_${'0'.repeat(26)}`
  const tenantText = JSON.stringify({ organization: `org_${'0'.repeat(26)}`, account })
  const origin = { actorRef: 'principal/p', session: 's-1', call: 'c-1' }
  const unread = () => {
    throw new Error('not to be read')
  }

  it('is the person of the tenant, named by its account, for the owner', async () => {
    const port = subscriptionCreators(unread)
    const ctx = { tenant: tenantText, subject: null, actor: { kind: 'owner' } } as never
    expect(await port.creatorOf(ctx)).toEqual({ kind: 'human', actorRef: account })
    const broken = { tenant: 't1', subject: null, actor: { kind: 'owner' } } as never
    expect(await port.creatorOf(broken)).toBeNull()
  })

  it('is the agent with the session and the call its live call runs in, read by tenant and call', async () => {
    const asked: [string, string][] = []
    const port = subscriptionCreators((tenant, call) => {
      asked.push([tenant, call])
      return origin
    })
    const ctx = { tenant: 't1', subject: null, actor: agent, call: 'c-1' } as never
    expect(await port.creatorOf(ctx)).toEqual({
      kind: 'agent',
      actorRef: 'principal/p',
      originatingSessionRef: 's-1',
      originatingCallRef: 'c-1',
    })
    expect(asked).toEqual([['t1', 'c-1']])
  })

  it('is nobody for an agent whose call is not live, or a context without a call', async () => {
    const gone = subscriptionCreators(() => undefined)
    const ctx = { tenant: 't1', subject: null, actor: agent, call: 'c-1' } as never
    expect(await gone.creatorOf(ctx)).toBeNull()
    const withoutCall = { tenant: 't1', subject: null, actor: agent } as never
    expect(await subscriptionCreators(unread).creatorOf(withoutCall)).toBeNull()
  })
})

describe('the source the owner sends as', () => {
  it('names only the person, lets no agent subscribe, and is strong for the person by default', () => {
    expect(OWNER_POSTS).toEqual({
      name: 'owner.posts',
      label: '自己写的',
      types: [
        {
          name: 'post',
          label: '自己写的一条',
          description: '租户的 owner 自己写给自己的一条。',
          kind: { kind: 'event' },
          subject: { presence: 'optional', hint: '这一条关于什么，可以不写' },
          nameable: ['person'],
          subscribable: ['person'],
          defaults: { person: 'strong', agent: 'off' },
          external: false,
        },
      ],
    })
  })
})
