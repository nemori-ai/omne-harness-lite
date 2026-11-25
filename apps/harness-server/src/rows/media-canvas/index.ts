import type { Context } from '@deepseek-ai/cordis'
import type {
  AdmitInput,
  Admission,
  KindDeclaration,
  KindName,
} from '@omne-harness/canvas-contract'
import { canvasKey, putKind } from '@omne-harness/canvas-cordis-contract/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { Custody, Holder } from '@omne-harness/media-contract'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { readReferenceText } from '@omne-harness/media-protocol'
import { defineRow } from '../../row.ts'

export type MediaCustody = Pick<Custody, 'hold'>

export const MEDIA_HOLDER_OWNER = 'canvas'

/** The canvas's holder text is the whole of the work: it is fixed by tenant, canvas and reference. */
export const canvasHolder = (input: AdmitInput): Holder => ({
  owner: MEDIA_HOLDER_OWNER,
  work: input.holder,
  position: input.ref,
  purpose: 'placement',
})

const REFUSED: Admission = Object.freeze({ kind: 'refused' })
const UNAVAILABLE: Admission = Object.freeze({ kind: 'basis-unavailable' })

/** The kind `media.object`: before it is put on, media holds the object for the canvas's holder. */
export function mediaObjectKind(custodyOf: () => MediaCustody | undefined): KindDeclaration {
  async function admit(input: AdmitInput): Promise<Admission> {
    const ref = readReferenceText(input.ref)
    if (ref === null) return REFUSED
    const custody = custodyOf()
    if (custody === undefined) return UNAVAILABLE
    const tenant = tenantCodec.parse(input.tenant)
    if (!tenant.ok) throw new TypeError('media-canvas: the tenant is not a tenant identity')
    const held = await custody.hold({ tenant: tenant.value, ref, holder: canvasHolder(input) })
    if ('ok' in held) return { kind: 'admitted' }
    // Absent, of another tenant and being deleted are one answer: the reference is invalid.
    if (held.failure.kind === 'invalid-reference') return REFUSED
    return held.failure.kind === 'outcome-unknown' ? { kind: 'unknown' } : UNAVAILABLE
  }
  return Object.freeze({
    name: 'media.object' as KindName,
    label: '媒体对象',
    summary: '上传到这个租户的一份图片、语音或文件。',
    reference:
      '内容引用写成的一行 JSON：五个字段都是文本，按 storage、key、mediaType、bytes、digest 的次序，' +
      '中间没有空白，例如 {"storage":"local","key":"…","mediaType":"image/png","bytes":"2048","digest":"sha256:…"}。' +
      '照上传提交答的引用原样写。',
    admit,
  })
}

/** Takes media's custody again at every admit: without media the kind answers basis-unavailable. */
export function mediaCanvasPlugin(custodyOf: (ctx: Context) => MediaCustody | undefined) {
  return {
    name: 'media-canvas',
    inject: [dynamisKey, canvasKey],
    apply(ctx: Context) {
      putKind(
        ctx,
        mediaObjectKind(() => custodyOf(ctx)),
      )
    },
  }
}

/** Media objects on the canvas; without this row the canvas works and has no kind for them. */
export const mediaCanvasRow = defineRow({
  row: 'media-canvas',
  implementation: 'real',
  manifest: { provides: [], injects: [dynamisKey, canvasKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: mediaCanvasPlugin(ctx => ctx.get(mediaKey)?.custody),
})
