import { defineKeyedPoint, type KeyedPoint, type PointCodec } from '@omne-harness/shell-contract'
import type { RangeChoice } from './model/range.ts'

export const USAGE_WIDGET = 'usage.widget'
export const USAGE_PRESENTATION = 'usage.presentation'

/** What a widget is asked to show: one session or the tenant, over one range of whole local days. */
export type WidgetSubject = Readonly<{ session: string | null; range: RangeChoice }>

const json = <S>(accepts: (value: unknown) => value is S): PointCodec<S> => ({
  encode: value => JSON.stringify(value),
  decode: text => {
    try {
      const value: unknown = JSON.parse(text)
      return accepts(value) ? value : undefined
    } catch {
      return undefined
    }
  },
})

const RANGE_NAMES: readonly unknown[] = ['today', 'week', 'month', 'quarter']
const isWidgetSubject = (value: unknown): value is WidgetSubject => {
  if (typeof value !== 'object' || value === null) return false
  const { session, range } = value as Record<string, unknown>
  return (session === null || typeof session === 'string') && RANGE_NAMES.includes(range)
}
const isData = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

export const usageWidget: KeyedPoint<WidgetSubject> = defineKeyedPoint({
  name: USAGE_WIDGET,
  subject: json(isWidgetSubject),
})

export const usagePresentation: KeyedPoint<Readonly<Record<string, unknown>>> = defineKeyedPoint({
  name: USAGE_PRESENTATION,
  subject: json(isData),
})
