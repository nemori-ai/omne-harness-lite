import type { JsonValue } from '@omne-harness/json-text'
import {
  defineKeyedPoint,
  definePoint,
  defineRenderPoint,
  type KeyedPoint,
  type Point,
  type PointCodec,
  type PointContributor,
  type PointItem,
  type RenderPoint,
} from '@omne-harness/shell-contract'

export type CategorySubject = Readonly<{ category: string }>

export type HoldingSubject = Readonly<{ category: string; name: string }>

const categorySubject: PointCodec<CategorySubject> = {
  encode: value => value.category,
  decode: text => ({ category: text }),
}

const LENGTH_PREFIX = /^(\d+):/

const holdingSubject: PointCodec<HoldingSubject> = {
  encode: ({ category, name }) => `${category.length}:${category}${name}`,
  decode: text => {
    const prefix = LENGTH_PREFIX.exec(text)
    if (prefix === null) return undefined
    const rest = text.slice(prefix[0].length)
    const length = Number(prefix[1])
    return length > rest.length
      ? undefined
      : { category: rest.slice(0, length), name: rest.slice(length) }
  },
}

/** `asset`: the one of the shown category the shell points at, when it names one. */
export type AssetsPageSubject = Readonly<{ asset?: string }>

const PAGE_SUBJECT = 'assets'

const pageSubject: PointCodec<AssetsPageSubject> = {
  encode: ({ asset }) => (asset === undefined ? PAGE_SUBJECT : `${PAGE_SUBJECT}:${asset}`),
  decode: text =>
    text === PAGE_SUBJECT
      ? {}
      : text.startsWith(`${PAGE_SUBJECT}:`)
        ? { asset: text.slice(PAGE_SUBJECT.length + 1) }
        : undefined,
}

export const ASSETS_CATEGORY = 'assets.category'
export const ASSETS_HOLDING = 'assets.holding'
export const ASSETS_CATEGORY_PAGE = 'assets.category-page'

export const assetsCategoryPage: Point<AssetsPageSubject> = definePoint({
  name: ASSETS_CATEGORY_PAGE,
  title: '资产里一类的页',
  summary:
    'The page of its own that a category brings to the assets page; the id of an item is the category.',
  subject: pageSubject,
})

export const assetsCategory: KeyedPoint<CategorySubject> = defineKeyedPoint({
  name: ASSETS_CATEGORY,
  title: '资产一类列表的上方',
  summary: 'What is shown above the list of one category.',
  key: 'the category chosen in the bar',
  subject: categorySubject,
})

/** An item of `assets.holding`; `claims` names the settings of the asset it draws itself. */
export type HoldingItem = PointItem<HoldingSubject> & Readonly<{ claims?: readonly string[] }>

export type HoldingPoint = Omit<KeyedPoint<HoldingSubject>, 'contribute'> &
  Readonly<{ contribute: (shell: PointContributor, key: string, item: HoldingItem) => void }>

export const assetsHolding: HoldingPoint = defineKeyedPoint({
  name: ASSETS_HOLDING,
  title: '一份资产的详情',
  summary: 'What is shown in the detail of one asset.',
  key: 'the category of the asset',
  subject: holdingSubject,
})

/** What the control of a setting is given: the value this layer holds or was changed to, and where a change goes. */
export type AssetsControlSubject = Readonly<{
  title: string
  /** The schema the setting declares for its value. */
  schema: JsonValue
  value: JsonValue | undefined
  disabled: boolean
  /** Takes the value the person chose; the row writes it when they press its button. */
  change: (value: JsonValue) => void
}>

export const ASSETS_CONTROL = 'assets.control'

export const assetsControl: RenderPoint<AssetsControlSubject> = defineRenderPoint({
  name: ASSETS_CONTROL,
  title: '设置项的控件',
  key: 'the kind of the value: the format of its schema, else enum when it has one, else its type, such as boolean, string or number',
  summary: 'The control a setting is changed with on the settings page, by the kind of its value.',
  subject:
    "one setting: title; schema, the schema of its value; value, the value now, or undefined; disabled; change(value), which takes the value the person chose, and the row writes it when they press its button. schema and value are JSON written with their kind: true is { kind: 'boolean', value: true }, a text is { kind: 'string', value }, a number is { kind: 'number', lexeme }",
  example: [
    '{"point":"assets.control","key":"boolean","module":"switch.js","export":"control"}',
    'switch.js:',
    'export const control = ({ React }) => ({ subject }) =>',
    "  React.createElement('input', {",
    "    type: 'checkbox',",
    "    checked: subject.value?.kind === 'boolean' && subject.value.value,",
    '    disabled: subject.disabled,',
    "    onChange: event => subject.change({ kind: 'boolean', value: event.target.checked }),",
    '  })',
  ].join('\n'),
})
