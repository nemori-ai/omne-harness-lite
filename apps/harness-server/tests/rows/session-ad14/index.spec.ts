// @module-tag slow
// The `session-ad14` row: the real AD-14 `AgentDrivePort` of session-adapters on a real Cordis,
// loaded with the real `agent-host` and `agent-instances` rows above the stand-ins of
// `../agent-host/doubles.ts`. The current conditions `agentConditions` are a stand-in too: the
// real provider is the `session-conditions` row (SC1). With them present the three rows reach
// ACTIVE and `sessionAgentDrive` is provided; without them `agent-host` stays PENDING and names
// `agentConditions`, and the two rows that need the host's keys stay PENDING behind it, so nothing
// claims to be ready. The coordinator principal of a drive call is the one the trusted
// `sessionWorkPrincipals` answers for that tenant and session, read per call; with no provider the
// call answers `unavailable` and reaches no Agent entry. `session` and `sessionWorkPrincipals` are
// stand-ins of this test.
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  AgentDrivePort,
  SessionFaces,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import {
  SessionService,
  SessionWorkPrincipalsService,
  sessionAgentDriveKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import { agentHostRow } from '../../../src/rows/agent-host/index.ts'
import { agentInstancesRow } from '../../../src/rows/agent-instances/index.ts'
import { sessionAd14Row } from '../../../src/rows/session-ad14/index.ts'
import type { EntryObjectModule, RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'
import {
  hostConfig,
  hostDoubles,
  principalObject,
  tenant,
  type HostDoubles,
} from '../agent-host/doubles.ts'

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

/** The `session` stand-in: AD-14 injects it; `inspect` does not read it. */
function sessionRow() {
  class Session extends SessionService<unknown> {
    readonly work = {} as SessionFaces<unknown>['work']
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  return declared(
    defineRow({
      row: 'session-standin',
      implementation: 'contract-double',
      manifest: { provides: ['session'], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'session-standin',
        apply(ctx: Context) {
          new Session(ctx)
        },
      },
    }),
  )
}

type ForSession = SessionWorkPrincipals<unknown>['forSession']

/** The trusted session work principals: records every request, answers one principal per session. */
function workPrincipals(requests: Parameters<ForSession>[0][]): EntryObjectModule {
  class Principals extends SessionWorkPrincipalsService<unknown> {
    readonly forSession: ForSession = input => {
      requests.push(input)
      return Promise.resolve(succeed(`principal:${input.actor}:${input.session}`))
    }
  }
  return {
    name: sessionWorkPrincipalsKey,
    implementation: 'contract-double',
    install(scope: Context) {
      new Principals(scope)
    },
  }
}

type Tree = Readonly<{ tree: LoadedTree; doubles: HostDoubles }>

async function start(options: {
  omit?: 'agentConditions'
  principals?: EntryObjectModule | null
}): Promise<Tree> {
  const base = makeBase()
  release.push(() => base.release())
  const doubles = hostDoubles(options.omit ?? null)
  const complete = options.omit === undefined
  const tree = await loadTree({
    base,
    rows: [
      doubles.spec,
      sessionRow(),
      declared(agentHostRow, hostConfig),
      declared(agentInstancesRow),
      declared(sessionAd14Row),
    ],
    entryObjects: [
      principalObject(),
      ...(options.principals === null ? [] : [options.principals ?? workPrincipals([])]),
    ],
    readinessTimeoutMs: complete ? 10_000 : 1500,
  })
  release.push(() => tree.dispose())
  return { tree, doubles }
}

const target = { tenant, session: sessionId('ses_row_ad14'), execution: 'ad14-execution' }

type Schema = { '~standard': { validate(value: unknown): { issues?: unknown } } }
const accepts = (value: unknown) =>
  (sessionAd14Row.Config as Schema)['~standard'].validate(value).issues === undefined

describe('the session-ad14 row: declaration', () => {
  it('is the real row and equals the table row of the assembly page, with no shutdown phase', () => {
    const declaration = rowDeclarationOf(sessionAd14Row)
    expect(declaration).toEqual({
      row: 'session-ad14',
      implementation: 'real',
      manifest: {
        provides: ['sessionAgentDrive'],
        injects: [
          'agentInstances',
          'agentInstanceProvision',
          'agentExecutionRecovery',
          'agentExecutionControl',
          'session',
        ],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
    expect(declaration?.manifest).toEqual(serveProfile().stubManifests.get('session-ad14' as RowId))
  })

  it('takes no configuration: an empty object, and nothing else', () => {
    expect(accepts({})).toBe(true)
    expect(accepts({ timeoutMs: 1 })).toBe(false)
  })
})

describe('agent-host, agent-instances and session-ad14 on stand-in current conditions', () => {
  it('reach ACTIVE together and provide the drive port', { timeout: 60_000 }, async () => {
    const { tree } = await start({})
    for (const row of ['agent-host', 'agent-instances', 'session-ad14'])
      expect(tree.state(row), row).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.allActive).toBe(true)
    expect(tree.service(sessionAgentDriveKey)).toBeDefined()
  })

  it(
    'without `agentConditions` stay PENDING behind the host and provide no drive port',
    { timeout: 60_000 },
    async () => {
      const { tree } = await start({ omit: 'agentConditions' })
      expect(tree.state('agent-host')).toMatchObject({
        state: 'PENDING',
        missing: ['agentConditions'],
      })
      expect(tree.state('agent-instances')).toMatchObject({
        state: 'PENDING',
        missing: ['agentPublicationAuthority'],
      })
      expect(tree.state('session-ad14').state).toBe('PENDING')
      expect([...tree.state('session-ad14').missing].sort()).toEqual([
        'agentExecutionControl',
        'agentExecutionRecovery',
        'agentInstanceProvision',
        'agentInstances',
      ])
      expect(tree.allActive).toBe(false)
      expect(tree.service(sessionAgentDriveKey)).toBeUndefined()
    },
  )

  it(
    'drives the real host with the coordinator principal of the target session',
    { timeout: 60_000 },
    async () => {
      const requests: Parameters<ForSession>[0][] = []
      const { tree, doubles } = await start({ principals: workPrincipals(requests) })
      const drive = tree.service<AgentDrivePort>(sessionAgentDriveKey)!
      await drive.inspect(target)
      expect(requests).toEqual([
        { actor: 'coordinator', tenant: target.tenant, session: target.session },
      ])
      // The host's recovery read the Journal with that principal, and with no other.
      expect(doubles.loads).toEqual([`principal:coordinator:${target.session}`])
    },
  )

  it(
    'answers unavailable and reaches no Agent entry when the work principals have no provider',
    { timeout: 60_000 },
    async () => {
      const { tree, doubles } = await start({ principals: null })
      expect(tree.allActive).toBe(true)
      const drive = tree.service<AgentDrivePort>(sessionAgentDriveKey)!
      const answer = await drive.inspect(target)
      expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(doubles.loads).toEqual([])
    },
  )

  it(
    'answers denied and reaches no Agent entry when the work principals refuse the session',
    { timeout: 60_000 },
    async () => {
      const refusing: EntryObjectModule = {
        name: sessionWorkPrincipalsKey,
        implementation: 'contract-double',
        install(scope: Context) {
          new (class extends SessionWorkPrincipalsService<unknown> {
            readonly forSession: ForSession = () =>
              Promise.resolve(fail({ kind: 'denied', action: 'sessionWorkPrincipals.forSession' }))
          })(scope)
        },
      }
      const { tree, doubles } = await start({ principals: refusing })
      const drive = tree.service<AgentDrivePort>(sessionAgentDriveKey)!
      expect(await drive.inspect(target)).toEqual({ failure: { kind: 'denied' } })
      expect(doubles.loads).toEqual([])
    },
  )
})
