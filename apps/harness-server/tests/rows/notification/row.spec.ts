import { describe, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { rowDeclarationOf } from '../../../src/row.ts'
import { subscriptionConsents } from '../../../src/rows/notification/consent.ts'
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

describe('the consent of a subscription', () => {
  const agent = { kind: 'agent', recipient: { kind: 'agent', ref: 's-1' } } as const
  const consented = {
    kind: 'consented',
    basis: { kind: 'granular', scope: 'session', grant: 'g' },
  } as const

  it('is what the call of the context was released on, read by tenant and call', async () => {
    const asked: [string, string][] = []
    const port = subscriptionConsents(async (tenant, call) => {
      asked.push([tenant, call])
      return consented
    })
    const ctx = { tenant: 't1', subject: null, actor: agent, call: 'c-1' } as never
    expect(await port.consent(ctx)).toEqual(consented)
    expect(asked).toEqual([['t1', 'c-1']])
  })

  it('is none for a context without a call, without reading any release', async () => {
    const port = subscriptionConsents(async () => {
      throw new Error('not to be read')
    })
    const ctx = { tenant: 't1', subject: null, actor: agent } as never
    expect(await port.consent(ctx)).toEqual({ kind: 'none' })
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
