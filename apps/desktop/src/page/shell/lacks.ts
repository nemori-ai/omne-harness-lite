import type { ProtocolKey, ProtocolStanding } from '@omne-harness/client-assembly'
import type { Missing } from '@omne-harness/dynamis'
import { PROTOCOLS_POINT } from '@omne-harness/shell-contract'

export type Standing = (key: ProtocolKey) => ProtocolStanding

type Why = 'absent' | 'conflict' | 'doubled' | 'unheld'

/** What one page cannot be drawn without now. */
export type Lack =
  | Readonly<{ kind: 'connecting' }>
  | Readonly<{ kind: 'point'; point: string }>
  | Readonly<{ kind: 'protocol'; wanted: string; why: Why }>
  | Readonly<{
      kind: 'protocol'
      wanted: string
      why: 'other-major'
      served: readonly number[]
      majors: readonly number[]
    }>

export type PageLacks = Readonly<{
  of(pageId: string): readonly Lack[]
  subscribe(listener: () => void): () => void
}>

const KEY = /^(.+)\/v(\d+)$/u

function keyOf(text: string): ProtocolKey | undefined {
  const [, name, major] = KEY.exec(text) ?? []
  return name === undefined ? undefined : { name, major: Number(major) }
}

/** One missing reference of a module as what its page lacks: the registry says it is missing, the connection says why. */
export function lackOf(missing: Missing, standing: Standing): Lack {
  const { point, anyOf } = missing.reference
  const keys = anyOf.flatMap(text => keyOf(text) ?? [])
  const [first] = anyOf
  if (point !== PROTOCOLS_POINT || missing.answer === 'unavailable' || first === undefined)
    return { kind: 'point', point }
  if (missing.answer === 'conflict') return { kind: 'protocol', wanted: first, why: 'doubled' }
  const stands = keys.map(standing)
  const kinds = new Set(stands.map(stand => stand.kind))
  if (kinds.has('connecting')) return { kind: 'connecting' }
  if (kinds.has('conflict')) return { kind: 'protocol', wanted: first, why: 'conflict' }
  if (kinds.has('open')) return { kind: 'protocol', wanted: first, why: 'unheld' }
  const served = stands.flatMap(stand => (stand.kind === 'other-major' ? stand.served : []))
  if (served.length === 0) return { kind: 'protocol', wanted: first, why: 'absent' }
  const majors = keys.map(key => key.major)
  return {
    kind: 'protocol',
    wanted: first,
    why: 'other-major',
    served: [...new Set(served)],
    majors,
  }
}

const LEAD = '这一页现在用不了：'

const WHY: Readonly<Record<Why, (wanted: string) => string>> = {
  absent: wanted => `服务端没有提供它要用的 ${wanted}。`,
  conflict: wanted => `它要用的 ${wanted} 在服务端有两份，都没有生效。`,
  doubled: wanted => `它要用的 ${wanted} 在这个应用里装了两份，都没有生效。`,
  unheld: wanted => `这个应用没有装 ${wanted} 的客户端。`,
}

function olderSide(served: readonly number[], majors: readonly number[]): string {
  if (served.every(major => major > Math.max(...majors))) return '这个应用的版本旧了，需要更新。'
  if (served.every(major => major < Math.min(...majors))) return '服务端的版本旧了。'
  return ''
}

/** The one sentence a page that lacks something is drawn as. A connecting page is drawn as loading, with no sentence. */
export function lackText(lack: Exclude<Lack, { kind: 'connecting' }>): string {
  if (lack.kind === 'point') return `${LEAD}它要用的 ${lack.point} 没有人提供。`
  if (lack.why !== 'other-major') return `${LEAD}${WHY[lack.why](lack.wanted)}`
  const served = lack.served.map(major => `v${major}`).join('、')
  return `${LEAD}它要用的是 ${lack.wanted}，服务端提供的是 ${served}。${olderSide(lack.served, lack.majors)}`
}
