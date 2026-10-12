import {
  humanSnapshot,
  boundHumanBlocks,
  type HumanBlock,
  type ToolObservation,
} from './session-human-content.ts'
import type {
  ModelExecutionRef,
  ModelInvocationHandle,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger } from '@omne-harness-lite/session-log'

export type ModelSnapshot = ReturnType<ModelInvocationHandle['snapshot']>
export type PresentationItem = HumanBlock
export interface SessionPresentation {
  readonly revision: number
  readonly items: readonly PresentationItem[]
  readonly omitted: boolean
}
export interface PresentationPolicy {
  readonly maxCalls: number
  readonly maxBlocks: number
  readonly maxCharactersPerCall: number
}
interface ToolDisplay {
  readonly scope: SessionScope
  readonly run: string
  readonly call: string
  readonly block: Extract<HumanBlock, { kind: 'tool_call' }>
  readonly read: () => Promise<{
    readonly observation: ToolObservation
    readonly terminal: boolean
  }>
}
interface StoredTool extends ToolDisplay {
  readonly order: number
  current: Extract<HumanBlock, { kind: 'tool_call' }> | undefined
  ended: boolean
  omitted: boolean
  issuedRead: number
  appliedRead: number
}
interface ModelDisplay {
  readonly scope: SessionScope
  readonly run: string
  readonly call: string
  readonly order: number
  ref?: ModelExecutionRef
  position?: ModelSnapshot['position']
  items?: readonly PresentationItem[]
  omitted: boolean
}
const key = (scope: SessionScope, call: string) =>
  JSON.stringify([scope.tenant.organization, scope.tenant.account, scope.session, call])
function sameScope(left: SessionScope, right: SessionScope): boolean {
  return left.session === right.session && tenantIdEquals(left.tenant, right.tenant)
}
function older(
  display: ModelDisplay,
  ref: ModelExecutionRef,
  position: ModelSnapshot['position'],
): boolean {
  if (!display.ref) return false
  const order = compareInteger(ref.dispatch, display.ref.dispatch)
  return (
    order < 0 ||
    (order === 0 &&
      display.position !== undefined &&
      compareInteger(position, display.position) < 0)
  )
}
/** Host-local display only. No credentials, execution grants or final-log writes enter this store. */
export function createSessionPresentation(policy: PresentationPolicy) {
  if (Object.values(policy).some(value => !Number.isSafeInteger(value) || value < 1))
    throw new TypeError('positive presentation limits required')
  const models = new Map<string, ModelDisplay>()
  const tools = new Map<string, StoredTool>()
  let revision = 0,
    closed = false,
    evicted = false
  return {
    bindModel(scope: SessionScope, run: string, call: string): void {
      if (closed || models.has(key(scope, call))) return
      if (models.size === policy.maxCalls) {
        models.delete(models.keys().next().value!)
        evicted = true
      }
      models.set(key(scope, call), { scope, run, call, omitted: false, order: revision })
      revision++
    },
    model(ref: ModelExecutionRef, snapshot: ModelSnapshot): void {
      const display = models.get(key(ref, ref.callId))
      if (closed || !display) return
      if (older(display, ref, snapshot.position)) return
      display.ref = ref
      display.position = snapshot.position
      const projected =
        snapshot.blocks.length > policy.maxBlocks
          ? { items: [], omitted: true }
          : boundHumanBlocks(humanSnapshot(snapshot), policy.maxCharactersPerCall, policy.maxBlocks)
      display.omitted = projected.omitted
      display.items = projected.items
      revision++
    },
    bindTool(display: ToolDisplay): void {
      if (closed || tools.has(key(display.scope, display.call))) return
      if (tools.size === policy.maxCalls) {
        tools.delete(tools.keys().next().value!)
        evicted = true
      }
      const bounded = boundHumanBlocks(
        [display.block],
        policy.maxCharactersPerCall,
        policy.maxBlocks,
      )
      const block = bounded.items[0]
      if (!block || block.kind !== 'tool_call') {
        evicted = true
        return
      }
      tools.set(key(display.scope, display.call), {
        ...display,
        block,
        order: revision,
        current: undefined,
        ended: false,
        issuedRead: 0,
        appliedRead: 0,
        omitted: bounded.omitted,
      })
      revision++
    },
    async read(scope: SessionScope, run: string): Promise<SessionPresentation> {
      const selected = [...models.values()].filter(
        value => value.run === run && sameScope(value.scope, scope),
      )
      const calls = [...tools.values()].filter(
        value => value.run === run && sameScope(value.scope, scope),
      )
      const observed = await Promise.all(calls.map(call => readTool(call, policy)))
      if (closed) return { revision, items: [], omitted: false }
      const items = combinedItems(selected, observed)
      const bounded = boundHumanBlocks(items, policy.maxCharactersPerCall, policy.maxBlocks)
      return {
        revision,
        items: bounded.items,
        omitted:
          evicted ||
          bounded.omitted ||
          selected.some(value => value.omitted) ||
          calls.some(value => value.omitted),
      }
    },
    close(): void {
      closed = true
      models.clear()
      tools.clear()
      revision++
    },
  }
}
export type SessionPresentationStore = ReturnType<typeof createSessionPresentation>

async function readTool(call: StoredTool, policy: PresentationPolicy): Promise<StoredTool> {
  if (call.ended) return call
  const ordinal = ++call.issuedRead
  let result: Awaited<ReturnType<ToolDisplay['read']>>
  try {
    result = await call.read()
  } catch {
    result = {
      terminal: false,
      observation: {
        state: 'unavailable',
        blocks: [],
        notice: 'Tool observation unavailable',
        offloaded: false,
      },
    }
  }
  if (call.ended || (!result.terminal && ordinal < call.appliedRead)) return call
  const bounded = boundHumanBlocks(
    [{ ...call.block, observation: result.observation }],
    policy.maxCharactersPerCall,
    policy.maxBlocks,
  )
  const item = bounded.items[0]
  call.current = item?.kind === 'tool_call' ? item : undefined
  call.omitted ||= bounded.omitted
  call.ended = result.terminal
  call.appliedRead = ordinal
  return call
}
function combinedItems(
  selected: readonly ModelDisplay[],
  observed: readonly StoredTool[],
): HumanBlock[] {
  const observations = new Map(observed.map(value => [value.call, value]))
  const used = new Set<string>()
  const groups = selected.map(value => ({
    order: value.order,
    items: (value.items ?? []).map(item => {
      if (item.kind !== 'tool_call' || item.call === null) return item
      const observation = observations.get(item.call)
      if (!observation) return item
      used.add(item.call)
      return observation.current ?? item
    }),
  }))
  for (const call of observed) {
    if (!used.has(call.call) && call.current)
      groups.push({ order: call.order, items: [call.current] })
  }
  return groups.sort((left, right) => left.order - right.order).flatMap(value => value.items)
}
