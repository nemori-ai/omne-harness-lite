import type { SessionPresentation } from './session-presentation.ts'

export function presentationLines(presentation: SessionPresentation): readonly string[] {
  const lines = presentation.items.flatMap(item => {
    switch (item.kind) {
      case 'text':
        return item.text.split(/\r?\n/u)
      case 'thinking':
        return ['Reasoning summary', ...item.text.split(/\r?\n/u)]
      case 'tool':
        return [`Tool: ${item.text}: ${item.state ?? 'requested'}`]
    }
  })
  if (presentation.omitted)
    lines.push('Some live content was omitted. The saved result will follow.')
  return lines.length ? lines : ['Waiting for the model…']
}
