import type { ToolBodyPage } from '@omne-harness/tool-contract'

export function textPage(page: ToolBodyPage): Extract<ToolBodyPage, { kind: 'text' }> {
  if (page.kind !== 'text') throw new Error(`expected text page, got ${page.kind}`)
  return page
}
