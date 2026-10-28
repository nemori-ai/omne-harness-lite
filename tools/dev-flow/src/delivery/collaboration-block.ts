import { InputError } from './protocol.ts'
import { strictJson } from './strict-json.ts'

export function collaborationBlock(body: string, marker: string): unknown {
  const lines = body.split('\n')
  const prefix = marker.slice(0, marker.lastIndexOf(':') + 1)
  const positions = lines.flatMap((line, index) =>
    line.startsWith(`\`\`\`json ${prefix}`) ? [index] : [],
  )
  const start = positions[0]
  if (positions.length !== 1 || start === undefined || lines[start] !== `\`\`\`json ${marker}`)
    throw new InputError(`collaboration-block-missing-or-conflicting: ${marker}`)
  const end = lines.findIndex((line, index) => index > start && line === '```')
  if (end < 0) throw new InputError(`collaboration-block-unclosed: ${marker}`)
  return strictJson(lines.slice(start + 1, end).join('\n'))
}
