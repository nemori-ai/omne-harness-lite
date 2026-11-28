// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Section,
  Segmented,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../src/index.ts'

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset['theme']
})

const VARIANTS = [
  'default',
  'destructive',
  'outline',
  'field',
  'secondary',
  'ghost',
  'link',
] as const
const SIZES = ['compact', 'default', 'large', 'touch', 'icon', 'icon-compact'] as const

it.each(VARIANTS)('Button variant %s renders a named button and reports a click', variant => {
  const onClick = vi.fn()
  render(
    <Button variant={variant} onClick={onClick}>
      保存
    </Button>,
  )
  const button = screen.getByRole('button', { name: '保存' })
  expect(button.getAttribute('data-variant')).toBe(variant)
  expect(button.getAttribute('data-control')).toBe(variant === 'link' ? 'link' : 'button')
  expect(button.getAttribute('type')).toBe('button')
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledTimes(1)
})

it.each(SIZES)('Button size %s is written on the element', size => {
  render(<Button size={size}>大小</Button>)
  expect(screen.getByRole('button', { name: '大小' }).getAttribute('data-size')).toBe(size)
})

it('Button does not fire while disabled, and asChild keeps the control marks on the child', () => {
  const onClick = vi.fn()
  const { rerender } = render(
    <Button disabled onClick={onClick}>
      停用
    </Button>,
  )
  const button = screen.getByRole('button', { name: '停用' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(button)
  expect(onClick).not.toHaveBeenCalled()
  rerender(
    <Button asChild variant="link">
      <a href="/x">去看看</a>
    </Button>,
  )
  const link = screen.getByRole('link', { name: '去看看' })
  expect(link.getAttribute('data-control')).toBe('link')
})

it('Input is a labelled textbox that reports typing', () => {
  const onChange = vi.fn()
  render(
    <>
      <Label htmlFor="name">名称</Label>
      <Input id="name" onChange={onChange} />
    </>,
  )
  const input = screen.getByLabelText('名称')
  expect(input.getAttribute('data-control')).toBe('field')
  fireEvent.change(input, { target: { value: 'abc' } })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect((input as HTMLInputElement).value).toBe('abc')
})

it('Input as a line is the same field: one line under it, no box, the line taking the focus colour', () => {
  render(<Input aria-label="查找" variant="line" />)
  const input = screen.getByRole('textbox', { name: '查找' })
  expect(input.getAttribute('data-control')).toBe('field')
  expect(input.dataset['variant']).toBe('line')
  expect(input.className.split(' ')).toEqual(
    expect.arrayContaining(['border-b', 'focus-visible:border-line-focus']),
  )
  expect(input.className).not.toMatch(/(^| )(rounded-control|border|bg-surface-field)( |$)/u)
})

it('Textarea is a labelled multi-line field that reports typing', () => {
  const onChange = vi.fn()
  render(<Textarea aria-label="备注" onChange={onChange} />)
  const area = screen.getByRole('textbox', { name: '备注' })
  expect(area.tagName).toBe('TEXTAREA')
  expect(area.getAttribute('data-control')).toBe('field')
  fireEvent.change(area, { target: { value: 'x' } })
  expect(onChange).toHaveBeenCalledTimes(1)
})

it('Label names the control it points at', () => {
  render(
    <>
      <Label htmlFor="a">甲</Label>
      <input id="a" />
    </>,
  )
  expect(screen.getByLabelText('甲').tagName).toBe('INPUT')
})

it('Checkbox toggles its checked state and reports it', () => {
  const onCheckedChange = vi.fn()
  render(<Checkbox aria-label="同意" onCheckedChange={onCheckedChange} />)
  const box = screen.getByRole('checkbox', { name: '同意' })
  expect(box.getAttribute('data-control')).toBe('choice')
  expect(box.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(box)
  expect(onCheckedChange).toHaveBeenCalledWith(true)
  expect(box.getAttribute('aria-checked')).toBe('true')
})

it('RadioGroup selects one item and reports its value', () => {
  const onValueChange = vi.fn()
  render(
    <RadioGroup defaultValue="a" onValueChange={onValueChange} aria-label="选择">
      <RadioGroupItem value="a" aria-label="甲" />
      <RadioGroupItem value="b" aria-label="乙" />
    </RadioGroup>,
  )
  expect(screen.getByRole('radiogroup', { name: '选择' })).toBeTruthy()
  expect(screen.getByRole('radio', { name: '甲' }).getAttribute('data-control')).toBe('choice')
  expect(screen.getByRole('radio', { name: '甲' }).getAttribute('aria-checked')).toBe('true')
  fireEvent.click(screen.getByRole('radio', { name: '乙' }))
  expect(onValueChange).toHaveBeenCalledWith('b')
  expect(screen.getByRole('radio', { name: '乙' }).getAttribute('aria-checked')).toBe('true')
})

it('Switch toggles and reports the new state', () => {
  const onCheckedChange = vi.fn()
  render(<Switch aria-label="自动保存" onCheckedChange={onCheckedChange} />)
  const toggle = screen.getByRole('switch', { name: '自动保存' })
  expect(toggle.getAttribute('data-control')).toBe('choice')
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  expect(onCheckedChange).toHaveBeenCalledWith(true)
  expect(toggle.getAttribute('aria-checked')).toBe('true')
})

it('Segmented marks the chosen segment and reports another choice', () => {
  const onValueChange = vi.fn()
  render(
    <Segmented
      label="视图"
      value="list"
      onValueChange={onValueChange}
      options={[
        { value: 'list', label: '列表' },
        { value: 'grid', label: '网格' },
      ]}
    />,
  )
  expect(screen.getByRole('group', { name: '视图' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '列表' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '网格' }).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '网格' }))
  expect(onValueChange).toHaveBeenCalledWith('grid')
})

it('Table renders rows and cells as table elements', () => {
  render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>名称</TableCell>
          <TableCell>值</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  )
  expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['名称', '值'])
})

it('Tooltip shows its text when its trigger takes focus and names it as a tooltip', async () => {
  render(
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button">提示</button>
        </TooltipTrigger>
        <TooltipContent>这是说明</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  )
  expect(screen.queryByRole('tooltip')).toBeNull()
  await act(async () => {
    screen.getByRole('button', { name: '提示' }).focus()
  })
  expect((await screen.findByRole('tooltip')).textContent).toContain('这是说明')
  expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain('这是说明')
})

it('Popover opens from its trigger and closes on a second press', async () => {
  render(
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">更多</button>
      </PopoverTrigger>
      <PopoverContent>面板内容</PopoverContent>
    </Popover>,
  )
  const trigger = screen.getByRole('button', { name: '更多' })
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(trigger)
  expect((await screen.findByText('面板内容')).getAttribute('data-slot')).toBe('popover-content')
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(trigger)
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
})

it('Select opens by keyboard and reports the chosen item', async () => {
  const onValueChange = vi.fn()
  render(
    <Select onValueChange={onValueChange}>
      <SelectTrigger aria-label="颜色">
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="red">红</SelectItem>
        <SelectItem value="blue">蓝</SelectItem>
      </SelectContent>
    </Select>,
  )
  const trigger = screen.getByRole('combobox', { name: '颜色' })
  expect(trigger.getAttribute('data-control')).toBe('field')
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  fireEvent.keyDown(trigger, { key: 'Enter' })
  const blue = await screen.findByRole('option', { name: '蓝' })
  fireEvent.click(blue)
  expect(onValueChange).toHaveBeenCalledWith('blue')
})

it('DropdownMenu opens from its trigger and runs the chosen item', async () => {
  const onSelect = vi.fn()
  render(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">菜单</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelect}>重命名</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  const trigger = screen.getByRole('button', { name: '菜单' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  const item = await screen.findByRole('menuitem', { name: '重命名' })
  expect(screen.getByRole('menu').getAttribute('data-slot')).toBe('dropdown-menu-content')
  fireEvent.click(item)
  expect(onSelect).toHaveBeenCalledTimes(1)
})

it('DropdownMenuRadioItem marks the chosen one with the kit check and only that one', async () => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">外观</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value="dark">
          <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: '外观' }), { button: 0, ctrlKey: false })
  const chosen = await screen.findByRole('menuitemradio', { name: '深色' })
  const other = screen.getByRole('menuitemradio', { name: '浅色' })
  expect(chosen.getAttribute('aria-checked')).toBe('true')
  expect(chosen.querySelector('svg[data-icon="done"]')).not.toBeNull()
  expect(other.querySelector('svg[data-icon="done"]')).toBeNull()
})

it('Sheet opens as a dialog with a named close control', async () => {
  const onOpenChange = vi.fn()
  render(
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button type="button">打开侧栏</button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>侧栏标题</SheetTitle>
        <SheetDescription>说明</SheetDescription>
      </SheetContent>
    </Sheet>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开侧栏' }))
  const dialog = await screen.findByRole('dialog', { name: '侧栏标题' })
  expect(dialog.getAttribute('data-side')).toBe('right')
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onOpenChange).toHaveBeenLastCalledWith(false)
})

it('Sheet takes its close label from the caller', async () => {
  render(
    <Sheet defaultOpen>
      <SheetContent closeLabel="Close it">
        <SheetTitle>标题</SheetTitle>
        <SheetDescription>说明</SheetDescription>
      </SheetContent>
    </Sheet>,
  )
  expect(await screen.findByRole('button', { name: 'Close it' })).toBeTruthy()
})

it('Field names its control and shows its hint; Section is a region named by its title', () => {
  render(
    <Section id="basic" title="基本信息" badge={<span>已改</span>}>
      <Field id="title" label="标题" hint="不超过 20 字">
        <Input id="title" />
      </Field>
    </Section>,
  )
  expect(screen.getByRole('region', { name: '基本信息' })).toBeTruthy()
  expect(screen.getByLabelText('标题')).toBeTruthy()
  expect(screen.getByText('不超过 20 字')).toBeTruthy()
  expect(screen.getByText('已改')).toBeTruthy()
})

it.each(['light', 'dark'] as const)('every control renders under the %s theme', theme => {
  document.documentElement.dataset['theme'] = theme
  render(
    <TooltipProvider>
      <Button>按钮</Button>
      <Input aria-label="输入" />
      <Textarea aria-label="多行" />
      <Checkbox aria-label="勾选" />
      <Switch aria-label="开关" />
      <RadioGroup aria-label="单选">
        <RadioGroupItem value="a" aria-label="甲" />
      </RadioGroup>
      <Segmented
        label="分段"
        value="a"
        onValueChange={() => undefined}
        options={[{ value: 'a', label: '甲段' }]}
      />
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>格</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Select>
        <SelectTrigger aria-label="选择器">
          <SelectValue placeholder="选" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="x">叉</SelectItem>
        </SelectContent>
      </Select>
    </TooltipProvider>,
  )
  expect(document.documentElement.dataset['theme']).toBe(theme)
  for (const name of ['按钮', '甲段']) expect(screen.getByRole('button', { name })).toBeTruthy()
  for (const name of ['输入', '多行']) expect(screen.getByRole('textbox', { name })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: '勾选' })).toBeTruthy()
  expect(screen.getByRole('switch', { name: '开关' })).toBeTruthy()
  expect(screen.getByRole('radio', { name: '甲' })).toBeTruthy()
  expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getByRole('combobox', { name: '选择器' })).toBeTruthy()
})
