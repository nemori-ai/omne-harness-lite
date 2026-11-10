// The Tool result receiver of the `agent-host` plugin on real Cordis 4.0.4 (SPEC "结果接收";
// IC-13; R2-D273): the body's child plugin registers it with the Tool runtime under the Agent
// consumer owner once `toolRuntime` and `agentToolReceptionTargets` are there, the host is ready
// without them, and the ordered stop, the child's end and the host's end remove the registration.
//
// The Tool runtime is a bare `ToolRuntimeService` whose only working part is the receiver table of
// tool-cordis-contract; the target query is a recording double. Journal and access are the memory
// doubles of `@omne-harness/agent/testing`. Nothing here proves the real Tool host or the
// session-log targets; `apps/harness-server` composes those (release-tool-delivery.spec.ts).
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { AGENT_CONSUMER_OWNER } from '@omne-harness/agent'
import type { ToolReceptionTargets } from '@omne-harness/agent-contract'
import { ToolReceptionTargetsService } from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolDelivery,
  type ToolResultReceiver,
} from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { caller, ok, openWorld, turns, type World } from './host-support.ts'

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

const unused = () => {
  throw new Error('not used by the reception tests')
}

/** A Tool runtime whose receiver table is the real one of tool-cordis-contract. */
class TableRuntime extends ToolRuntimeService<unknown, ContentBlock> {
  invoke = unused
  inspect = unused
  queries = unused as never
  commands = unused as never
  instances = unused as never
  observation = unused as never
  content = unused as never
  catalog = unused as never
  body = unused as never
  /** The receiver the push stage would reach for `owner`. */
  registered(owner: string): ToolResultReceiver<unknown, ContentBlock> | undefined {
    return this.resultReceiver(owner)
  }
}

type Resolve = Parameters<ToolReceptionTargets<unknown>['resolve']>[0]

/** Provides `toolRuntime` as a table runtime on a fiber of its own. */
function serveRuntime(
  root: Context,
): Readonly<{ runtime: () => TableRuntime | undefined; fiber: Fiber }> {
  let runtime: TableRuntime | undefined
  const fiber = root.plugin({
    name: 'tool-runtime-table',
    apply(ctx: Context) {
      runtime = new TableRuntime(ctx)
    },
  })
  return { runtime: () => runtime, fiber }
}

/** Provides `agentToolReceptionTargets` that records each resolve and answers no binding. */
function serveTargets(root: Context): Readonly<{ resolved: Resolve[]; fiber: Fiber }> {
  const resolved: Resolve[] = []
  const fiber = root.plugin({
    name: 'tool-reception-targets-double',
    apply(ctx: Context) {
      class Targets extends ToolReceptionTargetsService<unknown> {
        forExecution: ToolReceptionTargets<unknown>['forExecution'] = async () => ({ ok: [] })
        resolve: ToolReceptionTargets<unknown>['resolve'] = async input => {
          resolved.push(input)
          return { ok: null }
        }
      }
      new Targets(ctx)
    },
  })
  return { resolved, fiber }
}

/** Both Tool services, settled. */
async function serveTool(root: Context) {
  const runtime = serveRuntime(root)
  const targets = serveTargets(root)
  await runtime.fiber
  await targets.fiber
  await turns(10)
  return { runtime: runtime.runtime, resolved: targets.resolved, targets: targets.fiber }
}

async function world(): Promise<World> {
  const made = await openWorld()
  opened.push(made)
  return made
}

/** One result delivery of a Tool call that the Agent registered as action `step-1/tool/0`. */
function delivery(): ToolDelivery<ContentBlock> {
  const access = caller('a')
  const reference = ok(
    encodeToolInvocationRef({
      tenant: access.tenant,
      call: ok(decodeToolCallId('reception-call')),
      admission: ok(decodeToolOperationId('reception-admission')),
    }),
  )
  const evidence = (record: string) => ({ owner: 'tool', record, revision: '1', digest: record })
  return {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference,
      result: ok(decodeToolResultVersion('result-1')),
    },
    consumer: {
      owner: AGENT_CONSUMER_OWNER,
      work: 'reception-execution',
      position: 'step-1/tool/0',
      purpose: 'action',
    },
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-occurred', evidence: evidence('effect') },
    source: evidence('source'),
    value: {
      content: [],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
    account: null,
  }
}

describe('the Tool result receiver of the agent-host plugin (R2-D273)', () => {
  it('the host is ready without the Tool rows; once they come, the receiver is registered under the Agent owner', async () => {
    const w = await world()
    // Ready and serving with no Tool runtime: the reception child waits, the host does not.
    expect(w.root.get('agentInstanceProvision')).toBeDefined()
    const tool = await serveTool(w.root)
    const receiver = tool.runtime()?.registered(AGENT_CONSUMER_OWNER)
    expect(receiver).toBeDefined()
    // It is the Agent Tool receiver: it has the maintenance calls next to `push`.
    expect(typeof (receiver as unknown as { recover?: unknown }).recover).toBe('function')
  })

  it('a push asks the injected target query with the execution route of the Agent consumer position', async () => {
    const w = await world()
    const tool = await serveTool(w.root)
    const receiver = tool.runtime()?.registered(AGENT_CONSUMER_OWNER)
    if (receiver === undefined) throw new Error('no receiver was registered')
    const answer = await receiver.push({
      access: caller('a'),
      delivery: delivery(),
      signal: new AbortController().signal,
    })
    // The double answers no original consumption: the Tool protocol's `not-accepted`.
    expect(answer).toEqual({
      failure: { kind: 'invalid', field: 'key.reference', reason: 'not-accepted' },
    })
    expect(tool.resolved).toHaveLength(1)
    expect(tool.resolved[0]?.execution).toBe('reception-execution')
  })

  it('the ordered stop removes the registration before it quiesces instances', async () => {
    const w = await world()
    const tool = await serveTool(w.root)
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeDefined()
    expect(await w.plugin.quiesceAll({ signal: new AbortController().signal })).toEqual({
      kind: 'settled',
    })
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeUndefined()
  })

  it('the end of the target query or of the host removes the registration; a new provider registers again', async () => {
    const w = await world()
    const tool = await serveTool(w.root)
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeDefined()
    await tool.targets.dispose()
    await turns(10)
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeUndefined()
    await serveTargets(w.root).fiber
    await turns(10)
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeDefined()
    await w.host.dispose()
    await turns(10)
    expect(tool.runtime()?.registered(AGENT_CONSUMER_OWNER)).toBeUndefined()
  })
})
