import type {
  ModelExecutionRef,
  ModelInvocationHandle,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger } from '@omne-harness-lite/session-log'

export type ModelSnapshot = ReturnType<ModelInvocationHandle['snapshot']>
export interface PresentationItem {
  readonly kind: 'text' | 'thinking' | 'tool'
  readonly text: string
  readonly state?: string
  readonly call?: string
}
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
  readonly name: string
  readonly read: () => Promise<string>
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
type SnapshotBlock = ModelSnapshot['blocks'][number]
function visibleItems(snapshot: ModelSnapshot): PresentationItem[] {
  return snapshot.blocks.flatMap(visibleItem)
}
function visibleItem(value: SnapshotBlock): PresentationItem[] {
  const block = value.closed ? value.block : value.opened
  if (!block.visibility.toHuman) return []
  if (value.closed) return closedItem(value.block)
  switch (value.opened.kind) {
    case 'tool_call':
      return requestedTool(value.opened.head)
    case 'text':
    case 'thinking':
      return [
        { kind: value.opened.kind, text: typeof value.content === 'string' ? value.content : '' },
      ]
    default:
      return []
  }
}
function closedItem(block: Extract<SnapshotBlock, { closed: true }>['block']): PresentationItem[] {
  switch (block.kind) {
    case 'tool_call':
      return [
        {
          kind: 'tool',
          text: block.tool ?? '',
          state: 'requested',
          ...(block.callId ? { call: block.callId } : {}),
        },
      ]
    case 'text':
    case 'thinking':
      return [{ kind: block.kind, text: block.text }]
    default:
      return []
  }
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
  const tools = new Map<string, ToolDisplay & { readonly order: number }>()
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
          : boundItems(visibleItems(snapshot), policy.maxCharactersPerCall)
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
      tools.set(key(display.scope, display.call), { ...display, order: revision })
      revision++
    },
    async read(scope: SessionScope, run: string): Promise<SessionPresentation> {
      const selected = [...models.values()].filter(
        value => value.run === run && sameScope(value.scope, scope),
      )
      const calls = [...tools.values()].filter(
        value => value.run === run && sameScope(value.scope, scope),
      )
      const observed = await Promise.all(
        calls.map(async call => {
          let state: string
          try {
            state = await call.read()
          } catch {
            state = 'unavailable'
          }
          return {
            order: call.order,
            items: [{ kind: 'tool' as const, text: call.name, state, call: call.call }],
          }
        }),
      )
      if (closed) return { revision, items: [], omitted: false }
      const identities = new Set(calls.map(value => value.call))
      const groups = selected.map(value => ({
        order: value.order,
        items: value.items
          ? value.items.filter(
              item => item.kind !== 'tool' || !item.call || !identities.has(item.call),
            )
          : [],
      }))
      const items = [...groups, ...observed]
        .sort((left, right) => left.order - right.order)
        .flatMap(value => value.items)
      const bounded = boundItems(items, policy.maxCharactersPerCall)
      return {
        revision,
        items: bounded.items,
        omitted: evicted || bounded.omitted || selected.some(value => value.omitted),
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

function boundItems(items: readonly PresentationItem[], limit: number) {
  let remaining = limit,
    omitted = false
  const bounded = items.flatMap(item => {
    if (remaining === 0) {
      omitted = true
      return []
    }
    const text = item.text.slice(0, remaining)
    remaining -= text.length
    omitted ||= text.length !== item.text.length
    return [{ ...item, text }]
  })
  return { items: bounded, omitted }
}

function requestedTool(head: {
  readonly tool?: string
  readonly callId?: string
}): PresentationItem[] {
  return head.tool
    ? [
        {
          kind: 'tool',
          text: head.tool,
          state: 'requested',
          ...(head.callId ? { call: head.callId } : {}),
        },
      ]
    : []
}
