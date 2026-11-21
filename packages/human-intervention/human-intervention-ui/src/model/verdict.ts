import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'

type Question = HumanInterventionCardItem['card']['question']

/** An option a section shows outside its folds, as a row or as a verdict button. */
export type Exposed = Readonly<{
  id: string
  label: string
  description: string
  role?: 'approve' | 'reject'
  offered: boolean
}>

const MOST_BUTTONS = 3
const LONGEST_LABEL = 8
const LONGEST_DESCRIPTION = 16

/** East Asian wide and full-width characters: CJK, kana, hangul, their punctuation and the full-width forms. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}]/u

/** How many 字 a text is: a full-width character is one, a half-width one is half of one. */
export function lengthOf(text: string): number {
  return [...text].reduce((sum, character) => sum + (WIDE.test(character) ? 1 : 0.5), 0)
}

/** The options outside the folds: a release card's one-time ones, every option of any other card. */
export function exposedOf(question: Question): readonly Exposed[] {
  if (question.kind === 'release') return question.options.filter(option => !option.lasting)
  return question.options.map(option => ({ ...option, offered: true }))
}

const short = (option: Exposed): boolean =>
  lengthOf(option.label) <= LONGEST_LABEL && lengthOf(option.description) <= LONGEST_DESCRIPTION

/** 定夺规则: one section with one to three short options outside its folds answers with them; else rows (null). */
export function verdictOf(items: readonly HumanInterventionCardItem[]): readonly Exposed[] | null {
  const [only, ...others] = items
  if (only === undefined || others.length > 0) return null
  const exposed = exposedOf(only.card.question)
  if (exposed.length === 0 || exposed.length > MOST_BUTTONS) return null
  return exposed.every(short) ? exposed : null
}
