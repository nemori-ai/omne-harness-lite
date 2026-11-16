import type { ReactNode } from 'react'
import { type Components, Streamdown } from 'streamdown'

import { MARKDOWN_PLUGINS } from './code-highlight.ts'
import { useDiagramOptions } from './markdown-diagrams.ts'
import { PROSE_TRANSLATIONS } from './translations.ts'

const EXTERNAL_REL = 'noreferrer noopener'

const LINKED_COMPONENTS: Components = {
  a: function ExternalLink({ href, children }) {
    const destination = typeof href === 'string' ? href : undefined
    return (
      <a href={destination} target="_blank" rel={EXTERNAL_REL}>
        {children as ReactNode}
      </a>
    )
  },
}

const UNLINKED_COMPONENTS: Components = {
  a: function LinkWords({ children }) {
    return <span>{children as ReactNode}</span>
  },
}

const DIAGRAM_FENCE = /(?:```|~~~)mermaid\b/
const BLOCK_SHAPE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|```|~~~|>|\|)/m
const INLINE_SHAPE = /(?:\$\$|\*\*|__|`[^`]+`|\[[^\]]+\]\([^)]+\))/

function isMarkdownShaped(text: string): boolean {
  return BLOCK_SHAPE.test(text) || INLINE_SHAPE.test(text)
}

export interface ProseProps {
  readonly text: string
  readonly isAnimating?: boolean
  readonly ownWords?: boolean
  readonly unlinked?: boolean
}

export function Prose({
  text,
  isAnimating = false,
  ownWords = false,
  unlinked = false,
}: ProseProps): React.JSX.Element {
  const hasDiagrams = DIAGRAM_FENCE.test(text)
  const diagrams = useDiagramOptions(hasDiagrams)
  if (ownWords && !isMarkdownShaped(text)) {
    return <span className="whitespace-pre-wrap">{text}</span>
  }
  return (
    <Streamdown
      key={hasDiagrams ? diagrams.config?.theme : 'prose'}
      className="omne-prose"
      plugins={MARKDOWN_PLUGINS}
      mermaid={diagrams}
      translations={PROSE_TRANSLATIONS}
      lineNumbers={false}
      mode={isAnimating ? 'streaming' : 'static'}
      animated={isAnimating}
      isAnimating={isAnimating}
      components={unlinked ? UNLINKED_COMPONENTS : LINKED_COMPONENTS}
    >
      {text}
    </Streamdown>
  )
}
