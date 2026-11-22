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
    needs: {},
    apply(shell) {
      shell.contribute('gate', { id: 'fake.gate', render: () => placeholder(text) })
    },
  })
}

/** A module the case loads when it gives the named thing, and unloads when it takes it back. */
export type Gated = Plugin.Object & Readonly<{ gatedBy: string }>

export function fakePage(page: {
  id: string
  title: string
  order: number
  service: string
  icon: string
}): Gated {
  const module = defineUiModule({
    name: `fake-page-${page.id}`,
    needs: {},
    apply(shell) {
      shell.contribute('pages', {
        id: page.id,
        title: page.title,
        order: page.order,
        icon: page.icon,
        render: ({ scope }) => placeholder(`${page.title}占位`, scope),
      })
    },
  })
  return Object.assign(module, { gatedBy: page.service })
}

export function fakeSidebar(
  item: { id: string; order: number; text: string },
  name = `fake-sidebar-${item.id}`,
): Plugin.Object {
  return defineUiModule({
    name,
    needs: {},
    apply(shell) {
      shell.contribute('sidebar', {
        id: item.id,
        order: item.order,
        render: ({ scope }) => placeholder(item.text, scope),
      })
    },
  })
}
