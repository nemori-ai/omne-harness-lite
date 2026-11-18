import { describe, expect, it } from 'vitest'
import { capabilityId, readBodyText, type PackageReader } from '@omne-harness/assets'
import type { PackagePublishResult } from '../src/packages.ts'
import type { Failure } from '../src/schema.ts'
import { createTenantPublisher } from '../src/tenant-publisher.ts'
import type { AssetsLocal, AssetsMutationResult, AssetsReadResult } from '../src/types.ts'

const made = capabilityId('note', 'a')
if (!made.ok) throw new Error('identity')
const capability = made.id
const reader: PackageReader = {
  manifest: async () => ({ ok: { entries: [] } }),
  open: async () => ({ failure: 'entry-not-found' }),
}
const read = readBodyText('1', {
  maxBytes: 8,
  maxDepth: 1,
  maxItems: 1,
  maxMembers: 1,
  maxStringLength: 1,
  maxNumberLength: 4,
})
if (read.kind !== 'ok') throw new Error('body')
const body = read.value

function local(answers: {
  asset?: AssetsReadResult
  mutation?: AssetsMutationResult
  packages?: PackagePublishResult
}): AssetsLocal {
  return {
    readAsset: async () => answers.asset ?? { kind: 'absent' },
    publishAndHold: async () =>
      answers.mutation ?? { kind: 'committed', operationId: 'p', revision: 1, changed: true },
    packages: {
      publish: async () =>
        answers.packages ?? { kind: 'published', version: 'sha256:1', changed: true },
    },
  } as unknown as AssetsLocal
}

const data = (answers: Parameters<typeof local>[0]) =>
  createTenantPublisher(local(answers), 'tenant-a').publish({
    operationId: 'p',
    capability,
    content: { kind: 'data', body },
  })

const directory = (answers: Parameters<typeof local>[0]) =>
  createTenantPublisher(local(answers), 'tenant-a').publish({
    operationId: 'p',
    capability,
    content: { kind: 'directory', from: reader },
  })

const REASONS: readonly (readonly [Failure['reason'], unknown])[] = [
  ['invalid_input', { kind: 'invalid', reason: 'invalid-input' }],
  ['limit_exceeded', { kind: 'invalid', reason: 'limit-exceeded' }],
  ['forbidden', { kind: 'denied' }],
  ['unavailable', { kind: 'unavailable' }],
  ['closing', { kind: 'unavailable' }],
  ['unsupported', { kind: 'unavailable' }],
  ['missing_definition', { kind: 'unavailable' }],
  ['invalid_selection', { kind: 'unavailable' }],
  ['revision_conflict', { kind: 'conflict' }],
  ['version_conflict', { kind: 'conflict' }],
  ['identity_conflict', { kind: 'conflict' }],
  ['holding_exists', { kind: 'conflict' }],
  ['holding_removed', { kind: 'removed' }],
  ['operation_conflict', { kind: 'operation-conflict' }],
  ['unknown_category', { kind: 'unknown-category' }],
]

describe('the tenant publisher maps every local answer to one outcome of the service', () => {
  it.each(REASONS)('数据型的提交被拒 %s', async (reason, outcome) => {
    expect(await data({ mutation: { kind: 'rejected', reason } })).toEqual(outcome)
  })

  it.each(REASONS)('数据型读资产被拒 %s：不提交', async (reason, outcome) => {
    expect(
      await data({
        asset: { kind: 'rejected', reason },
        mutation: {
          kind: 'committed',
          operationId: 'p',
          revision: 9,
          changed: true,
          domainRevision: 1,
        },
      }),
    ).toEqual(outcome)
  })

  it.each(REASONS)('目录型的记录被拒 %s', async (reason, outcome) => {
    expect(
      await directory({
        packages: { kind: 'rejected', rejection: { kind: 'record-rejected', reason } },
      }),
    ).toEqual(outcome)
  })

  it('数据型的提交答 unknown 原样交出；成功带持有引用与正文的摘要', async () => {
    expect(await data({ mutation: { kind: 'unknown', operationId: 'p' } })).toEqual({
      kind: 'unknown',
      operationId: 'p',
    })
    expect(await data({})).toMatchObject({
      kind: 'published',
      holdingRef: 'note/a',
      version: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      changed: true,
    })
  })

  it.each([
    [
      { kind: 'published', version: 'sha256:1', changed: false },
      { kind: 'published', version: 'sha256:1', holdingRef: 'note/a', changed: false },
    ],
    [{ kind: 'conflict' }, { kind: 'conflict' }],
    [
      { kind: 'unknown', operationId: 'p' },
      { kind: 'unknown', operationId: 'p' },
    ],
    [{ kind: 'rejected', rejection: { kind: 'not-configured' } }, { kind: 'unavailable' }],
    [{ kind: 'rejected', rejection: { kind: 'unknown-category' } }, { kind: 'unknown-category' }],
    [
      { kind: 'rejected', rejection: { kind: 'not-a-directory-category' } },
      { kind: 'invalid', reason: 'not-a-directory-category' },
    ],
    [
      { kind: 'rejected', rejection: { kind: 'limit-exceeded', limit: 'totalBytes' } },
      { kind: 'invalid', reason: 'limit-exceeded:totalBytes' },
    ],
    [
      { kind: 'rejected', rejection: { kind: 'invalid-package', reason: 'no-skill-md' } },
      { kind: 'invalid', reason: 'no-skill-md' },
    ],
    [
      { kind: 'rejected', rejection: { kind: 'source-failed', failure: 'unavailable' } },
      { kind: 'unavailable' },
    ],
    [
      { kind: 'rejected', rejection: { kind: 'source-failed', failure: 'material-unavailable' } },
      { kind: 'invalid', reason: 'source-failed:material-unavailable' },
    ],
    [
      { kind: 'rejected', rejection: { kind: 'record-rejected', reason: 'not-a-reason' } },
      { kind: 'unavailable' },
    ],
  ] as const)('目录型 %o', async (packages, outcome) => {
    expect(await directory({ packages: packages as PackagePublishResult })).toEqual(outcome)
  })
})
