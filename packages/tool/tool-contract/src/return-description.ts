import { writeJsonText } from '@omne-harness/json-text'
import type { ToolPublishedSchema, ToolReturnDeclaration } from './definitions.ts'

function schemaName(schema: ToolPublishedSchema): string {
  return `${schema.identity.id}@${schema.identity.revision}`
}

function valueSummary(schema: ToolPublishedSchema): string {
  const value = schema.definition.schema
  const type =
    value.kind === 'object' ? value.entries.find(entry => entry.key === 'type')?.value : undefined
  return type?.kind === 'string' ? `${type.value} (${schemaName(schema)})` : schemaName(schema)
}

export function returnSummary(returns: ToolReturnDeclaration): string {
  const value = returns.kind === 'ordinary' ? valueSummary(returns.value.value) : 'ToolResult'
  const program =
    returns.program.kind === 'none'
      ? 'none'
      : `JSON (${returns.program.schema.id}@${returns.program.schema.revision})`
  return `Returns ${value}. Model body: ${returns.body.kind}. Program data: ${program}.`
}

function schemaGuide(label: string, schema: ToolPublishedSchema): string[] {
  return [
    `${label} schema ${schemaName(schema)} (${schema.identity.digest}): ${writeJsonText(schema.definition.schema)}`,
    `${label} vocabulary: ${JSON.stringify(schema.definition.vocabulary)}`,
    ...schema.definition.descriptions.map(item => `${item.path}: ${item.text}`),
  ]
}

export function returnGuide(returns: ToolReturnDeclaration): string {
  const lines = [returnSummary(returns)]
  if (returns.kind === 'ordinary') {
    lines.push(`Return codec: ${JSON.stringify(returns.value.codec)}`)
    lines.push(...schemaGuide('Return value', returns.value.value))
  } else {
    lines.push(`Return contract: ${JSON.stringify(returns.value.contract)}`)
  }
  switch (returns.body.kind) {
    case 'none':
    case 'text':
      break
    case 'json-document':
      lines.push(...schemaGuide('Body document', returns.body.document))
      break
    case 'json-lines':
      lines.push(...schemaGuide('Body record', returns.body.record))
      break
  }
  if (returns.body.kind !== 'none') lines.push(`Body codec: ${JSON.stringify(returns.body.codec)}`)
  if (returns.program.kind === 'json') {
    lines.push(`Program contract: ${JSON.stringify(returns.program.contract)}`)
    lines.push(`Program byte limit: ${returns.program.maxBytes}`)
    lines.push(
      ...schemaGuide('Program data', {
        identity: returns.program.schema,
        definition: returns.program.definition,
      }),
    )
  }
  lines.push(`Offloading policy: ${JSON.stringify(returns.offloading)}`)
  return lines.join('\n')
}
