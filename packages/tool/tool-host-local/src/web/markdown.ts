import TurndownService from 'turndown'

const REMOVED_NODES = [
  'head',
  'title',
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'canvas',
] as const

const UNSAFE_TARGET = /^\s*(javascript|data|vbscript):/iu
const isUnsafe = (value: string | null): boolean => value !== null && UNSAFE_TARGET.test(value)
type AttributeNode = Readonly<{ getAttribute?: (name: string) => string | null }>
const attribute = (node: AttributeNode, name: string): string | null =>
  typeof node.getAttribute === 'function' ? node.getAttribute(name) : null

function service(): TurndownService {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  turndown.remove([...REMOVED_NODES])
  turndown.addRule('unsafe-link', {
    filter: node => node.nodeName === 'A' && isUnsafe(attribute(node, 'href')),
    replacement: content => content,
  })
  turndown.addRule('data-image', {
    filter: node => node.nodeName === 'IMG' && isUnsafe(attribute(node, 'src')),
    replacement: (_content, node) => attribute(node, 'alt') ?? '',
  })
  return turndown
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function plainText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|head)\b[\s\S]*?<\/\1\s*>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole: string, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X'))
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
      if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/[ \t\f\u000b ]+/gu, ' ') // oxlint-disable-line no-control-regex -- The vertical tab is listed on purpose; the escape form keeps the class parseable for mutation tooling.
    .replace(/\s*\n\s*/gu, '\n')
    .trim()
}

export type MarkdownConversion = Readonly<{ markdown: string; fallback: boolean }>

export function htmlToMarkdown(html: string): MarkdownConversion {
  try {
    return { markdown: service().turndown(html), fallback: false }
  } catch {
    return { markdown: plainText(html), fallback: true }
  }
}
