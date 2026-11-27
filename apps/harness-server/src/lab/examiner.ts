import type { Context } from '@deepseek-ai/cordis'
import type { ExaminationSettings } from '@omne-harness/goal-local'
import { defineRow } from '../row.ts'
import { goalHolder } from '../rows/goal/holder.ts'

export const LAB_EXAMINER_ROW = { id: 'lab-examiner', plugin: 'labExaminer', config: {} } as const

type Read = (tenant: string) => Promise<ExaminationSettings | null>

/** What a tenant set of examinations, with the model replaced: a read that gives nothing still gives nothing. */
export const underModel =
  (read: Read, model: string): Read =>
  async tenant => {
    const set = await read(tenant)
    return set === null ? null : { ...set, examiner: { ...set.examiner, model } }
  }

/** Only in the lab assembly: every examination runs under `model`, whatever the tenant set. The release lists only the pairs that were measured; this is how a pair gets measured before it is listed. */
export const labExaminerRow = (model: string) =>
  defineRow({
    row: LAB_EXAMINER_ROW.id,
    implementation: 'contract-double',
    manifest: { provides: [], injects: [], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      inject: [],
      apply(ctx: Context) {
        const holder = goalHolder(ctx)
        let read = holder.examination
        Object.defineProperty(holder, 'examination', {
          configurable: true,
          enumerable: true,
          get: () => (read === null ? null : underModel(read, model)),
          set: (next: Read | null) => {
            read = next
          },
        })
      },
    },
  })
