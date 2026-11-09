// HTML to Markdown for the Web fetch provider: turndown over a parsed DOM, with the non-content
// nodes removed first and the unsafe link targets cleared. A conversion that throws (for example a
// stack overflow on a very deep tree) falls back to the plain text of the HTML; it never throws.
import TurndownService from 'turndown'

/** Nodes whose content is never page text for the model. `title` and `head` keep the heading out. */
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
/** turndown types its nodes with the DOM library, which this package does not load; read by duck type. */
type AttributeNode = Readonly<{ getAttribute?: (name: string) => string | null }>
const attribute = (node: AttributeNode, name: string): string | null =>
  typeof node.getAttribute === 'function' ? node.getAttribute(name) : null

function service(): TurndownService {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  turndown.remove([...REMOVED_NODES])
  // Links to scripts or inline data keep their text and lose the target; data images keep the alt.
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

/** The visible text of the HTML without any parser: the fallback when the DOM conversion fails. */
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
    .replace(/[ \t\f\v ]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim()
}

export type MarkdownConversion = Readonly<{ markdown: string; fallback: boolean }>

/** Converts one HTML document. `fallback` is true when the DOM conversion threw and plain text was used. */
export function htmlToMarkdown(html: string): MarkdownConversion {
  try {
    return { markdown: service().turndown(html), fallback: false }
  } catch {
    return { markdown: plainText(html), fallback: true }
  }
}
