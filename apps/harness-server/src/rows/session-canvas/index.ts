import type { Context } from '@deepseek-ai/cordis'
import type { KindDeclaration, KindName } from '@omne-harness/canvas-contract'
import { canvasKey, putKind } from '@omne-harness/canvas-cordis-contract/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { defineRow } from '../../row.ts'

/** A session has nothing to hold first: whether it can be read is asked when it is drawn. */
export const sessionKind: KindDeclaration = Object.freeze({
  name: 'session.session' as KindName,
  label: '会话',
  summary: '和 agent 的一段对话：纸上写它的标题、最近一次活动与状态。',
  reference: '标识就是会话标识。',
})

/** Sessions on the canvas; without this row the canvas works and has no kind for them. */
export const sessionCanvasRow = defineRow({
  row: 'session-canvas',
  implementation: 'real',
  manifest: { provides: [], injects: [dynamisKey, canvasKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'session-canvas',
    inject: [dynamisKey, canvasKey],
    apply(ctx: Context) {
      putKind(ctx, sessionKind)
    },
  },
})
