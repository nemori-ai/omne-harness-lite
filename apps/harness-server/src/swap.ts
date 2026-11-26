import type { Fiber, Plugin } from '@deepseek-ai/cordis'
import { declareRow, planChange, type RowSpec as DeclaredRow } from '@omne-harness/assembly'
import { loadVersion, type Trust } from '@omne-harness/assembly-cordis'
import { swapRow } from '@omne-harness/assembly-cordis/cordis'
import { z } from 'zod'
import type { RowSpec } from './loader.ts'
import type { LoadedRow } from './readiness.ts'
import type { RowSupervision } from './shutdown.ts'
import type { RowId } from './types.ts'

type Line = Readonly<Record<string, unknown>>

type VersionRow = Readonly<{
  declaration: Readonly<{
    row: string
    provides: readonly string[]
    injects: readonly string[]
    swap?: 'implementation' | 'rerun' | 'restart'
    contracts?: Readonly<Record<string, string>>
  }>
  plugin: Plugin.Object
}>

export type RowKit = Readonly<{
  /** A package the server depends on, by name: the same instance the process runs. */
  use(specifier: string): Promise<unknown>
  /** The row as the release ships it: a version that only changes a part starts from it. */
  shipped(row: string): VersionRow
}>

const SHARED = /^@(omne-harness|deepseek-ai)\//u

function kitOf(rows: readonly RowSpec[]): RowKit {
  return {
    use(specifier) {
      if (!SHARED.test(specifier))
        throw new Error(`${specifier} is not a package of the installation`)
      return import(specifier)
    },
    shipped(row) {
      const spec = rows.find(each => each.row.id === row)
      if (spec?.shipped === undefined) throw new Error(`the release ships no row ${row}`)
      const { provides, injects } = spec.manifest
      return {
        declaration: {
          row,
          provides,
          injects,
          ...(spec.swap === undefined ? {} : { swap: spec.swap }),
          ...(spec.contracts === undefined ? {} : { contracts: spec.contracts }),
        },
        plugin: spec.shipped,
      }
    },
  }
}

const versionRow = z.strictObject({
  declaration: z.strictObject({
    row: z.string(),
    provides: z.array(z.string()),
    injects: z.array(z.string()),
    swap: z.enum(['implementation', 'rerun', 'restart']).optional(),
    contracts: z.record(z.string(), z.string()).optional(),
  }),
  plugin: z.custom<Plugin.Object>(
    value =>
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'apply') === 'function',
  ),
})

const swapRequest = z.strictObject({
  op: z.literal('swap'),
  row: z.string(),
  directory: z.string(),
})

export type SwapInput = Readonly<{
  rows: readonly RowSpec[]
  loaded: readonly LoadedRow[]
  trust: Trust
  applied: readonly string[]
  wrap: (id: RowId, plugin: Plugin.Object) => Plugin.Object
  /** The row has a new generation: whoever keeps its fiber is told in the step that swaps. */
  swapped: (row: LoadedRow, fiber: Fiber) => void
  handles: Pick<RowSupervision, 'stage' | 'unstage' | 'promote'>
  stopWithin: Readonly<{ ms: number; now: () => number }>
  /** What was swapped is not what the impact said: the process is to take a new one. */
  mismatched: (row: string) => void
  write: (record: Line & { kind: string }) => void
}>

const declared = (spec: RowSpec): DeclaredRow =>
  declareRow({
    name: spec.row.id,
    provides: spec.manifest.provides,
    injects: spec.manifest.injects,
    ...(spec.swap === undefined ? {} : { swap: spec.swap }),
    ...(spec.contracts === undefined ? {} : { contracts: spec.contracts }),
  })

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Answers the swap requests of the control port, one at a time: the impact first, then what became of it. */
export function createSwapper(input: SwapInput) {
  let busy = false
  const kit = kitOf(input.rows)
  const refuse = (tell: (line: Line) => void, reason: string, detail: string): void =>
    tell({ kind: 'result', outcome: 'refused', reason, detail })

  async function swap(row: string, directory: string, tell: (line: Line) => void): Promise<void> {
    const spec = input.rows.find(each => each.row.id === row)
    const live = input.loaded.find(each => each.id === row)
    if (spec === undefined || live === undefined)
      return refuse(tell, 'unknown-row', `this process serves no row ${row}`)
    const version = await loadVersion(directory, input.trust)
    if (version.kind === 'refused') return refuse(tell, version.reason, version.detail)
    const make: unknown = Reflect.get(Object(version.module), 'row')
    if (typeof make !== 'function')
      return refuse(tell, 'not-a-row', 'the entry file exports no function `row`')
    const made = versionRow.safeParse(await make(kit))
    if (!made.success)
      return refuse(tell, 'not-a-row', 'the entry file gives no { declaration, plugin }')
    const { declaration, plugin } = made.data
    const plan = planChange(input.rows.map(declared), {
      kind: 'replace',
      row,
      next: declareRow({
        name: declaration.row,
        provides: declaration.provides,
        injects: declaration.injects,
        ...(declaration.swap === undefined ? {} : { swap: declaration.swap }),
        ...(declaration.contracts === undefined ? {} : { contracts: declaration.contracts }),
      }),
    })
    if (plan.kind === 'refused') return refuse(tell, plan.reason, plan.detail.join('; '))
    const impact = { way: plan.way, reruns: plan.reruns, reasons: plan.reasons }
    tell({ kind: 'impact', row, source: version.by, ...impact })
    if (plan.way !== 'implementation')
      return refuse(
        tell,
        'needs-new-process',
        `this change is not a swap of the implementation (${plan.way}): install it as a version of the server and restart`,
      )
    const before = input.applied.length
    const next = input.wrap(live.id, { ...plugin, name: row })
    const { handles, stopWithin } = input
    if (spec.manifest.phase !== null) handles.stage(row)
    const swapped = await swapRow(live.ctx, {
      old: live.fiber,
      next,
      config: spec.row.config,
      entries: spec.entries ?? [],
      // The generation that left stops as it does at a shutdown; then the new one starts, and the old is unloaded.
      swapped: async fiber => {
        input.swapped(live, fiber)
        const handle = handles.promote(row)
        if (handle === undefined) return
        await handle.replaced?.stop(stopWithin.now() + stopWithin.ms).catch(() => undefined)
        await handle.serving.start?.()
      },
    })
    if (swapped.kind === 'refused') {
      handles.unstage(row)
      return refuse(tell, swapped.reason, swapped.detail)
    }
    input.write({ kind: 'row-swap', row, source: version.by, digest: version.digest, ...impact })
    tell({ kind: 'result', outcome: 'swapped', row, digest: version.digest })
    void swapped.drained
      .catch(() => undefined)
      .then(() => {
        const ran = input.applied.slice(before)
        const expected = [row, ...plan.reruns]
        if (ran.length === expected.length && ran.every(each => expected.includes(each))) return
        input.write({ kind: 'swap-mismatch', row, expected, actual: ran })
        input.mismatched(row)
      })
  }

  return async (request: unknown, tell: (line: Line) => void): Promise<void> => {
    const asked = swapRequest.safeParse(request)
    if (!asked.success)
      return refuse(tell, 'bad-request', 'expected { op: "swap", row, directory }')
    if (busy) return refuse(tell, 'busy', 'another swap is in progress')
    busy = true
    try {
      await swap(asked.data.row, asked.data.directory, tell)
    } catch (error) {
      refuse(tell, 'failed', messageOf(error))
    } finally {
      busy = false
    }
  }
}
