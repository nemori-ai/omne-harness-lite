import { bodyFields } from './body.ts'

export const workKinds = [
  'feature',
  'bug',
  'refactor',
  'performance',
  'maintenance',
  'investigation',
] as const
export type WorkKind = (typeof workKinds)[number]

export function readWorkKind(body: string): WorkKind | undefined {
  const values = bodyFields(body).get('主工作类型') ?? []
  return values.length === 1 ? workKinds.find(kind => kind === values[0]) : undefined
}
