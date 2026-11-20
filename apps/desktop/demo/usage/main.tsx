import { Context } from '@deepseek-ai/cordis'
import {
  createSlotStore,
  type AttachedLayout,
  type ItemOf,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotName,
} from '@omne-harness/shell-contract'
import { ShellService } from '@omne-harness/shell-contract/cordis'
import {
  createUsageUiModule,
  memoryLayoutStore,
  usageExampleModule,
} from '@omne-harness/usage-ui/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import { useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const violations: string[] = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.violatedDirective} ${event.blockedURI}`)
})
Object.assign(window, {
  chartWalk: { violations },
  chartWalkExpects: [
    '.usage-example-sparklines',
    '.usage-card[data-widget="example.weekdays"] .recharts-bar',
  ],
})

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

class DemoShell extends ShellService implements ShellSlots {
  readonly login: ShellLogin = {
    state: () => 'signed-in',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  readonly scope: ScopeSource = {
    get: () => TENANT,
    set: () => undefined,
    subscribe: () => () => undefined,
  }
  private readonly store = createSlotStore()
  items<K extends SlotName>(slot: K): readonly ItemOf<K>[] {
    return this.store.items(slot)
  }
  subscribe(slot: SlotName, listener: () => void): () => void {
    return this.store.subscribe(slot, listener)
  }
  navigate(): void {}
  attached(): ReactNode {
    return null
  }
  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return <Arranged shell={this} anchor={anchor} subject={subject} layout={layout} />
  }
  protected place<K extends SlotName>(slot: K, item: ItemOf<K>): () => void {
    return this.store.place(slot, item)
  }
}

function Arranged(props: {
  shell: DemoShell
  anchor: string
  subject: string
  layout: AttachedLayout
}) {
  const [items, setItems] = useState(() => props.shell.items('attached'))
  useEffect(
    () => props.shell.subscribe('attached', () => setItems(props.shell.items('attached'))),
    [props.shell],
  )
  return props.layout(
    items
      .filter(item => item.anchor === props.anchor)
      .map(item => ({
        id: item.id,
        label: item.label,
        node: item.render({ scope: TENANT, subject: props.subject }),
      })),
  )
}

const instant = (day: number) => {
  const parsed = parseInstant(new Date(2026, 10, 14 + day).toISOString())
  if (!parsed.ok) throw new Error('instant')
  return parsed.value
}
const sum = (known: number) => ({ known: String(known), unknown: 0, provisional: 0 })
const measures = (day: number) => ({
  calls: 12 + day * 3,
  units: 12 + day * 3,
  retried: 0,
  interrupted: 0,
  failed: [],
  tokens: {
    input: sum(42_000 + day * 9_000),
    output: sum(3_000 + day * 700),
    'cache-read': sum(30_000 + day * 6_000),
    'cache-write': sum(day === 3 ? 0 : 4_000 + day * 500),
    reasoning: sum(1_000 + day * 300),
  },
  cost: {
    sums: [{ unit: 'USD', known: (0.42 + day * 0.07).toFixed(4) }],
    unknown: day === 2 ? 1 : 0,
  },
  duration: {
    total: sum(9_000 + day * 400),
    toFirstContent: { count: 12, p50: 620 - day * 20, p90: 900 },
    whole: { count: 12, p50: 4_100 + day * 150, p90: 6_000 },
  },
  rates: {
    cacheHit: { kind: 'known', value: '0.41' },
    reasoningShare: { kind: 'known', value: '0.05' },
    retry: { kind: 'known', value: '0' },
    failure: { kind: 'known', value: '0' },
    outputPerSecond: { kind: 'known', value: '38' },
  },
})
const groupsFor = (groupBy: readonly string[], day: number) =>
  groupBy[0] === 'model'
    ? [
        { key: ['openai/gpt-5.6-sol'], measures: measures(day + 2) },
        { key: ['anthropic/claude'], measures: measures(day) },
        { key: [null], measures: measures(0) },
      ]
    : groupBy[0] === 'source'
      ? [
          { key: ['model'], measures: measures(day) },
          { key: ['tool'], measures: { ...measures(day), calls: 4 + day } },
        ]
      : []
const client = {
  'query-usage': async (body: { groupBy: readonly string[] }) => ({
    outcome: 'succeeded',
    body: {
      total: measures(6),
      groups: groupsFor(body.groupBy, 6),
      buckets: [0, 1, 2, 3, 4, 5, 6].map(day => ({
        start: instant(day),
        end: instant(day + 1),
        total: measures(day),
        groups: groupsFor(body.groupBy, day),
      })),
      coverage: {
        sources: ['model', 'tool'],
        undated: 0,
        costUnknown: 1,
        excluded: { cacheHit: 0, reasoningShare: 0, outputPerSecond: 0 },
        earliest: null,
      },
    },
  }),
  'read-context-occupancy': async () => ({
    outcome: 'succeeded',
    body: {
      kind: 'known',
      used: '84000',
      window: '200000',
      percent: '42.00',
      compactAtPercent: '80',
      asOf: { at: instant(6), model: 'openai/gpt-5.6-sol' },
    },
  }),
  'list-usage-records': async () => ({ outcome: 'succeeded', body: { entries: [], next: null } }),
  observe: {},
}

const root = new Context()
await root.plugin(DemoShell)
root.reflect.provide('protocol:usage/v1', client)
const store = memoryLayoutStore({
  tenant: [
    { widget: 'usage.summary', width: 3, presentation: null },
    { widget: 'usage.tokens', width: 2, presentation: 'example.sparklines' },
    { widget: 'example.weekdays', width: 1, presentation: null },
    { widget: 'usage.by-model', width: 1, presentation: null },
    { widget: 'usage.cache', width: 1, presentation: null },
    { widget: 'usage.latency', width: 1, presentation: null },
  ],
})
await root.plugin(createUsageUiModule({ store }))
await root.plugin(usageExampleModule)
const shell = root.get('shell') as unknown as DemoShell
const page = shell.items('pages')[0]
createRoot(document.getElementById('root') as HTMLElement).render(
  <main>
    {page?.render({ scope: TENANT })}
    <span className="probe" data-probe="chart-1" />
  </main>,
)
