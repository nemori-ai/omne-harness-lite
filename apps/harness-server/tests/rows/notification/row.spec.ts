import { describe, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  CONFIRM_EACH,
  NO_STANDING_SOURCES,
  notificationCombination,
  notificationConfig,
  notificationRow,
} from '../../../src/rows/notification/index.ts'
import { OWNER_POSTS } from '../../../src/rows/notification/owner-source.ts'
import { productionStorageCatalog } from '../../../src/rows/storage/production-catalog.ts'
import { NOTIFICATION_POLICY } from '../../r9/support.ts'

describe('the notification row', () => {
  it('declares the eight services of the provider and what it needs before it starts', () => {
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

describe('the two ports this tree answers the same way every time', () => {
  it('has the owner confirm each subscription of an agent', async () => {
    expect(await CONFIRM_EACH.mode({} as never)).toEqual({ kind: 'per-request' })
  })

  it('reads the standing items and finds none', async () => {
    expect(await NO_STANDING_SOURCES.read('tenant/o/a' as never)).toEqual({ kind: 'ok', items: [] })
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
