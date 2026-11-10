// @module-tag slow
// 慢：本进程装发行树（真实 SQLite），每条命令起一个 `omne` 子进程，模型走本进程的本地网关。先构建 `apps/cli`。
// 存储的 JSON 深度上限要用真实组合核对（session-adapters SPEC K-14，R2-D270）：发行树上跑一轮带工具的 Run，
// 记下每次存储提交里每条命令的嵌套深度。Session `create`、A2 保存 Tool 意图材料的提交（`material.preserved`，
// 发行全部工具定义在它的块里）、Journal 的 received 提交，都要低于发行配置 storage 行的 `maxJsonDepth`，并留出余量。
// K-23 桥删除后（R2-D372），A2 的意图材料不再以值树写进事实，这一轮最深的命令是 `create`。负控：上限取这一轮
// 最深命令的深度减一时，存储以 `command_limit` 拒绝那条命令，说明上限确实作用在真实组合的提交上。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import type { CommitRequestV2, CommitResultV2, SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageHostKey, storageKey } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as cordis from '../../../src/cordis.ts'
import { defineRow } from '../../../src/row.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { permissionObservation, type PermissionObservation } from './permission-observation.ts'
import { permissionManagement } from './permission-management.ts'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { runServe } from '../../../src/run.ts'
import { startModelGateway, type GatewayScript } from '../../fixtures/model-gateway.ts'
import {
  bodyOf,
  distributionPath,
  freePort,
  newScratch,
  operatorLayer,
  releaseMaxJsonDepth,
  runOmne,
} from '../../r9/support.ts'
import { connectable, until } from '../server-entry/support.ts'

/** The nesting the provider limits: a scalar has depth 0, a container one more than its deepest member. */
const depth = (value: unknown): number =>
  value !== null && typeof value === 'object'
    ? 1 + Math.max(0, ...Object.values(value).map(depth))
    : 0

type Commit = Readonly<{
  operation: string
  commands: readonly Readonly<{ participant: string; depth: number; text: string }>[]
  answer: string
  result: CommitResultV2
}>

class MeasuredStorageService extends StorageService {
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']

  constructor(ctx: Context, storage: SqlStorage, commits: Commit[]) {
    super(ctx)
    this.registerCombination = input => storage.registerCombination(input)
    this.commit = async (input: CommitRequestV2, options) => {
      const result = await storage.commit(input, options)
      commits.push({
        operation: input.identity.operation,
        commands: input.commands.map(command => ({
          participant: command.participant,
          depth: depth(command.facts),
          text: JSON.stringify(command.facts),
        })),
        answer: JSON.stringify(result),
        result,
      })
      return result
    }
    this.query = identity => storage.query(identity)
    this.read = (input, options) => storage.read(input, options)
  }
}

const passConfig: StandardSchema<SqliteStorageConfig> = {
  '~standard': {
    version: 1,
    vendor: 'release-depth-test',
    validate: (value: unknown) => ({ value: value as SqliteStorageConfig }),
  },
}

/** The release `storage` row with each commit measured; the provider and its limits are the real ones. */
function measuredStorageRow(commits: Commit[]) {
  const plugin = definePlugin({
    name: 'measured-sqlite-storage',
    Config: passConfig,
    inject: [storageHostKey],
    async apply(ctx, config) {
      const host = ctx.storageHost
      const created = await createSqliteStorage({
        config,
        materials: host.materials,
        closeLeases: host.closeLeases,
      })
      if (created.kind === 'rejected')
        throw new Error(
          `sqlite storage rejected (${created.reason}): ${created.problems.join('; ')}`,
        )
      new MeasuredStorageService(ctx, created.storage, commits)
      host.attachControl(created.control)
      ctx.effect(() => () => created.control.close({ initiator: 'disposal' }))
    },
  })
  return defineRow({
    row: 'storage',
    implementation: 'real',
    manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
    lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
    plugin,
  })
}

const sse = (events: readonly unknown[]): string =>
  `${events
    .map(
      event => `data: ${JSON.stringify(event)}

`,
    )
    .join('')}data: [DONE]

`

/** The serving the gateway reports: the requested model, and the provider the record pins. */
const serving = (body: string) => ({
  model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
  provider: 'OpenAI',
})

/** The release tool the scripted Model calls, with the call of its `info` command (D-94). */
const TOOL = 'Shell'
const CALL = '{"command":"info","params":{}}'

/** Each pair of requests runs Shell `info`, then finishes the turn with text. */
const toolThenText: GatewayScript = ({ index, body }) => ({
  status: 200,
  contentType: 'text/event-stream',
  body: sse(
    index % 2 === 0
      ? [
          {
            ...serving(body),
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_depth',
                      type: 'function',
                      function: { name: TOOL, arguments: CALL },
                    },
                  ],
                },
              },
            ],
          },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]
      : [
          { ...serving(body), choices: [{ delta: { content: 'done' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ],
  ),
})

/** Runs one tool round on the release tree with the storage limit `limit`, and returns every commit. */
async function toolRound(
  limit: number,
  scenario: 'single' | 'restart' | 'deny-update' = 'single',
): Promise<readonly Commit[]> {
  const dir = newScratch('release-depth-')
  const port = await freePort()
  const home = join(dir.base, 'home')
  let controller = new AbortController()
  const commits: Commit[] = []
  const permissionTrace: PermissionObservation[] = []
  const management = permissionManagement()
  const modelRequests: Array<Array<{ role: string; content?: unknown }>> = []
  const gateway = await startModelGateway(request => {
    const parsed = z
      .object({
        messages: z.array(z.object({ role: z.string(), content: z.unknown().optional() })),
      })
      .parse(JSON.parse(request.body))
    modelRequests.push(parsed.messages)
    return toolThenText(request)
  })
  gateway.trustInProcess()
  const distribution = JSON.parse(readFileSync(distributionPath, 'utf8')) as {
    rows: Array<{ id: string; config: unknown }>
  }
  const adoptionRow = distribution.rows.find(row => row.id === 'agent-adoptions')
  if (adoptionRow === undefined) throw new Error('No Agent mappings')
  const mappings = agentAdoptionsConfig.parse(adoptionRow.config)
  const coding = mappings.mappings.find(mapping => mapping.name === 'coding')
  if (coding === undefined) throw new Error('No coding mapping')
  // This positive path skips only the human inquiry; all current permission sources remain real.
  coding.modes.permission = 'bypass-permissions'
  adoptionRow.config = mappings
  const launch = () =>
    runServe({
      distribution,
      entryObjects: [...entryObjects, permissionObservation(permissionTrace), management.entry],
      operator: operatorLayer({
        storageRoot: dir.storageRoot,
        port,
        modelRoute: gateway.url,
        maxJsonDepth: limit,
      }),
      plugins: { ...cordis, storageRow: measuredStorageRow(commits) },
      stateRoot: dir.stateRoot,
      stop: controller.signal,
      readinessTimeoutMs: 15_000,
      shutdownDeadlineMs: 5000,
      write: () => undefined,
      stderr: () => undefined,
    })
  let finished = launch()
  try {
    await until(() => connectable('127.0.0.1', port), 'the server to listen', 20_000)
    const cli = (args: readonly string[], credential?: string) =>
      runOmne({
        args: [...args],
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: dir.base,
        ...(credential === undefined ? {} : { credential }),
      })
    const credential = 'dana-pw-R2D270-3e9b'
    expect((await cli(['register', '--login-identifier', 'dana'], credential)).status).toBe(0)
    expect((await cli(['login', '--login-identifier', 'dana'], credential)).status).toBe(0)
    const created = await cli(['create-session', '--definition', 'coding'])
    // A limit below the `create` command refuses the create itself: the round ends there.
    if (commits.some(commit => commit.answer.includes('command_limit'))) return commits
    expect(created.status, created.stderr).toBe(0)
    const session = String(bodyOf(created)['session'])
    const sent = await cli(['send-input', '--session', session, '--text', 'how deep'])
    expect(sent.status, sent.stderr).toBe(0)
    // Done when the intent is saved and A2 committed, or when the storage refused a command.
    await until(
      () =>
        commits.some(commit => commit.result.kind === 'rejected_before_accept') ||
        commits.some(commit => commit.commands.some(c => c.text.includes('"A2/commit@'))) ||
        permissionTrace.some(value => value.stage === 'admission' && value.result !== 'allow'),
      'the A2 intent commit or a refusal',
      60_000,
    )
    expect(
      commits
        .filter(
          commit =>
            commit.result.kind === 'rejected_before_accept' &&
            commit.result.reason !== 'command_limit',
        )
        .map(commit => commit.result),
    ).toEqual([])
    expect(
      permissionTrace.filter(value => value.stage === 'admission').map(value => value.result),
    ).not.toContain('unavailable')
    expect(
      permissionTrace.filter(value => value.stage === 'admission').map(value => value.result),
    ).not.toContain('deny')
    if (!commits.some(commit => commit.answer.includes('command_limit'))) {
      await until(
        () =>
          modelRequests
            .flat()
            .some(
              message =>
                message.role === 'tool' &&
                JSON.stringify(message.content)?.includes('done placement'),
            ),
        'the real Shell info result reaching the next Model request',
        60_000,
      )
    }
    if (scenario !== 'single') {
      await until(
        () =>
          commits.some(
            commit =>
              commit.result.kind === 'committed' &&
              commit.commands.some(
                command =>
                  command.participant === 'session' &&
                  command.text.startsWith('{"intent":"log"') &&
                  command.text.includes('"kind":"ended"'),
              ),
          ),
        'the original Run to finish before stopping',
        60_000,
      )
    }
    if (scenario === 'restart') {
      controller.abort('test: cold restart')
      expect((await finished).exitCode).toBe(0)
      const commitOffset = commits.length
      const requestOffset = modelRequests.length
      controller = new AbortController()
      finished = launch()
      await until(() => connectable('127.0.0.1', port), 'the remounted tree to listen', 20_000)
      const second = await cli([
        'send-input',
        '--session',
        session,
        '--text',
        'check after restart',
      ])
      expect(second.status, second.stderr).toBe(0)
      await until(
        () =>
          modelRequests.length >= requestOffset + 2 &&
          JSON.stringify(
            modelRequests
              .at(-1)
              ?.filter(message => message.role === 'tool')
              .at(-1)?.content,
          )?.includes('done placement') === true,
        'a new real Tool result after cold restart',
        60_000,
      )
      for (const participant of [
        'harness.agent-permission-current',
        'harness.agent-tool-permission-current',
      ]) {
        const captures = (items: readonly Commit[]) =>
          items.flatMap(commit =>
            commit.result.kind === 'committed' &&
            commit.commands.some(c => c.participant === participant)
              ? [commit.result.identity.operationKey]
              : [],
          )
        const first = captures(commits.slice(0, commitOffset))
        const second = captures(commits.slice(commitOffset))
        expect(first.length).toBeGreaterThan(0)
        expect(second.length).toBeGreaterThan(0)
        const original = new Set(first)
        expect(second.every(key => !original.has(key))).toBe(true)
      }
    }
    if (scenario === 'deny-update') {
      const changed = await management.denyShell(session, { loginIdentifier: 'dana', credential })
      expect(changed, JSON.stringify(changed)).toHaveProperty('ok')
      const traceOffset = permissionTrace.length
      const requestOffset = modelRequests.length
      const invokes = permissionTrace.filter(value => value.stage === 'tool-invoke').length
      expect(invokes).toBeGreaterThan(0)
      const second = await cli(['send-input', '--session', session, '--text', 'try Shell again'])
      expect(second.status, second.stderr).toBe(0)
      await until(
        () => permissionTrace.slice(traceOffset).some(value => value.stage === 'admission'),
        'the next actual Agent permission decision',
        60_000,
      )
      expect(
        permissionTrace.slice(traceOffset).filter(value => value.stage === 'admission'),
      ).toEqual([{ stage: 'admission', result: 'deny' }])
      expect(permissionTrace.slice(traceOffset)).toContainEqual({
        stage: 'current',
        result: {
          reading: 'current',
          source: null,
          inquiry: expect.objectContaining({
            basis: expect.objectContaining({ permissionRevision: '1' }),
          }),
        },
      })
      await until(
        () =>
          modelRequests.length >= requestOffset + 2 &&
          JSON.stringify(
            modelRequests
              .at(-1)
              ?.filter(message => message.role === 'tool')
              .at(-1)?.content,
          )?.includes('The tool call was denied and did not run.') === true,
        'the permission denial reaching the next Model request',
        60_000,
      )
      expect(permissionTrace.filter(value => value.stage === 'tool-invoke')).toHaveLength(invokes)
    }
    return commits
  } catch (error) {
    console.error('Permission trace', JSON.stringify(permissionTrace))
    console.error(
      'Recent commit stages',
      JSON.stringify(
        commits.slice(-12).map(commit => ({
          operation: commit.operation,
          participants: commit.commands.map(command => command.participant),
          result: commit.result.kind,
          reason: 'reason' in commit.result ? commit.result.reason : null,
        })),
      ),
    )
    throw error
  } finally {
    controller.abort('test: stop')
    await finished.catch(() => undefined)
    await gateway.close()
    dir.remove()
  }
}

const isIntent = (text: string): boolean =>
  text.includes('"kind":"material.preserved"') && text.includes('fixed-tool-request')

/** The kinds of command R2-D270 names, each the deepest of its kind in the round. */
type Measured = Readonly<{ create: number; intent: number; received: number; deepest: number }>

const deepest = (commits: readonly Commit[], pick: (text: string) => boolean): number =>
  Math.max(
    0,
    ...commits.flatMap(commit =>
      commit.commands.filter(command => pick(command.text)).map(command => command.depth),
    ),
  )

function measured(commits: readonly Commit[]): Measured {
  return {
    // The Session `create` of the CLI (`create-session` sends no first input).
    create: deepest(commits, text =>
      text.startsWith('{"intent":"command","command":{"kind":"create"'),
    ),
    // The A2 intent: the Journal's material save of the Tool request (R2-D292), whose block holds
    // the fixed Tool request with the release Tool definitions.
    intent: deepest(commits, isIntent),
    // The publications of the Journal once the Model result is received.
    received: deepest(
      commits,
      text => text.startsWith('{"intent":"publish"') && text.includes('received-'),
    ),
    deepest: deepest(commits, () => true),
  }
}

/** The headroom the release limit keeps over the deepest command of the round. */
const MARGIN = 32

describe('the storage JSON depth limit of the release, checked on the real composition (K-14, R2-D270)', () => {
  it(
    'reopens the original Session and makes fresh Agent and Tool permission captures after cold restart',
    { timeout: 180_000 },
    async () => {
      await toolRound(releaseMaxJsonDepth(), 'restart')
    },
  )
  it(
    'applies a real Session permission denial to the next Agent call without remounting or invoking the Tool',
    { timeout: 180_000 },
    async () => {
      await toolRound(releaseMaxJsonDepth(), 'deny-update')
    },
  )
  it(
    'a create, the A2 intent with the release Tool definitions and the received publications stay under the release maxJsonDepth with headroom',
    { timeout: 180_000 },
    async () => {
      const limit = releaseMaxJsonDepth()
      const commits = await toolRound(limit)
      const depths = measured(commits)
      console.log(`R2-D270 depths: ${JSON.stringify(depths)} limit ${String(limit)}`)
      expect(commits.filter(commit => commit.answer.includes('command_limit'))).toEqual([])
      expect(
        commits.some(
          commit =>
            commit.result.kind === 'committed' &&
            commit.commands.some(c => c.participant === 'harness.agent-permission-current'),
        ),
      ).toBe(true)
      expect(
        commits.some(
          commit =>
            commit.result.kind === 'committed' &&
            commit.commands.some(c => c.participant === 'harness.agent-tool-permission-current'),
        ),
      ).toBe(true)
      expect(depths.create).toBeGreaterThan(0)
      expect(depths.intent).toBeGreaterThan(0)
      expect(depths.received).toBeGreaterThan(0)
      expect(depths.deepest + MARGIN).toBeLessThanOrEqual(limit)
    },
  )

  it(
    'with a limit one below the deepest command of the round, the storage refuses that command as command_limit',
    { timeout: 180_000 },
    async () => {
      const deepestOfRound = measured(await toolRound(releaseMaxJsonDepth())).deepest
      expect(deepestOfRound).toBeGreaterThan(0)
      const limit = deepestOfRound - 1
      const commits = await toolRound(limit)
      const refused = commits.filter(commit => commit.answer.includes('command_limit'))
      expect(refused.length).toBeGreaterThan(0)
      expect(
        refused.every(commit => commit.commands.some(command => command.depth === deepestOfRound)),
      ).toBe(true)
      expect(commits.filter(commit => !commit.answer.includes('command_limit'))).toSatisfy(
        (kept: readonly Commit[]) =>
          kept.every(commit => commit.commands.every(command => command.depth <= limit)),
      )
    },
  )
})
