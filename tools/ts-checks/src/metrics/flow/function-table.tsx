/// <reference lib="dom" />
// 函数表的展示。筛选、排序与截断仍由页面脚本完成，这里只按给定顺序画出行，表头点击交回脚本改排序键。
import { Table, type TableColumnsType } from 'antd'
import type { FunctionRow } from '../report.ts'
import { toneOf } from './structure.tsx'

export type SortKey = 'score' | 'cc' | 'cov' | 'path'
export type SortOrder = 'ascend' | 'descend'

export interface FunctionTableProps {
  readonly rows: readonly FunctionRow[]
  /** CRAP：开了覆盖率；CC：只有圈复杂度。决定评分列的列名。 */
  readonly metric: 'CRAP' | 'CC'
  /** null 表示不排序，按报告给出的原始顺序。 */
  readonly sortKey: SortKey | null
  readonly sortOrder: SortOrder
  /** 排序由页面脚本完成；表头只报告点了哪列、要哪个方向，取消排序时给 null。 */
  readonly onSort: (key: SortKey | null, order: SortOrder) => void
}

const pct = (ratio: number | undefined): string =>
  ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`
const num = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1))
/** 覆盖率单元格 ≥80% 为好、≥50% 为中、其余为差（uml-viewer engine/draw.clj:61-66）。 */
const coverColor = (ratio: number | undefined): string | undefined =>
  ratio === undefined ? undefined : `var(--${ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'mid' : 'bad'})`

/** 页面吸顶导航的高度来自 CSS 变量，表头吸在它下面。 */
function stickyTop(): number {
  return parseFloat(getComputedStyle(document.body).getPropertyValue('--sticky-top')) || 0
}

export function FunctionTable({ rows, metric, sortKey, sortOrder, onSort }: FunctionTableProps) {
  // 每列依次是降序、升序、不排序。
  const sortable = (key: SortKey) => ({
    sorter: true,
    sortOrder: sortKey === key ? sortOrder : null,
    sortDirections: ['descend', 'ascend'] as SortOrder[],
    showSorterTooltip: false,
  })
  const columns: TableColumnsType<FunctionRow> = [
    {
      key: 'path',
      title: '位置',
      className: 'mono ui-muted',
      render: (_, row) => `${row.path}:${row.line}`,
      ...sortable('path'),
    },
    { key: 'fn', title: '函数', className: 'fn mono', render: (_, row) => row.name },
    {
      key: 'cc',
      title: 'CC',
      align: 'right',
      className: 'num',
      render: (_, row) => String(row.complexity),
      ...sortable('cc'),
    },
    {
      key: 'cov',
      title: '覆盖',
      align: 'right',
      className: 'num',
      render: (_, row) => (
        <span style={{ color: coverColor(row.coverage) }}>{pct(row.coverage)}</span>
      ),
      ...sortable('cov'),
    },
    {
      key: 'score',
      title: metric === 'CRAP' ? 'CRAP' : '评级分',
      align: 'right',
      className: 'num',
      onCell: row => ({ style: { background: toneOf(row.grade, '-fill') } }),
      render: (_, row) => num(row.score),
      ...sortable('score'),
    },
    { key: 'changed', title: '变更', render: (_, row) => (row.changed ? '是' : '') },
  ]
  return (
    <Table<FunctionRow>
      className="ui-function-table"
      size="small"
      columns={columns}
      dataSource={[...rows]}
      rowKey={row => `${row.path}:${row.line}:${row.name}`}
      rowClassName={row => (row.changed ? 'changed' : '')}
      pagination={false}
      onChange={(_pagination, _filters, sorter) => {
        const chosen = Array.isArray(sorter) ? sorter[0] : sorter
        const key = chosen?.columnKey
        const order = chosen?.order
        if ((key === 'score' || key === 'cc' || key === 'cov' || key === 'path') && order != null)
          onSort(key, order)
        else onSort(null, 'descend')
      }}
      sticky={{ offsetHeader: stickyTop() }}
      tableLayout="auto"
    />
  )
}
