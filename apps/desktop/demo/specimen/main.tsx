import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AddIcon,
  Ago,
  AppointmentIcon,
  AppTooltipProvider,
  BackIcon,
  Button,
  Checkbox,
  CodeSurface,
  colorSchemeQuery,
  createThemeController,
  DirectorySearch,
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
  ListReadingDirectory,
  ListReadingMain,
  ListReadingPage,
  ListReadingRow,
  ListReadingWorkspace,
  LoadingIndicator,
  LoadingState,
  PageColumn,
  PageHeader,
  Prose,
  RadioGroup,
  RadioGroupItem,
  ReadingDocument,
  ReadingState,
  ReadingToolbar,
  ReceiptPill,
  RetryIcon,
  SearchIcon,
  Section,
  Segmented,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  StackedBarChart,
  StateWord,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Textarea,
} from '@omne-harness/ui-kit'
import { DecisionSpecimen } from './decision.tsx'
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

const PUNCTUATION =
  '「先别急着关窗。」她说：「夜里降温快——尤其是凌晨两点到五点……你确定吗？」我点点头（其实没太确定），把《节气手册》合上；窗外的风、雨、雷声，一阵比一阵近！'

const SERIES = [
  { key: 'input', label: '输入' },
  { key: 'output', label: '输出' },
]
const ROWS = ['11-17', '11-18', '11-19', '11-20'].map((label, day) => ({
  label,
  values: { input: 1200 + day * 340, output: day === 2 ? null : 90 + day * 25 },
}))

const DAY = 24 * 60 * 60 * 1000
const RECORDS = [
  { id: 'weekly', title: '周会', facts: '每周一 10:00 · Asia/Shanghai', ago: 3 * DAY },
  { id: 'report', title: '月报提醒', facts: '每月最后一个工作日 17:00', ago: 9 * DAY },
  {
    id: 'backup',
    title: '夜里备份构建缓存',
    facts: '每天 02:30 · 上一次没有跑完，下一次照常',
    ago: 21 * DAY,
  },
]

/** The list + reading family on its own: a record open, the search, the toolbar's back to the idle sentence. */
function ListReadingSpecimen() {
  const [chosen, setChosen] = useState<string | undefined>('weekly')
  const [query, setQuery] = useState('')
  const now = useMemo(() => Date.now(), [])
  const shown = RECORDS.filter(record => record.title.includes(query))
  const open = RECORDS.find(record => record.id === chosen)
  return (
    <ListReadingPage
      title="日程"
      description="定好的时间与它们的下一次。"
      detail={open !== undefined}
    >
      <ListReadingWorkspace detail={open !== undefined} empty={RECORDS.length === 0}>
        <ListReadingDirectory
          search={
            <DirectorySearch
              value={query}
              onChange={setQuery}
              label="搜索日程"
              clearLabel="清除搜索"
            />
          }
        >
          {shown.length === 0 ? (
            <p>没有匹配「{query}」的记录。</p>
          ) : (
            shown.map(record => (
              <ListReadingRow
                key={record.id}
                mark={<AppointmentIcon />}
                title={record.title}
                facts={record.facts}
                time={<Ago at={new Date(now - record.ago).toISOString()} />}
                selected={record.id === chosen}
                onSelect={() => setChosen(record.id)}
              />
            ))
          )}
        </ListReadingDirectory>
        <ListReadingMain>
          {open === undefined ? (
            <ReadingState>
              <EmptyState still icon={AppointmentIcon} title="选一个日程看它的安排。" />
            </ReadingState>
          ) : (
            <>
              <ReadingToolbar
                name={open.title}
                origin="由 Agent 建"
                back={
                  <IconButton label="回到列表" onClick={() => setChosen(undefined)}>
                    <BackIcon />
                  </IconButton>
                }
              >
                <IconButton label="重读">
                  <RetryIcon />
                </IconButton>
              </ReadingToolbar>
              <ReadingDocument>
                <FactList aria-label={open.title}>
                  <FactRow term="何时">{open.facts}</FactRow>
                  <FactRow term="状态">
                    <StateWord state="idle" />
                  </FactRow>
                </FactList>
              </ReadingDocument>
            </>
          )}
        </ListReadingMain>
      </ListReadingWorkspace>
    </ListReadingPage>
  )
}

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
      <Family title="页头与节">
        <div>
          <PageHeader
            title="日历"
            description="日期计算与日程用哪套日历、哪个时区。"
            actions={
              <IconButton label="重读">
                <RetryIcon />
              </IconButton>
            }
          />
          <Section id="specimen-section-effective" title="生效的日历">
            <p>中国法定节假日 · Asia/Shanghai</p>
          </Section>
          <Section id="specimen-section-lookup" title="查一天">
            <p>输入一天，看它是工作日还是假日。</p>
          </Section>
        </div>
      </Family>
      <Family title="列表加阅读">
        <div className="specimen-list-reading">
          <ListReadingSpecimen />
        </div>
      </Family>
      <Family title="设置行">
        <div>
          <SettingRow
            label="中国法定节假日"
            hint="Asia/Shanghai · seed-2026-11-06-1 · 覆盖到 2027-12-31"
          >
            <span>生效</span>
          </SettingRow>
          <SettingRow
            label="时区"
            controlId="specimen-zone"
            hint="IANA 时区名，例如 Asia/Shanghai。"
          >
            <Input id="specimen-zone" defaultValue="Asia/Shanghai" />
          </SettingRow>
          <SettingRow
            label="自动更新"
            labelId="specimen-auto-label"
            hint="每天检查一次供应的日历。"
            notice={
              <InlineNotice still tone="danger" title="没有存进去" role="status">
                这一项没有改成。
              </InlineNotice>
            }
          >
            <Switch aria-labelledby="specimen-auto-label" defaultChecked />
          </SettingRow>
          <SettingRow
            label="日本法定节假日"
            hint="Asia/Tokyo · seed-2026-11-06-2 · 覆盖到 2027-12-31"
          />
        </div>
      </Family>
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
      <Family title="全角标点">
        <p className="specimen-punctuation" data-specimen-punctuation="reading">
          {PUNCTUATION}
        </p>
        <p className="specimen-punctuation" data-specimen-punctuation="ui">
          {PUNCTUATION}
        </p>
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

// `?decision` draws the decision paper from card data instead (decision.tsx).
createRoot(document.getElementById('root') as HTMLElement).render(
  <AppTooltipProvider>
    {new URLSearchParams(location.search).has('decision') ? <DecisionSpecimen /> : <Specimen />}
  </AppTooltipProvider>,
)
