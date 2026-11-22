import {
  defineKeyedPoint,
  definePoint,
  type KeyedPoint,
  type Point,
  type PointCodec,
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

export type AssetsPageSubject = Readonly<Record<never, never>>

const PAGE_SUBJECT = 'assets'

const pageSubject: PointCodec<AssetsPageSubject> = {
  encode: () => PAGE_SUBJECT,
  decode: text => (text === PAGE_SUBJECT ? {} : undefined),
}

export const ASSETS_CATEGORY = 'assets.category'
export const ASSETS_HOLDING = 'assets.holding'
export const ASSETS_CATEGORY_PAGE = 'assets.category-page'

export const assetsCategoryPage: Point<AssetsPageSubject> = definePoint({
  name: ASSETS_CATEGORY_PAGE,
  summary:
    'The page of its own that a category brings to the assets page; the id of an item is the category.',
  subject: pageSubject,
})

export const assetsCategory: KeyedPoint<CategorySubject> = defineKeyedPoint({
  name: ASSETS_CATEGORY,
  summary: 'What is shown above the list of one category.',
  key: 'the category chosen in the bar',
  subject: categorySubject,
})

export const assetsHolding: KeyedPoint<HoldingSubject> = defineKeyedPoint({
  name: ASSETS_HOLDING,
  summary: 'What is shown in the detail of one asset.',
  key: 'the category of the asset',
  subject: holdingSubject,
})
