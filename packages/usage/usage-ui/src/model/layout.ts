export const POSITIONS = ['tenant', 'session', 'status'] as const
export type Position = (typeof POSITIONS)[number]
export const SHAPES = ['series', 'breakdown', 'reading'] as const
export type Shape = (typeof SHAPES)[number]
export const WIDTHS = [1, 2, 3] as const
export type Width = (typeof WIDTHS)[number]

export type LayoutItem = Readonly<{ widget: string; width: Width; presentation: string | null }>
export type Layout = readonly LayoutItem[]
export type Layouts = Readonly<Partial<Record<Position, Layout>>>

export type Arranged =
  | Readonly<{ kind: 'present'; item: LayoutItem; index: number }>
  | Readonly<{ kind: 'missing'; item: LayoutItem; index: number }>

export type Picked =
  | Readonly<{ kind: 'chosen'; presentation: string }>
  | Readonly<{ kind: 'fallback'; presentation: string }>
  | Readonly<{ kind: 'undrawable' }>

/** The later source wins whole: the user's layout, else the assembly's, else the module's. */
export function layoutOf(
  position: Position,
  sources: Readonly<{
    module: Layouts
    assembly?: Layouts | undefined
    user?: Layouts | undefined
  }>,
): Layout {
  return sources.user?.[position] ?? sources.assembly?.[position] ?? sources.module[position] ?? []
}

/** The layout alone decides what shows: each item is a registered widget or a placeholder for one. */
export const arrange = (layout: Layout, registered: ReadonlySet<string>): readonly Arranged[] =>
  layout.map((item, index) =>
    registered.has(item.widget)
      ? { kind: 'present', item, index }
      : { kind: 'missing', item, index },
  )

/** The chosen presentation of the shape, else the one the widget declares, else none at all. */
export function pick(
  chosen: string | null,
  fallback: string,
  available: ReadonlySet<string>,
): Picked {
  if (chosen !== null && available.has(chosen)) return { kind: 'chosen', presentation: chosen }
  if (available.has(fallback))
    return { kind: chosen === null ? 'chosen' : 'fallback', presentation: fallback }
  return { kind: 'undrawable' }
}

export const addTo = (layout: Layout, widget: string, width: Width = 1): Layout => [
  ...layout,
  { widget, width, presentation: null },
]

export const removeAt = (layout: Layout, index: number): Layout =>
  layout.filter((_item, at) => at !== index)

export function moveAt(layout: Layout, index: number, by: -1 | 1): Layout {
  const to = index + by
  if (index < 0 || index >= layout.length || to < 0 || to >= layout.length) return layout
  const next = [...layout]
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item as LayoutItem)
  return next
}

export const resizeAt = (layout: Layout, index: number, width: Width): Layout =>
  layout.map((item, at) => (at === index ? { ...item, width } : item))

export const presentAt = (layout: Layout, index: number, presentation: string | null): Layout =>
  layout.map((item, at) => (at === index ? { ...item, presentation } : item))

const isWidth = (value: unknown): value is Width => (WIDTHS as readonly unknown[]).includes(value)

function itemOf(value: unknown): LayoutItem | null {
  if (typeof value !== 'object' || value === null) return null
  const { widget, width, presentation } = value as Record<string, unknown>
  if (typeof widget !== 'string' || widget === '' || !isWidth(width)) return null
  if (presentation !== null && typeof presentation !== 'string') return null
  return { widget, width, presentation }
}

/** A stored set of layouts read back; anything not of the shape is left out, never guessed. */
export function layoutsOf(value: unknown): Layouts {
  if (typeof value !== 'object' || value === null) return {}
  const read: Partial<Record<Position, Layout>> = {}
  for (const position of POSITIONS) {
    const items = (value as Record<string, unknown>)[position]
    if (!Array.isArray(items)) continue
    const parsed = items.map(itemOf)
    if (parsed.every((item): item is LayoutItem => item !== null)) read[position] = parsed
  }
  return read
}
