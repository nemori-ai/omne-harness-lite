import type { Plugin } from '@deepseek-ai/cordis'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'

export const placeholder = (text: string, scope?: string) => (
  <p data-placeholder={text} data-scope={scope ?? ''}>
    {text}
  </p>
)

export function fakeGate(text = '登录门占位'): Plugin.Object {
  return defineUiModule({
    name: 'fake-gate',
    inject: [],
    apply(shell) {
      shell.contribute('gate', { id: 'fake.gate', render: () => placeholder(text) })
    },
  })
}

export function fakePage(page: {
  id: string
  title: string
  order: number
  service: string
  icon?: string
}): Plugin.Object {
  return defineUiModule({
    name: `fake-page-${page.id}`,
    inject: [page.service],
    apply(shell) {
      shell.contribute('pages', {
        id: page.id,
        title: page.title,
        order: page.order,
        ...(page.icon === undefined ? {} : { icon: page.icon }),
        render: ({ scope }) => placeholder(`${page.title}占位`, scope),
      })
    },
  })
}

export function fakeSidebar(item: { id: string; order: number; text: string }): Plugin.Object {
  return defineUiModule({
    name: `fake-sidebar-${item.id}`,
    inject: [],
    apply(shell) {
      shell.contribute('sidebar', {
        id: item.id,
        order: item.order,
        render: ({ scope }) => placeholder(item.text, scope),
      })
    },
  })
}
