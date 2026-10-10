import type { SessionPresentation } from './session-presentation.ts'
import { humanBlockLines } from './session-terminal-output.ts'

export function presentationLines(presentation: SessionPresentation): readonly string[] {
  const lines = humanBlockLines(presentation.items)
  if (presentation.omitted) lines.push('Some live content was omitted by display limits.')
  return lines.length ? lines : ['Waiting for the model…']
}
