import { type DataAttributes } from '../patterns/ai/data-attributes.ts'

export function dataApart<T extends object>(props: T): readonly [DataAttributes, T] {
  const data: Record<string, unknown> = {}
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props))
    (key.startsWith('data-') ? data : rest)[key] = value
  return [data as DataAttributes, rest as T]
}
