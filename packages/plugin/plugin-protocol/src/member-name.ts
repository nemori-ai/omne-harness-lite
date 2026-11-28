/** One member as the three places that name it see it: the page of the plugin, the impact panel and the tools. */
export type Named = Readonly<{
  title?: string | null
  point: string
  pointTitle?: string | null
  key: string
  id?: string | null
}>

/** The one way a member is named: 「天气」（一级页面）, or without a title 一级页面「weather」, or shell.pages「weather」. */
export function memberName(member: Named): string {
  const place = member.pointTitle ?? member.point
  if (member.title !== undefined && member.title !== null) return `「${member.title}」（${place}）`
  return `${place}「${member.id ?? member.key}」`
}
