import type { ToolBodyDeclaration, ToolBodyRepresentation } from '@omne-harness/tool-contract'

export function bodyRepresentation(body: ToolBodyDeclaration): ToolBodyRepresentation | null {
  switch (body.kind) {
    case 'none':
      return null
    case 'text':
      return body
    case 'json-document':
      return { kind: body.kind, codec: body.codec, schema: body.document.identity }
    case 'json-lines':
      return { kind: body.kind, codec: body.codec, recordSchema: body.record.identity }
  }
}
