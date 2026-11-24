import {
  readGuidanceOriginals,
  type GuidanceOrigins,
  type OriginalHistory,
} from './guidance-originals.ts'
import {
  workspaceGuidanceScopeSchema,
  workspaceGuidanceBodySchema,
  workspaceGuidanceManifestSchema,
  WORKSPACE_GUIDANCE_PROVENANCE,
  type WorkspaceGuidanceScope,
} from '../workspace-guidance.ts'
import { UNKNOWN_MODEL_PROVENANCE } from '@omne-harness/session-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelReminderFailure } from './model-reminders.ts'
import type { ModelViewBasis, SessionAccess, SessionHistory } from '@omne-harness/session-contract'
import { emptyGuidanceIndex, extendGuidanceIndex, type GuidanceIndex } from './guidance-window.ts'

export type GuidanceHistory = Readonly<{
  summaryBoundaries: readonly string[]
  summarizedScopes: readonly WorkspaceGuidanceScope[]
  originals?: () => Promise<Outcome<GuidanceOrigins, ModelReminderFailure>>
  basis: ModelViewBasis
  resume: string | null
  index: GuidanceIndex
}>

/** Every read requalifies. Only a verified prefix of the same effective epoch can satisfy a source. */
export async function readGuidanceHistory<P>(
  history: Pick<SessionHistory<P>, 'readModelView'> & Partial<OriginalHistory<P>>,
  access: SessionAccess<P>,
  partition: string,
  previous?: GuidanceHistory,
): Promise<Outcome<GuidanceHistory, ModelReminderFailure>> {
  const originalPort =
    history.begin && history.next
      ? { begin: history.begin.bind(history), next: history.next.bind(history) }
      : undefined
  const original =
    originalPort === undefined
      ? undefined
      : (before?: string) => readGuidanceOriginals(originalPort, access, partition, before)
  let cached = previous?.resume == null ? undefined : previous
  let index = cached?.index ?? emptyGuidanceIndex()
  const summaries = new Set(cached?.summaryBoundaries ?? [])
  let summarized = new Map(
    (cached?.summarizedScopes ?? []).map(scope => [JSON.stringify(scope), scope]),
  )
  let after = cached?.resume ?? null
  let basis: ModelViewBasis | null = null
  for (;;) {
    const page = await history.readModelView({
      ...access,
      basis,
      after,
      resumeAtEnd: true,
      pageBytes: 1_048_576,
    })
    if (
      cached &&
      ('failure' in page
        ? page.failure.kind === 'invalid'
        : page.ok.kind !== 'page' || page.ok.basis.epoch !== cached.basis.epoch)
    ) {
      cached = undefined
      after = null
      basis = null
      index = emptyGuidanceIndex()
      summaries.clear()
      summarized.clear()
      continue
    }
    if ('failure' in page) {
      if (page.failure.kind === 'denied') return fail({ kind: 'denied' })
      return fail({
        kind: 'unavailable',
        diagnostic: 'Session model view: ' + JSON.stringify(page.failure),
      })
    }
    if (page.ok.kind !== 'page')
      return fail({
        kind: 'unavailable',
        diagnostic: 'the Session model view changed during preparation',
      })
    const authored = new Map<string, WorkspaceGuidanceScope>()
    for (const row of page.ok.rows) {
      const summary = row.message.role === 'compaction'
      if (summary) summaries.add(row.message.covers.to)
      if (
        summary &&
        (row.provenance === undefined ||
          row.provenance.some(source => source.owner === UNKNOWN_MODEL_PROVENANCE))
      ) {
        if (!original)
          return fail({
            kind: 'unavailable',
            diagnostic:
              'compacted model source provenance is unknown; original history is unavailable',
          })
        const legacy = await original(row.entry)
        if ('failure' in legacy) return legacy
        for (const scope of legacy.ok.scopes) summarized.set(JSON.stringify(scope), scope)
      }
      for (const source of row.provenance ?? []) {
        if (source.owner !== WORKSPACE_GUIDANCE_PROVENANCE) continue
        try {
          const scope = workspaceGuidanceScopeSchema.safeParse(JSON.parse(source.key))
          if (!scope.success)
            return fail({
              kind: 'unavailable',
              diagnostic: 'compacted workspace guidance provenance is malformed',
            })
          if (summary) summarized.set(JSON.stringify(scope.data), scope.data)
          else if (row.message.role === 'system_reminder') {
            for (const id of source.blocks) {
              const block = row.message.blocks.find(block => block.id === id)
              if (block?.kind !== 'text' || !block.visibility.toModel) continue
              const raw = JSON.parse(block.text)
              const content = workspaceGuidanceBodySchema.safeParse(raw)
              const manifest = workspaceGuidanceManifestSchema.safeParse(raw)
              const claimed = content.success
                ? content.data.scope
                : manifest.success
                  ? manifest.data.scope
                  : null
              if (claimed === null || JSON.stringify(claimed) !== JSON.stringify(scope.data))
                return fail({
                  kind: 'unavailable',
                  diagnostic: 'workspace guidance author provenance conflicts with the block',
                })
              authored.set(id, scope.data)
            }
          }
        } catch {
          return fail({
            kind: 'unavailable',
            diagnostic: 'compacted workspace guidance provenance is malformed',
          })
        }
      }
    }
    index = extendGuidanceIndex(
      index,
      page.ok.rows.map(row => row.message),
      partition,
      authored,
    )
    if (page.ok.next === null) {
      const summaryBoundaries = [...summaries]
      return succeed({
        index,
        basis: page.ok.basis,
        resume: page.ok.resume ?? null,
        summaryBoundaries,
        summarizedScopes: [...summarized.values()],
        ...(original ? { originals: original } : {}),
      })
    }
    basis = page.ok.basis
    after = page.ok.next
  }
}
