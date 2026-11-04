// @module-tag slow
// 慢：本进程装发行树（真实 SQLite），每条命令起一个 `omne` 子进程。先构建 `apps/cli`（`pnpm turbo run build --filter
// "@omne-harness/cli..."`）。
// 发行的 `assistant` 映射带初始模型选择（R2-D236）。没有它时，会话没有保存的模型选择，`session-conditions` 对 Agent 的
// 每次 `read` 都答 `unavailable`，Run 停在 E2。用例在发行树里用 `assistant` 建会话、发一条输入，观察 Agent 对
// `agentConditions` 的读取答复：发行映射下第一次读取就成功。同一棵树只去掉这个字段时，接入在调用 Session 之前就拒绝
// `create-session`（`basis-unavailable`，server-entry SPEC 第 5 步，R2-D236），没有会话，也就没有一次读取。
// 观察的做法：本用例把 `session-conditions` 行换成同一组合（`createSessionConditionsPlugin` 加 `defaultModesOf`）外面
// 多一层记录答复的服务，行清单与发行行相同。它不证明后续步骤（I1 之后）能走通。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { CurrentConditions } from '@omne-harness/agent-contract'
import {
  CurrentConditionsService,
  agentConditionsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { createSessionConditionsPlugin } from '@omne-harness/session-adapters/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { contentDigest, definitionMappingsKey } from '@omne-harness/server-entry/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { describe, expect, it } from 'vitest'
import * as cordis from '../../../src/cordis.ts'
import { defineRow } from '../../../src/row.ts'
import { defaultModesOf } from '../../../src/rows/session-conditions/index.ts'
import { runServe } from '../../../src/run.ts'
import { bodyOf, freePort, newScratch, operatorLayer, runOmne } from '../../r9/support.ts'
import { startModelGateway } from '../../fixtures/model-gateway.ts'
import { connectable, until } from '../server-entry/support.ts'

type Answer = Readonly<{ ok: true } | { ok: false; kind: string }>
type Mapping = Record<string, unknown> & { name?: unknown; initialModelSelection?: unknown }
type Distribution = { rows: { id: string; config: { mappings?: Mapping[] } }[] }

const INJECTS = [definitionMappingsKey, sessionKey, storageKey, tenantDomainLookupKey]

/** The release composition of the row, with every `read` answer recorded in `answers`. */
function observedConditionsRow(answers: Answer[]) {
  class Observed extends CurrentConditionsService<unknown> {
    readonly read: CurrentConditions<unknown>['read']
    constructor(ctx: Context, read: CurrentConditions<unknown>['read']) {
      super(ctx)
      this.read = read
    }
  }
  const plugin: Plugin.Object = {
    name: 'session-conditions-observed',
    inject: INJECTS,
    async apply(ctx: Context) {
      const inner = ctx.isolate(agentConditionsKey, Symbol('observed-conditions'))
      await inner.plugin(
        createSessionConditionsPlugin<unknown>({
          defaultModes: defaultModesOf(ctx[definitionMappingsKey]),
        }),
      )
      new Observed(ctx, async input => {
        const service = inner.get(agentConditionsKey) as CurrentConditions<unknown> | undefined
        if (service === undefined) throw new Error('fixture: the inner conditions are not provided')
        const answer = await service.read(input)
        answers.push('failure' in answer ? { ok: false, kind: answer.failure.kind } : { ok: true })
        return answer
      })
    },
  }
  return defineRow({
    row: 'session-conditions',
    implementation: 'real',
    manifest: { provides: [agentConditionsKey], injects: INJECTS, sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin,
  })
}

const release = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
) as Distribution

function assistantOf(distribution: Distribution): Mapping {
  const mappings = distribution.rows.find(row => row.id === 'agent-adoptions')?.config.mappings
  const assistant = mappings?.find(mapping => mapping.name === 'assistant')
  if (assistant === undefined) throw new Error('fixture: the release has no assistant mapping')
  return assistant
}

/** The release with the assistant mapping's initial model selection removed. */
function withoutInitialSelection(): Distribution {
  const copy = structuredClone(release)
  delete assistantOf(copy).initialModelSelection
  return copy
}

type Round = Readonly<
  | { created: true; first: Answer }
  | { created: false; status: number | null; outcome: unknown; reads: readonly Answer[] }
>

/**
 * Creates an `assistant` session in the tree of `distribution`, sends one input, returns the first
 * read answer. A `create-session` that does not succeed returns its exit status and outcome, and the
 * reads recorded by then.
 */
async function firstConditionsRead(distribution: Distribution): Promise<Round> {
  const dir = newScratch('release-assistant-')
  const port = await freePort()
  const home = join(dir.base, 'home')
  const controller = new AbortController()
  const answers: Answer[] = []
  // The Model calls go to a local gateway, never to a real supplier (R2-D258).
  const gateway = await startModelGateway()
  gateway.trustInProcess()
  const finished = runServe({
    distribution,
    operator: operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
    plugins: { ...cordis, sessionConditionsRow: observedConditionsRow(answers) },
    stateRoot: dir.stateRoot,
    stop: controller.signal,
    readinessTimeoutMs: 15_000,
    shutdownDeadlineMs: 5000,
    write: () => undefined,
    stderr: () => undefined,
  })
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
    const credential = 'erin-pw-R2D236-7c1a'
    expect((await cli(['register', '--login-identifier', 'erin'], credential)).status).toBe(0)
    expect((await cli(['login', '--login-identifier', 'erin'], credential)).status).toBe(0)
    const created = await cli(['create-session', '--definition', 'assistant'])
    if (created.status !== 0)
      return {
        created: false,
        status: created.status,
        outcome: created.result?.['outcome'],
        reads: [...answers],
      }
    const session = String(bodyOf(created)['session'])
    const sent = await cli(['send-input', '--session', session, '--text', 'hello'])
    expect(sent.status, sent.stderr).toBe(0)
    await until(() => answers.length > 0, 'the first agentConditions read', 30_000)
    return { created: true, first: answers[0] as Answer }
  } finally {
    controller.abort('test: stop')
    await finished.catch(() => undefined)
    await gateway.close()
    dir.remove()
  }
}

describe('the release assistant definition has an initial model selection (R2-D236)', () => {
  it('the mapping names the route and its basis digest is the content digest of { name }', () => {
    const selection = assistantOf(release).initialModelSelection as
      | { name: string; basis: { digest: string } }
      | undefined
    expect(selection?.name).toBe('openai/gpt-6.1-sol')
    expect(selection?.basis.digest).toBe(contentDigest({ name: selection?.name }))
  })

  it(
    'an assistant session of the release tree reads its current conditions at the first try',
    { timeout: 120_000 },
    async () => {
      expect(await firstConditionsRead(release)).toEqual({ created: true, first: { ok: true } })
    },
  )

  it(
    'without the initial model selection the same tree refuses create-session as basis-unavailable, before Session reads anything',
    { timeout: 120_000 },
    async () => {
      // Exit 4 is the CLI's code for `basis-unavailable`; no session exists, so no read happened.
      expect(await firstConditionsRead(withoutInitialSelection())).toEqual({
        created: false,
        status: 4,
        outcome: 'basis-unavailable',
        reads: [],
      })
    },
  )
})
