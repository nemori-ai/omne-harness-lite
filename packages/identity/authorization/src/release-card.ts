import { digestOf } from './evidence.ts'

/** The five options of a release card, a closed set; each answer has fixed effects. */
export const RELEASE_OPTIONS = [
  'deny-once',
  'allow-once',
  'allow-session',
  'allow-always',
  'deny-always',
] as const
export type ReleaseOption = (typeof RELEASE_OPTIONS)[number]

/** What the card is about: the action as the system resolved it, never text the model wrote. */
export type ReleaseCardAction = Readonly<{
  tool: string
  command: string | null
  preview: string
  effectiveArguments: string
  session: string
  agent: string
}>

/** Which options the card offers now; one that cannot take effect is shown and not offered. */
export type ReleaseOffer = Readonly<Record<ReleaseOption, boolean>>

export type ReleaseCardOption = Readonly<{
  id: ReleaseOption
  label: string
  scope: string
  offered: boolean
  /** The answer lasts beyond this one call. */
  lasting: boolean
}>

export type ReleaseCard = Readonly<{
  title: string
  target: Readonly<{ tool: string; command: string | null; preview: string }>
  arguments: Readonly<{ text: string; truncated: boolean; digest: string }>
  origin: Readonly<{ session: string; agent: string }>
  options: readonly [ReleaseCardOption, ...ReleaseCardOption[]]
}>

export const RELEASE_ARGUMENTS_LIMIT = 4096

const LABELS: Readonly<Record<ReleaseOption, string>> = {
  'deny-once': '本次不放行',
  'allow-once': '本次放行',
  'allow-session': '本会话放行',
  'allow-always': '始终放行',
  'deny-always': '始终禁止',
}

function scopeOf(option: ReleaseOption, tool: string): string {
  switch (option) {
    case 'deny-once':
      return '这一次调用不执行'
    case 'allow-once':
      return '只执行这一次调用，参数不变'
    case 'allow-session':
      return `这个会话里调用 ${tool} 不再问你；设置变了会重新问`
    case 'allow-always':
      return `把 ${tool} 在你的租户里设成自动，所有会话下一次起生效`
    case 'deny-always':
      return `把 ${tool} 在你的租户里设成禁止，所有会话下一次起生效`
  }
}

function argumentsOf(text: string): ReleaseCard['arguments'] {
  const digest = digestOf(text)
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= RELEASE_ARGUMENTS_LIMIT) return { text, truncated: false, digest }
  const cut = new TextDecoder()
    .decode(bytes.subarray(0, RELEASE_ARGUMENTS_LIMIT))
    .replace(/�$/u, '')
  return { text: cut, truncated: true, digest }
}

/** The content of a release card, made by the system from the action it judged. */
export function releaseCard(action: ReleaseCardAction, offer: ReleaseOffer): ReleaseCard {
  const target = { tool: action.tool, command: action.command, preview: action.preview }
  const call = action.command === null ? action.tool : `${action.tool} ${action.command}`
  const optionOf = (id: ReleaseOption): ReleaseCardOption => ({
    id,
    label: LABELS[id],
    scope: scopeOf(id, action.tool),
    offered: offer[id],
    lasting: id !== 'deny-once' && id !== 'allow-once',
  })
  const [first, ...rest] = RELEASE_OPTIONS
  return {
    title: `要执行 ${call}，放行吗？`,
    target,
    arguments: argumentsOf(action.effectiveArguments),
    origin: { session: action.session, agent: action.agent },
    options: [optionOf(first), ...rest.map(optionOf)],
  }
}
