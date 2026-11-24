import { createCodePlugin, type ThemeInput } from '@streamdown/code'
import { cjk } from '@streamdown/cjk'
import { createMermaidPlugin } from '@streamdown/mermaid'
import { math } from '@streamdown/math'
import { type PluginConfig } from 'streamdown'

const INK = 'var(--omne-code-ink)'
const RESERVED = 'var(--omne-code-keyword)'
const LITERAL = 'var(--omne-code-literal)'
const COMMENT = 'var(--omne-code-comment)'

const RESTRAINED_THEME: ThemeInput = {
  name: 'omne-restrained',

  type: 'light',
  colors: { 'editor.foreground': INK, 'editor.background': 'var(--omne-code-surface)' },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: COMMENT },
    },
    {
      scope: [
        'string',
        'string.regexp',
        'constant.numeric',
        'constant.language',
        'constant.character',
        'constant.other.symbol',
        'markup.inline.raw',
      ],
      settings: { foreground: LITERAL },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'variable.language',
        'entity.name.tag',
        'punctuation.definition.tag',
        'markup.heading',
        'markup.bold',
      ],
      settings: { foreground: RESERVED },
    },

    {
      scope: [
        'keyword.operator',
        'punctuation.definition.template-expression',
        'punctuation.section.embedded',
        'meta.embedded',
        'meta.template.expression',
      ],
      settings: { foreground: INK },
    },

    {
      scope: [
        'keyword.operator.new',
        'keyword.operator.expression',
        'keyword.operator.logical.python',
        'keyword.operator.wordlike',
        'keyword.operator.delete',
      ],
      settings: { foreground: RESERVED },
    },
  ],
}

export const MARKDOWN_PLUGINS: PluginConfig = {
  cjk,
  math,
  mermaid: createMermaidPlugin({
    config: { securityLevel: 'strict', fontFamily: 'var(--omne-font-ui)' },
  }),
  code: createCodePlugin({ themes: [RESTRAINED_THEME, RESTRAINED_THEME] }),
}
