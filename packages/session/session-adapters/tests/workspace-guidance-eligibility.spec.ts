import { expect, it, vi } from 'vitest'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import {
  createStepDirectory,
  type WorkingDirectoryTargets,
} from '../src/cordis/working-directory-step.ts'
import {
  emptyGuidanceIndex,
  extendGuidanceIndex,
  guidanceBlocks,
  guidanceProvenance,
  missingGuidanceBlocks,
} from '../src/cordis/guidance-window.ts'
import type { Message } from '@omne-harness/message'
import { judgeMessage } from '@omne-harness/message'
import { evidence } from '@omne-harness/session-contract/testing'
import type { ModelViewRow, SessionHistory } from '@omne-harness/session-contract'
import { readGuidanceHistory } from '../src/cordis/guidance-history.ts'
import { WORKSPACE_GUIDANCE_PROVENANCE } from '../src/workspace-guidance.ts'

const access = memoryAccess('eligibility')
const source = { workspace: 'wsp_00000000000000000000000001', instance: 'wsi_a', root: '/a' }
const other = { workspace: 'wsp_00000000000000000000000002', instance: 'wsi_b', root: '/b' }
function world(check: WorkingDirectoryTargets<string>['check']) {
  return createStepDirectory({
    targets: () => ({ check }),
    defaultDirectory: '/default',
    recover: async () => ({ kind: 'ready' }),
  })
}

it('qualifies each historical instance once with the caller tenant, including an unselected workspace', async () => {
  const check = vi.fn<WorkingDirectoryTargets<string>['check']>(async ({ instance }) =>
    instance === 'wsi_a'
      ? { kind: 'refused', reason: 'not-permitted' }
      : { kind: 'attachable', directory: '/b' },
  )
  expect(await world(check).qualifyHistory?.(access, [other, other, source])).toEqual({
    failure: { kind: 'denied' },
  })
  expect(check.mock.calls.map(([call]) => call.instance)).toEqual(['wsi_b', 'wsi_a'])
  expect(
    check.mock.calls.every(
      ([call]) => call.tenant === access.tenant && call.principal === access.principal,
    ),
  ).toBe(true)
})

it('preserves legal history when a physical instance is unavailable, and distinguishes an unknown qualification', async () => {
  const check = vi.fn<WorkingDirectoryTargets<string>['check']>(async () => ({
    kind: 'refused',
    reason: 'instance-unavailable',
  }))
  const directory = world(check)
  expect(await directory.qualifyHistory?.(access, [source, source])).toEqual({ ok: undefined })
  expect(check).toHaveBeenCalledTimes(1)
  check.mockResolvedValue({ kind: 'unavailable' })
  expect(await directory.qualifyHistory?.(access, [source])).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  check.mockRejectedValue(new Error('owner disconnected'))
  expect(await directory.qualifyHistory?.(access, [source])).toMatchObject({
    failure: { kind: 'unavailable' },
  })
})

it('tracks scope metadata separately from complete source bodies and retains both workspace identities', () => {
  const scope = {
    state: 'attached' as const,
    ...source,
    sources: [{ path: 'AGENTS.md', digest: 'digest', text: 'A' }],
  }
  const partition = 'tenant/session'
  const held = (blocks: ReturnType<typeof guidanceBlocks>): Message => {
    const [first, ...rest] = blocks
    if (first === undefined) throw new Error('missing test blocks')
    return { id: 'msg_history' as Message['id'], role: 'system_reminder', blocks: [first, ...rest] }
  }
  const a = guidanceBlocks(scope, [], partition)
  const b = guidanceBlocks({ ...scope, ...other }, [], partition)
  const index = extendGuidanceIndex(emptyGuidanceIndex(), [held(a), held(b)], partition)
  expect(index.scopes).toEqual([source, other])
  const metadata = extendGuidanceIndex(emptyGuidanceIndex(), [held(a.slice(0, 1))], partition)
  expect(metadata.scopes).toEqual([source])
  expect(metadata.sources.size).toBe(0)
  expect(extendGuidanceIndex(index, [], partition).sourceScopes).toBe(index.sourceScopes)
  expect(extendGuidanceIndex(emptyGuidanceIndex(), [held(a)], 'foreign/session').scopes).toEqual([])
})

it('consumes native summary source identities without reading old log text, and distinguishes unknown from proven empty provenance', async () => {
  const parsed = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'compaction',
    covers: { from: '1', to: '2' },
    retained: [],
    derivation: evidence('summary'),
    blocks: [
      {
        kind: 'text',
        id: 'summary',
        text: 'mixed A and B',
        visibility: { toModel: true, toHuman: true },
      },
    ],
  })
  if (!('ok' in parsed)) throw new Error(JSON.stringify(parsed))
  let provenance: ModelViewRow['provenance'] = [source, other].map(scope => ({
    owner: WORKSPACE_GUIDANCE_PROVENANCE,
    key: JSON.stringify(scope),
    blocks: ['summary'],
  }))
  const readModelView: SessionHistory<string>['readModelView'] = vi.fn(async () => ({
    ok: {
      kind: 'page' as const,
      basis: { epoch: 'summary-epoch', upper: '3' },
      next: null,
      rows: [
        {
          seq: '1',
          entry: '3' as ModelViewRow['entry'],
          bytes: 1,
          prefixDigest: 'p',
          message: parsed.ok,
          ...(provenance === undefined ? {} : { provenance }),
        },
      ],
    },
  }))
  // This deliberately supplies only the current-view port: old log reads cannot hide in the path.
  const answer = await readGuidanceHistory({ readModelView }, access, 'tenant/session')
  expect(answer).toMatchObject({ ok: { summarizedScopes: [source, other] } })
  if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
  expect(answer.ok.index.sources.size).toBe(0)
  const check = vi.fn<WorkingDirectoryTargets<string>['check']>(async ({ instance }) =>
    instance === source.instance
      ? { kind: 'refused', reason: 'not-permitted' }
      : { kind: 'attachable', directory: '/b' },
  )
  expect(await world(check).inspectHistory(access, answer.ok.summarizedScopes)).toEqual({
    ok: [source],
  })
  expect(check).toHaveBeenCalledTimes(2)
  provenance = undefined
  expect(await readGuidanceHistory({ readModelView }, access, 'tenant/session')).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  provenance = []
  expect(await readGuidanceHistory({ readModelView }, access, 'tenant/session')).toMatchObject({
    ok: { summarizedScopes: [] },
  })
})

it('rechecks retained bytes independently of the original scope attestation', async () => {
  const partition = 'tenant/session'
  const scope = {
    ...source,
    state: 'attached' as const,
    sources: [{ path: 'AGENTS.md', digest: 'digest', text: 'complete project instructions' }],
  }
  const [manifest, body] = guidanceBlocks(scope, [], partition)
  if (!manifest || !body) throw new Error('expected manifest and body')
  const reminder = (text: string): Message => ({
    id: 'msg_original' as Message['id'],
    role: 'system_reminder',
    blocks: [manifest, { ...body, text }],
  })
  const provenance = guidanceProvenance(reminder(body.text), partition)
  async function read(text: string) {
    const message = reminder(text)
    const readModelView: SessionHistory<string>['readModelView'] = async () => ({
      ok: {
        kind: 'page',
        basis: { epoch: 'retained', upper: '1' },
        next: null,
        rows: [
          {
            entry: '1' as ModelViewRow['entry'],
            seq: '1',
            bytes: 1,
            prefixDigest: 'p',
            message,
            provenance,
          },
        ],
      },
    })
    return readGuidanceHistory({ readModelView }, access, partition)
  }
  for (const visible of [
    body.text,
    body.text.replace('complete project instructions', 'complete'),
    body.text.slice(0, -5),
  ]) {
    const result = await read(visible)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.index.sourceScopes.get(body.id)).toEqual(source)
    expect(missingGuidanceBlocks(scope, result.ok.index, partition)).toEqual(
      visible === body.text ? [] : [body],
    )
  }
  const conflicting = body.text.replace(source.instance, other.instance)
  expect(await read(conflicting)).toMatchObject({ failure: { kind: 'unavailable' } })
})
