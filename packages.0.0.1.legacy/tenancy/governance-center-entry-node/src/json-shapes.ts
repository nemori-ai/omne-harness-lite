export interface JsonLimits {
  /** 顶层的对象或数组是第 1 层。 */
  readonly depth: number
  /** 任何一个对象的成员个数，同名成员出现几次计几个。 */
  readonly members: number
}

/** 一处重复：`path` 是那个对象在文档里的位置（成员名与数组下标），`name` 是按转义还原后的成员名。 */
export interface DuplicateMember {
  readonly path: readonly (string | number)[]
  readonly name: string
}

export type JsonReading =
  /**
   * 读下来了。对象里同名成员只保留第一次出现的值，其余每一处都报在 `duplicates`——**调用方不得据保留的那个值
   * 判那个成员**（S-8：不取其一），它只让排在前面的判定步骤照常进行。
   * 数的取值见 {@link jsonNumberValue}。
   */
  | {
      readonly kind: 'value'
      readonly value: unknown
      readonly duplicates: readonly DuplicateMember[]
    }
  | { readonly kind: 'unreadable'; readonly level: 1 | 2 | 3 }
  | { readonly kind: 'exceeds-limit' }
