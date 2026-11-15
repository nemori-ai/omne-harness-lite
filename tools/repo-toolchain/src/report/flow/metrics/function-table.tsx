/// <reference lib="dom" preserve="true" />
import { Table, type TableColumnsType } from 'antd'
import type { FunctionRow } from '../../../metrics/report.ts'
import { toneOf } from './structure.tsx'

export type SortKey = 'score' | 'cc' | 'cov' | 'path'
export type SortOrder = 'ascend' | 'descend'

export interface FunctionTableProps {
  readonly rows: readonly FunctionRow[]
  readonly metric: 'CRAP' | 'CC'
  readonly sortKey: SortKey | null
  readonly sortOrder: SortOrder
  readonly onSort: (key: SortKey | null, order: SortOrder) => void
}

const pct = (ratio: number | undefined): string =>
  ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`
const num = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1))
const coverColor = (ratio: number | undefined): string | undefined =>
  ratio === undefined ? undefined : `var(--${ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'mid' : 'bad'})`

function stickyTop(): number {
  return parseFloat(getComputedStyle(document.body).getPropertyValue('--sticky-top')) || 0
}

export function FunctionTable({ rows, metric, sortKey, sortOrder, onSort }: FunctionTableProps) {
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
