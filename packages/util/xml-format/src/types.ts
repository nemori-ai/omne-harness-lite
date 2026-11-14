export type FieldPresentation = 'attr' | 'element' | 'content'

export type IncludeWhen = 'always' | 'not_nullish' | 'not_empty'

interface FieldCommon {
  readonly xmlName?: string
  readonly includeWhen?: IncludeWhen
}

export type FieldSpec =
  | (FieldCommon & { readonly presentation: 'attr' | 'content' })
  | (FieldCommon & {
      readonly presentation?: 'element'
      readonly attrs?: Readonly<Record<string, string>>
      readonly itemTag?: string
      readonly itemFields?: Readonly<Record<string, FieldPresentation>>
    })

export type FieldSpecs = Readonly<Record<string, FieldSpec>>

export interface XmlSchema {
  readonly tag: string
  readonly requiredFields: FieldSpecs
  readonly optionalFields?: FieldSpecs
}
