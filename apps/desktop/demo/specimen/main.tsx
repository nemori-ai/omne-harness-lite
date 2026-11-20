import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AddIcon,
  AppTooltipProvider,
  Button,
  Checkbox,
  CodeSurface,
  colorSchemeQuery,
  createThemeController,
  DisclosureIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EditIcon,
  EmptyState,
  FactList,
  FactRow,
  Field,
  IconButton,
  InlineNotice,
  Input,
  Label,
  LoadingIndicator,
  LoadingState,
  PageColumn,
  PageHeader,
  Prose,
  RadioGroup,
  RadioGroupItem,
  ReceiptPill,
  SearchIcon,
  Segmented,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StackedBarChart,
  StateWord,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Textarea,
} from '@omne-harness/ui-kit'
import './styles.css'

const violations: string[] = []
document.addEventListener('securitypolicyviolation', event => {
  violations.push(`${event.violatedDirective} ${event.blockedURI}`)
})
Object.assign(window, { specimenWalk: { violations } })

createThemeController({
  read: () => 'system',
  write: () => undefined,
  system: colorSchemeQuery(),
}).start()

const PROSE = [
  '## 一段 Markdown',
  '',
  '正文里有**加粗**、`行内代码`与[一个链接](https://example.com)。',
  '',
  '- 第一项',
  '- 第二项',
  '',
  '> 一段引用。',
  '',
  '| 项 | 之前 | 之后 |',
  '| --- | --- | --- |',
  '| 端口 | 8080 | 8081 |',
  '',
  '```sh',
  'pnpm run dev -- --port 8081',
  '```',
].join('\n')

const SERIES = [
  { key: 'input', label: '输入' },
  { key: 'output', label: '输出' },
]
const ROWS = ['11-17', '11-18', '11-19', '11-20'].map((label, day) => ({
  label,
  values: { input: 1200 + day * 340, output: day === 2 ? null : 90 + day * 25 },
}))

function Family(props: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="specimen-family">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  )
}

function Specimen() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  useEffect(() => setReady(true), [])
  return (
    <PageColumn data-specimen={ready ? 'ready' : 'loading'}>
      <PageHeader title="共用件" description="每一族现有的件，各种样子并排。" />
      <Family title="按钮">
        <div className="specimen-row">
          <Button>主要动作</Button>
          <Button variant="outline">次要</Button>
          <Button variant="secondary">次一级</Button>
          <Button variant="ghost">幽灵</Button>
          <Button variant="field">字段样</Button>
          <Button variant="link">链接样</Button>
          <Button variant="destructive">删除</Button>
          <Button disabled>不可用</Button>
        </div>
        <div className="specimen-row">
          <Button size="compact">紧凑</Button>
          <Button>缺省</Button>
          <Button size="large">大</Button>
          <Button size="touch">触控</Button>
          <IconButton label="新建">
            <AddIcon />
          </IconButton>
          <IconButton label="编辑" size="icon-compact">
            <EditIcon />
          </IconButton>
        </div>
      </Family>
      <Family title="字段">
        <div className="specimen-fields">
          <Field id="specimen-name" label="名称" hint="给人看的名字。">
            <Input id="specimen-name" defaultValue="资产页的改动" />
          </Field>
          <Field id="specimen-search" label="搜索">
            <Input id="specimen-search" type="search" placeholder="输入关键字" />
          </Field>
          <Field id="specimen-wrong" label="端口" hint="要是一个数。">
            <Input id="specimen-wrong" aria-invalid="true" defaultValue="八零八零" />
          </Field>
          <Field id="specimen-note" label="备注">
            <Textarea id="specimen-note" defaultValue="多行的文字。" />
          </Field>
        </div>
      </Family>
      <Family title="选择、菜单与分段">
        <div className="specimen-row">
          <Select defaultValue="day">
            <SelectTrigger aria-label="时间范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按天</SelectItem>
              <SelectItem value="week">按周</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="field">
                更多
                <DisclosureIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>重命名</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Segmented
            label="视图"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'day', label: '日' },
              { value: 'week', label: '周' },
              { value: 'month', label: '月', icon: <SearchIcon /> },
            ]}
          />
        </div>
      </Family>
      <Family title="开关与勾选">
        <div className="specimen-row">
          <span className="specimen-pair">
            <Switch id="specimen-switch" defaultChecked />
            <Label htmlFor="specimen-switch">开着</Label>
          </span>
          <span className="specimen-pair">
            <Switch id="specimen-switch-off" />
            <Label htmlFor="specimen-switch-off">关着</Label>
          </span>
          <span className="specimen-pair">
            <Checkbox id="specimen-check" defaultChecked />
            <Label htmlFor="specimen-check">勾上</Label>
          </span>
          <span className="specimen-pair">
            <Checkbox id="specimen-check-off" />
            <Label htmlFor="specimen-check-off">没勾</Label>
          </span>
          <RadioGroup defaultValue="a" className="specimen-row" aria-label="选一个">
            <span className="specimen-pair">
              <RadioGroupItem id="specimen-radio-a" value="a" />
              <Label htmlFor="specimen-radio-a">甲</Label>
            </span>
            <span className="specimen-pair">
              <RadioGroupItem id="specimen-radio-b" value="b" />
              <Label htmlFor="specimen-radio-b">乙</Label>
            </span>
          </RadioGroup>
        </div>
      </Family>
      <Family title="表格与事实表">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>端口</TableCell>
              <TableCell>8081</TableCell>
              <TableCell>已保存</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>缓存目录</TableCell>
              <TableCell>./dist</TableCell>
              <TableCell>保留</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <FactList aria-label="这次构建">
          <FactRow term="开始">11-20 09:12</FactRow>
          <FactRow term="用时">42 秒</FactRow>
          <FactRow term="结果">成功</FactRow>
        </FactList>
      </Family>
      <Family title="行内通知">
        <InlineNotice still tone="neutral" title="中性">
          一条普通的说明。
        </InlineNotice>
        <InlineNotice still tone="info" title="提示">
          设置在下一轮生效。
        </InlineNotice>
        <InlineNotice still tone="good" title="成功">
          保存好了。
        </InlineNotice>
        <InlineNotice still tone="caution" title="注意">
          这一步收不回。
        </InlineNotice>
        <InlineNotice still tone="danger" title="失败" role="status">
          没有存进去。
        </InlineNotice>
      </Family>
      <Family title="空状态与加载">
        <EmptyState still title="还没有会话" hint="新建一个，从这里开始。" />
        <div className="specimen-row">
          <LoadingState label="正在读" />
          <LoadingIndicator />
          <LoadingIndicator size="sm" />
        </div>
      </Family>
      <Family title="状态词与回执">
        <div className="specimen-row">
          <StateWord state="thinking" />
          <StateWord state="saved" />
          <StateWord state="unknown" />
          <StateWord state="failed" />
          <StateWord state="notDone" />
        </div>
        <div className="specimen-row">
          <ReceiptPill still tone="accepted">
            已接受
          </ReceiptPill>
          <ReceiptPill still tone="declined">
            已拒绝
          </ReceiptPill>
          <ReceiptPill still tone="unknown" meta="#7">
            结果未知
          </ReceiptPill>
          <ReceiptPill still tone="cancelled">
            已取消
          </ReceiptPill>
        </div>
      </Family>
      <Family title="代码面">
        <CodeSurface name="sh" text={'pnpm run build\npnpm run dev -- --port 8081'} />
      </Family>
      <Family title="Markdown">
        <Prose text={PROSE} />
      </Family>
      <Family title="图表">
        <StackedBarChart label="按天的 token" series={SERIES} rows={ROWS} />
      </Family>
    </PageColumn>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <AppTooltipProvider>
    <Specimen />
  </AppTooltipProvider>,
)
