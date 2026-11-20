import type { ModelView } from '@omne-harness/dispatch-session'
import type { ModelViewBasis, SessionHistory } from '@omne-harness/session-contract'

const PAGE_BYTES = 262_144
const UNAVAILABLE = { kind: 'unavailable' } as const
type Answer = Readonly<{ kind: 'read'; value: ModelView | 'gone' }> | typeof UNAVAILABLE
type Read = SessionHistory<unknown>['readModelView']
type Access = Pick<Parameters<Read>[0], 'principal' | 'tenant' | 'session'>

/** The moment as dispatch keeps it: the generation of the view and the last row it holds. */
function basisOf(moment: string | null): ModelViewBasis | null | undefined {
  if (moment === null) return null
  try {
    const parsed: unknown = JSON.parse(moment)
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
    const [epoch, upper] = parsed as unknown[]
    return typeof epoch === 'string' && typeof upper === 'string' ? { epoch, upper } : undefined
  } catch {
    return undefined
  }
}

/** Reads the model view of a session up to a moment, page after page under the one basis the first page fixes. */
export async function readModelViewTo(
  read: Read,
  access: Access,
  moment: string | null,
): Promise<Answer> {
  const asked = basisOf(moment)
  if (asked === undefined) return { kind: 'read', value: 'gone' }
  const rows: ModelView['rows'][number][] = []
  let basis = asked
  let after: string | null = null
  for (;;) {
    const page = await read({ ...access, basis, after, pageBytes: PAGE_BYTES })
    if ('failure' in page) return UNAVAILABLE
    if (page.ok.kind === 'epoch-changed') return { kind: 'read', value: 'gone' }
    basis = page.ok.basis
    for (const { seq, bytes, message } of page.ok.rows) rows.push({ seq, bytes, message })
    if (page.ok.next === null) return { kind: 'read', value: { epoch: basis.epoch, rows } }
    after = page.ok.next
  }
}
