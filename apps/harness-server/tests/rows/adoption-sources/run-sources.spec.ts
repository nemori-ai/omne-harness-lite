import { describe, expect, it } from 'vitest'
import type { BodyContract, CategoryView } from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  runIdOf,
  type AdoptionEvidenceCommand,
  type RunId,
  type SessionAccess,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { testingWorkspace } from '@omne-harness/session-contract/testing'
import type { SourceAdoption, WorkspaceSources } from '@omne-harness/workspace-contract'
import {
  adoptRunSources,
  type RunSourcesPorts,
} from '../../../src/rows/adoption-sources/run-sources.ts'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
const SESSION = 'ses_1' as SessionId
const WHO: SessionAccess<unknown> = {
  ...access('caller', tenant(organization.value, account.value)),
  session: SESSION,
}
const WORKSPACE = testingWorkspace('wsp_abcdefghjkmnpqrstvwxyz2345')
const START = { kind: 'startRun', input: { entry: 'input' } } as unknown as Extract<
  AdoptionEvidenceCommand,
  { kind: 'startRun' }
>
const ADOPTED: SourceAdoption = {
  kind: 'adopted',
  reading: { workspace: WORKSPACE, instance: 'wsi_1' as never, revision: 1, packages: [] },
  fresh: true,
  reason: null,
}

const snapshot = (over: Partial<Record<keyof WorkSnapshot, unknown>> = {}) =>
  ({
    session: SESSION,
    lifecycle: 'active',
    frozen: null,
    run: { kind: 'none' },
    awaitingPerson: false,
    pending: ['inp_first'],
    creation: { workspace: WORKSPACE, workspaceAttachment: { instance: 'wsi_1', basis: 'b' } },
    changes: [],
    ...over,
  }) as unknown as WorkSnapshot

const contract = (category: string, namespace?: string): BodyContract =>
  ({
    category,
    ...(namespace === undefined
      ? {}
      : { layout: { namespace, limits: { files: 1, fileBytes: 1, totalBytes: 1 } } }),
  }) as unknown as BodyContract

function world(read: RunSourcesPorts['readWork'], adopt?: WorkspaceSources<unknown>['adopt']) {
  const contracts = [contract('skill', 'skills'), contract('note')]
  const categories: CategoryView = {
    list: () => contracts.map(each => ({ category: each.category }) as never),
    lookup: category => contracts.find(each => each.category === category),
    describe: () => undefined,
    atPoint: () => undefined,
  }
  const adopted: unknown[] = []
  const reported: string[] = []
  const sources = {
    adopt: async (who: unknown, input: unknown) => {
      adopted.push({ who, input })
      return adopt === undefined ? ADOPTED : adopt(who as never, input as never)
    },
  } as unknown as WorkspaceSources<unknown>
  const ports: RunSourcesPorts = {
    readWork: read,
    sources: () => sources,
    categories: () => categories,
    report: reason => void reported.push(reason),
  }
  return { ports, adopted, reported }
}

describe('adopting the sources of the workspace when a run starts', () => {
  it('adopts once under the key of the run the command starts, with the layouts of the categories that have one', async () => {
    const w = world(async () => succeed(snapshot()))
    await adoptRunSources(w.ports, START, WHO)
    expect(w.adopted).toEqual([
      {
        who: WHO,
        input: {
          workspace: WORKSPACE,
          instance: 'wsi_1',
          key: runIdOf(SESSION, 'inp_first' as never, null),
          layouts: [{ category: 'skill', namespace: 'skills', limits: expect.any(Object) }],
        },
      },
    ])
    expect(w.reported).toEqual([])
    const before = 'run_before' as RunId
    const after = world(async () =>
      succeed(snapshot({ run: { kind: 'terminal', terminal: { run: before } } })),
    )
    await adoptRunSources(after.ports, START, WHO)
    expect((after.adopted[0] as { input: { key: string } }).input.key).toBe(
      runIdOf(SESSION, 'inp_first' as never, before),
    )
  })

  it('adopts nothing for a session at no workspace, or a command that starts no run', async () => {
    const none = world(async () => succeed(snapshot({ creation: { workspace: null } })))
    await adoptRunSources(none.ports, START, WHO)
    const busy = world(async () => succeed(snapshot({ run: { kind: 'active' } })))
    await adoptRunSources(busy.ports, START, WHO)
    const unknown = world(async () => succeed(snapshot()))
    await adoptRunSources(unknown.ports, START, undefined)
    for (const w of [none, busy, unknown]) expect([w.adopted, w.reported]).toEqual([[], []])
  })

  it('reports and goes on when the session, the sources or the adoption cannot be had', async () => {
    const cases = [
      [world(() => undefined), 'the session cannot be read'],
      [
        world(async () => fail({ kind: 'unavailable' }) as never),
        'the session read answered unavailable',
      ],
      [
        world(async () => {
          throw new Error('gone')
        }),
        'adopting the workspace sources threw: Error: gone',
      ],
      [
        world(
          async () => succeed(snapshot()),
          async () => ({ kind: 'not-permitted' }),
        ),
        'the workspace sources answered not-permitted',
      ],
      [
        world(
          async () => succeed(snapshot()),
          async () => {
            throw new Error('disk')
          },
        ),
        'adopting the workspace sources threw: Error: disk',
      ],
    ] as const
    for (const [w, reason] of cases) {
      await expect(adoptRunSources(w.ports, START, WHO)).resolves.toBeUndefined()
      expect([w.adopted.length > 0 || w.reported.length > 0, w.reported]).toEqual([true, [reason]])
    }
    for (const missing of ['sources', 'categories'] as const) {
      const absent = world(async () => succeed(snapshot()))
      await adoptRunSources({ ...absent.ports, [missing]: () => undefined }, START, WHO)
      expect([absent.adopted, absent.reported]).toEqual([[], ['the workspace sources are absent']])
    }
  })
})
