import type { JsonValue } from '@omne-harness/sql-contract'

export type ExecutionItemKeyRecord = Readonly<{ execution?: string; family: string; item: string }>

export type ExecutionItemContentRecord = ExecutionItemKeyRecord & Readonly<{ payload: string }>

const keyFields = ({ execution, family, item }: ExecutionItemKeyRecord) => ({
  ...(execution === undefined ? {} : { execution }),
  family,
  item,
})

export function itemContentFacts(
  contents: readonly ExecutionItemContentRecord[],
  discards: readonly ExecutionItemKeyRecord[],
): Readonly<Record<string, JsonValue>> {
  return {
    ...(contents.length === 0
      ? {}
      : {
          contents: contents.map(content => ({ ...keyFields(content), payload: content.payload })),
        }),
    ...(discards.length === 0 ? {} : { discards: discards.map(keyFields) }),
  }
}

export function contentOf(
  item: Readonly<Record<string, JsonValue>> | null,
): Readonly<{ content?: string }> | null {
  const content = item?.['content']
  if (content === undefined) return {}
  return typeof content === 'string' ? { content } : null
}
