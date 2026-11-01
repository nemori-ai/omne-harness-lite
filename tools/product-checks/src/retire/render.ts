import type { Finding, FindingKind, InventoryExport, ScanResult } from './scan.ts'
import { isDue, type RetireTable, type Wave } from './table.ts'

const HEADINGS: Record<FindingKind, string> = {
  overdue: '应删未删：已到期，导出或定义仍在',
  'retired-referenced': '已退役仍被引用：已到期，定义文件之外仍有引用',
  misassembled: '误接装配：B、C 类名字出现在产品源码里',
}

function findingLine(finding: Finding): string {
  const detail = finding.detail === undefined ? '' : `（${finding.detail}）`
  return `  ${finding.id} ${finding.name}  ${finding.path}:${finding.line}${detail}`
}

function exportLine(item: InventoryExport): string {
  const ids = item.ids.length === 0 ? '' : `  [${item.ids.join(', ')}]`
  return `    ${item.name}${ids}  测试 ${item.testFiles}  产品 ${item.productFiles}`
}

/** 本次放行波次的核对范围：到期的项里，哪些有导出名被扫描，哪些没有。 */
export function renderScope(table: RetireTable, wave: Wave): string[] {
  const due = table.items.filter(item => isDue(item, wave))
  const scanned = due.filter(item => item.exports.length > 0).map(item => item.id)
  const skipped = due.filter(item => item.exports.length === 0).map(item => item.id)
  return [
    `核对范围：到期 ${due.length} 项，扫描 ${scanned.length} 项${scanned.length > 0 ? `（${scanned.join('、')}）` : ''}`,
    ...(skipped.length > 0 ? [`  没有导出名、未扫描：${skipped.join('、')}`] : []),
  ]
}

/** 给人读的文本：三类问题、表过期、未映射、清点表、核对范围（可选）和结论。 */
export function renderText(result: ScanResult, scope: readonly string[] = []): string {
  const lines = [`替身清点  放行波次 ${result.wave}  检出 ${result.ref.slice(0, 9)}`]
  for (const kind of ['overdue', 'retired-referenced', 'misassembled'] as const) {
    const group = result.findings.filter(finding => finding.kind === kind)
    if (group.length === 0) continue
    lines.push('', `${HEADINGS[kind]}（${group.length}）`, ...group.map(findingLine))
  }
  if (result.stale.length > 0)
    lines.push(
      '',
      `表过期：表里的导出名找不到定义（${result.stale.length}）`,
      ...result.stale.map(entry => `  ${entry.id} ${entry.name}`),
    )
  if (result.unmapped.length > 0)
    lines.push(
      '',
      `未映射：替身已存在，表里没有导出名，没有被扫描（${result.unmapped.length}；--strict 视为问题）`,
      ...result.unmapped.map(entry => `  ${entry.id}（${entry.category} 类）`),
    )
  lines.push('', '清点表：各成员 ./testing 的导出与引用文件数')
  if (result.inventory.length === 0) lines.push('  没有成员声明 ./testing 入口')
  for (const member of result.inventory) {
    lines.push(`  ${member.member}（${member.entry}）`)
    const inTable = member.exports.filter(item => item.inTable)
    const outside = member.exports.filter(item => !item.inTable)
    if (inTable.length > 0) lines.push('   表内：', ...inTable.map(exportLine))
    if (outside.length > 0) lines.push('   表外导出（不算问题）：', ...outside.map(exportLine))
  }
  if (scope.length > 0) lines.push('', ...scope)
  const clean =
    result.findings.length === 0 && result.stale.length === 0 && result.unmapped.length === 0
  lines.push(
    '',
    clean
      ? '未发现问题'
      : `问题 ${result.findings.length} 项，表过期 ${result.stale.length} 项，未映射 ${result.unmapped.length} 项`,
  )
  return lines.join('\n')
}
