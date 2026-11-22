import { createRoot } from 'react-dom/client'
import {
  AreaChart,
  formatAmount,
  formatNumber,
  LineChart,
  ShareBar,
  Sparkline,
  StackedBarChart,
  StatBlock,
} from '@omne-harness/ui-kit'
import './styles.css'

const violations: string[] = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.violatedDirective} ${event.blockedURI}`)
})
Object.assign(window, { chartWalk: { violations } })

const series = [
  { key: 'input', label: '输入' },
  { key: 'cache', label: '缓存读' },
  { key: 'output', label: '输出' },
]
const days = ['11-14', '11-15', '11-16', '11-17', '11-18', '11-19', '11-20']
const rows = days.map((label, day) => ({
  label,
  values: {
    input: 1200 + day * 340,
    cache: day === 3 ? null : 800 + day * 150,
    output: 90 + day * 25,
  },
}))
const parts = [
  { key: 'a', label: 'openai/gpt-5.6-sol', value: 5200 },
  { key: 'b', label: 'anthropic/claude', value: 3100 },
  { key: 'c', label: '其他', value: 900 },
  { key: 'd', label: '未知型号', value: null },
]

createRoot(document.getElementById('root') as HTMLElement).render(
  <main className="gallery">
    <StackedBarChart label="按天的 token（堆叠柱）" series={series} rows={rows} />
    <LineChart label="按天的 token（折线）" series={series} rows={rows} />
    <AreaChart label="按天的 token（面积）" series={series} rows={rows} />
    <ShareBar label="按模型的占比" parts={parts} format={value => formatNumber(value)} />
    <Sparkline label="每小时的请求" values={[3, 5, 2, null, 6, 8, 4]} />
    <StatBlock label="费用" value={formatAmount('0.4321', 'USD')} detail="2 笔未知" />
    <StackedBarChart label="没有数据的样子" series={series} rows={[]} />
    <span className="probe" data-probe="chart-1" />
  </main>,
)
