/**
 * Declarative field specifications for XML rendering.
 *
 * A schema says which fields of a data object are rendered, where each one goes
 * (attribute, child element or tag content) and under what condition. The schema
 * is data, not a base class: any plain object, class instance or Map that exposes
 * the declared fields can be rendered against it.
 */

/** Where one field is placed in the rendered XML. */
export type FieldPresentation = 'attr' | 'element' | 'content'

/**
 * Condition for rendering a field at all.
 *
 * - `always`: render even when the value is `null` or `undefined` (as empty text).
 * - `not_nullish`: skip `null` and `undefined`.
 * - `not_empty`: additionally skip empty strings, arrays, Maps, Sets and objects
 *   without own enumerable keys. Numbers and booleans are never considered empty.
 */
export type IncludeWhen = 'always' | 'not_nullish' | 'not_empty'

/** Fields shared by every presentation. */
interface FieldCommon {
  readonly xmlName?: string
  readonly includeWhen?: IncludeWhen
}

/**
 * One field. Attribute and content presentations cannot carry element-only
 * settings. Omitting `presentation` means an element.
 */
export type FieldSpec =
  | (FieldCommon & { readonly presentation: 'attr' | 'content' })
  | (FieldCommon & {
      readonly presentation?: 'element'
      readonly attrs?: Readonly<Record<string, string>>
      readonly itemTag?: string
      readonly itemFields?: Readonly<Record<string, FieldPresentation>>
    })

/**
 * Field path to specification. A path may contain dots to read nested values
 * (`metadata.kind`); each segment is read as a property or a Map key.
 */
export type FieldSpecs = Readonly<Record<string, FieldSpec>>

/** How one kind of object is rendered. */
export interface XmlSchema {
  /** Root element name. */
  readonly tag: string
  /** Fields rendered on every call, in declaration order. */
  readonly requiredFields: FieldSpecs
  /**
   * Fields rendered only when selected through `FormattingOptions.extraFields`,
   * in declaration order after the required fields.
   */
  readonly optionalFields?: FieldSpecs
}
