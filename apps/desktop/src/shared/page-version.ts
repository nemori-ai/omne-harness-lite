/** Answered by the main process: the version of the page that is served, and what the person is still to be told. */
export const DEVICE_PAGE_VERSION = '/device/page-version'
export const DEVICE_PAGE_VERSION_TOLD = '/device/page-version/told'

export const BUILTIN_PAGE = 'builtin'
/** Dispatched on the window by the main process when it has something new to tell: the page then asks. */
export const PAGE_VERSION_EVENT = 'omne-page-version'

export type PageNotice =
  | Readonly<{ kind: 'switched'; to: string }>
  | Readonly<{ kind: 'refused'; reason: string; version?: string }>
  | Readonly<{ kind: 'fell'; from: string; to: string; falls: number }>
  | Readonly<{ kind: 'unusable'; from: string; reason: string }>

export type PageVersionAnswer = Readonly<{ version: string; notice: PageNotice | null }>

// The told note at home holds two short lines, about seventeen characters: each sentence fits them whole.
const named = (version: string): string =>
  version === BUILTIN_PAGE ? '自带版本' : `版本 ${version.replace(/^page-/, '').slice(0, 6)}`

const REFUSALS: Readonly<Record<string, string>> = {
  'manifest-missing': '没有清单',
  'manifest-invalid': '清单读不成',
  'signature-missing': '没有签名',
  'signature-invalid': '签名不对',
  'digest-mismatch': '文件被改过',
  'file-missing': '缺文件',
  'unlisted-file': '多了文件',
  'load-failed': '试起时没加载',
  'renderer-gone': '试起时倒下了',
  'not-mounted': '试起时没显示',
}

export type PageNoticeText = Readonly<{ title: string; body?: string; tone: 'info' | 'attention' }>

/** What the person reads: what happened to the page and which version is in use now. The log has the rest. */
export function pageNoticeText(notice: PageNotice): PageNoticeText {
  const why = (reason: string): string => REFUSALS[reason] ?? reason
  if (notice.kind === 'switched') return { tone: 'info', title: `页面已换到${named(notice.to)}` }
  if (notice.kind === 'fell')
    return { tone: 'attention', title: `页面已退回${named(notice.to)}`, body: '新版起不来' }
  if (notice.kind === 'unusable')
    return { tone: 'attention', title: '页面这次用自带版本', body: why(notice.reason) }
  return { tone: 'attention', title: '新版页面没换上', body: why(notice.reason) }
}
