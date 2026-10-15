/// <reference lib="dom" preserve="true" />
// 审讯页的表单控件、视图切换与折叠区由 antd 渲染。页面标记仍写原生控件：加载时逐个换成 antd 组件，
// id、可见文字与选项照搬，脚本按 id 取句柄读写。这样标记在没有脚本时仍可读，文字只在标记里维护一份。
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Button, Checkbox, Collapse, ConfigProvider, Radio, Segmented, Select, theme } from 'antd'
import { FunctionTable } from '../../metrics/flow/function-table.tsx'
import type {
  ButtonHandle,
  CheckboxHandle,
  ReportUiApi,
  SelectHandle,
  SelectOption,
  ViewName,
} from './controls-api.ts'

/** 一个可订阅的值：句柄写它，组件经 useSyncExternalStore 读它。 */
class Cell<T> {
  private readonly listeners = new Set<() => void>()
  constructor(private current: T) {}
  readonly get = (): T => this.current
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  set(value: T): void {
    this.current = value
    for (const listener of this.listeners) listener()
  }
}

const useCell = <T,>(cell: Cell<T>): T => useSyncExternalStore(cell.subscribe, cell.get)

// 主题取页面 token 的同一组值；antd 的派生色需要具体色值，不能直接用 CSS 变量。
const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
// 主色是靛蓝：下拉选中项、复选框与按下态由它派生；色相与表示「本次变更」的蓝拉开。
const LIGHT = {
  colorPrimary: '#4f5bd5',
  colorText: '#1c2128',
  colorTextSecondary: '#5f6772',
  colorBorder: '#cdd2d8',
  colorBorderSecondary: '#e3e6ea',
  colorBgContainer: '#ffffff',
  colorBgLayout: '#f4f5f7',
  colorFillAlter: '#f7f8fa',
  colorLink: '#1c2128',
  colorLinkHover: '#5f6772',
}
// 深色下主色提亮一档，复选框的白色对勾仍看得清。
const DARK = {
  colorPrimary: '#6b74e6',
  colorText: '#e6e8eb',
  colorTextSecondary: '#9aa1ab',
  colorBorder: '#3d424a',
  colorBorderSecondary: '#2c3036',
  colorBgContainer: '#1a1d21',
  colorBgElevated: '#22262b',
  colorBgLayout: '#121417',
  colorFillAlter: '#16191c',
  colorLink: '#e6e8eb',
  colorLinkHover: '#9aa1ab',
}
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeMedia = (listener: () => void): (() => void) => {
  darkQuery.addEventListener('change', listener)
  motionQuery.addEventListener('change', listener)
  return () => {
    darkQuery.removeEventListener('change', listener)
    motionQuery.removeEventListener('change', listener)
  }
}
const mediaSnapshot = (): number => (darkQuery.matches ? 1 : 0) | (motionQuery.matches ? 2 : 0)

function Themed({ children }: { readonly children: ReactNode }) {
  const media = useSyncExternalStore(subscribeMedia, mediaSnapshot)
  const dark = (media & 1) === 1
  return (
    <ConfigProvider
      // 不在两个汉字的按钮文字中间插空格：控件名是规格点名的稳定文字。
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          ...(dark ? DARK : LIGHT),
          fontFamily: FONT,
          fontSize: 13,
          borderRadius: 6,
          controlHeight: 32,
          motion: (media & 2) === 0,
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}

/** 同步渲染：脚本紧接着按 id 找元素、读句柄时，DOM 已经就位。 */
function mount(host: HTMLElement, node: ReactNode): void {
  const root = createRoot(host)
  flushSync(() => root.render(<Themed>{node}</Themed>))
}

function hostFor(native: Element, className: string): HTMLElement {
  const host = document.createElement('span')
  host.className = className
  native.replaceWith(host)
  return host
}

const selects = new Map<string, SelectHandle>()
const checkboxes = new Map<string, CheckboxHandle>()
const buttons = new Map<string, ButtonHandle>()

function upgradeSelect(native: HTMLSelectElement): void {
  const id = native.id
  const search = native.dataset['search'] !== undefined
  const minWidth = Number(native.dataset['width'] ?? 160)
  const state = new Cell<{ value: string; options: readonly SelectOption[] }>({
    value: native.value,
    options: [...native.options].map((option): SelectOption => ({
      value: option.value,
      label: option.textContent ?? '',
      disabled: option.disabled,
    })),
  })
  const listeners: ((value: string) => void)[] = []
  function View() {
    const current = useCell(state)
    return (
      <Select
        id={id}
        value={current.value}
        options={current.options.map(option => ({ ...option }))}
        popupMatchSelectWidth={false}
        style={{ minWidth }}
        showSearch={search ? { optionFilterProp: 'label' } : false}
        onChange={(value: string) => {
          state.set({ ...state.get(), value })
          for (const listener of listeners) listener(value)
        }}
      />
    )
  }
  mount(hostFor(native, 'ui-select'), <View />)
  selects.set(id, {
    get value() {
      return state.get().value
    },
    set value(value: string) {
      state.set({ ...state.get(), value })
    },
    get options() {
      return state.get().options
    },
    setOptions(options) {
      state.set({ ...state.get(), options })
    },
    onChange(listener) {
      listeners.push(listener)
    },
  })
}

function checkboxControl(
  id: string | undefined,
  label: string,
  checked: boolean,
): { node: ReactNode; handle: CheckboxHandle } {
  const state = new Cell(checked)
  const listeners: ((checked: boolean) => void)[] = []
  function View() {
    const current = useCell(state)
    return (
      <Checkbox
        {...(id === undefined ? {} : { id })}
        checked={current}
        onChange={event => {
          state.set(event.target.checked)
          for (const listener of listeners) listener(event.target.checked)
        }}
      >
        {label}
      </Checkbox>
    )
  }
  return {
    node: <View />,
    handle: {
      get checked() {
        return state.get()
      },
      set checked(value: boolean) {
        state.set(value)
      },
      onChange(listener) {
        listeners.push(listener)
      },
    },
  }
}

function upgradeCheckbox(native: HTMLInputElement): void {
  const label = native.closest('label') ?? native
  const control = checkboxControl(native.id, label.textContent?.trim() ?? '', native.checked)
  mount(hostFor(label, 'ui-checkbox'), control.node)
  checkboxes.set(native.id, control.handle)
}

function upgradeButton(native: HTMLButtonElement): void {
  const id = native.id
  const small = native.closest('.arch-canvas-bar, .structure-bar') !== null
  const state = new Cell({
    disabled: native.disabled,
    hidden: native.hidden === true,
    pressed: false,
  })
  const listeners: (() => void)[] = []
  const label = native.textContent ?? ''
  function View() {
    const current = useCell(state)
    if (current.hidden) return null
    return (
      <Button
        id={id}
        size={small ? 'small' : 'middle'}
        disabled={current.disabled}
        aria-pressed={current.pressed}
        type={current.pressed ? 'primary' : 'default'}
        onClick={() => {
          for (const listener of listeners) listener()
        }}
      >
        {label}
      </Button>
    )
  }
  mount(hostFor(native, 'ui-button'), <View />)
  const patch = (change: Partial<{ disabled: boolean; hidden: boolean; pressed: boolean }>) =>
    state.set({ ...state.get(), ...change })
  buttons.set(id, {
    get disabled() {
      return state.get().disabled
    },
    set disabled(value: boolean) {
      patch({ disabled: value })
    },
    get hidden() {
      return state.get().hidden
    },
    set hidden(value: boolean) {
      patch({ hidden: value })
    },
    get pressed() {
      return state.get().pressed
    },
    set pressed(value: boolean) {
      patch({ pressed: value })
    },
    onClick(listener) {
      listeners.push(listener)
    },
  })
}

/** 把已有的 DOM 节点挪进 React 渲染的容器，节点本身（含 id 与脚本写入的内容）不变。 */
function Adopt({ nodes }: { readonly nodes: readonly Node[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.append(...nodes)
  }, [nodes])
  return <div ref={ref} className="ui-collapse-body" />
}

function upgradeDetails(details: HTMLDetailsElement): void {
  const summary = details.querySelector(':scope > summary')
  const title = summary?.textContent ?? ''
  const nodes = [...details.childNodes].filter(node => node !== summary)
  const host = document.createElement('div')
  host.className = `ui-collapse ${details.className}`
  details.replaceWith(host)
  mount(
    host,
    <Collapse
      defaultActiveKey={details.open ? ['body'] : []}
      items={[{ key: 'body', label: title, forceRender: true, children: <Adopt nodes={nodes} /> }]}
    />,
  )
}

const VIEW_OF_TAB: Readonly<Record<string, ViewName>> = {
  'arch-tab': 'architecture',
  'conformance-tab': 'conformance',
  'metrics-tab': 'metrics',
}
const PANE_OF_VIEW: Readonly<Record<ViewName, string>> = {
  architecture: 'architecture-pane',
  conformance: 'conformance-pane',
  metrics: 'metrics-pane',
}
const viewHandlers = new Map<ViewName, () => void>()

/** 当前视图跟随面板的 hidden 属性：谁切换面板都不必另外通知导航。 */
function upgradeNav(nav: HTMLElement): void {
  const tabs = [...nav.querySelectorAll('button')].flatMap(tab => {
    const view = VIEW_OF_TAB[tab.id]
    return view === undefined ? [] : [{ id: tab.id, view, label: tab.textContent ?? '' }]
  })
  const visible = (): ViewName =>
    tabs.find(tab => document.getElementById(PANE_OF_VIEW[tab.view])?.hidden === false)?.view ??
    'architecture'
  const current = new Cell(visible())
  const observer = new MutationObserver(() => current.set(visible()))
  for (const tab of tabs) {
    const pane = document.getElementById(PANE_OF_VIEW[tab.view])
    if (pane !== null) observer.observe(pane, { attributes: true, attributeFilter: ['hidden'] })
  }
  const activate = (view: ViewName): void => viewHandlers.get(view)?.()
  function View() {
    const value = useCell(current)
    return (
      <Segmented<ViewName>
        value={value}
        onChange={activate}
        options={tabs.map(tab => ({
          value: tab.view,
          // 点已选中的视图也重新进入它（例如符合性面板会重置筛选），与原来的按钮一致。
          label: (
            <span
              id={tab.id}
              onClick={() => {
                if (tab.view === current.get()) activate(tab.view)
              }}
            >
              {tab.label}
            </span>
          ),
        }))}
      />
    )
  }
  nav.replaceChildren()
  mount(nav, <View />)
}

function required<T>(registry: ReadonlyMap<string, T>, id: string): T {
  const handle = registry.get(id)
  if (handle === undefined) throw new Error(`Missing report control ${id}`)
  return handle
}

export function upgradeReport(root: ParentNode): void {
  const nav = root.querySelector<HTMLElement>('.arch-nav')
  if (nav !== null) upgradeNav(nav)
  for (const details of root.querySelectorAll<HTMLDetailsElement>(
    'details.arch-filters, details.arch-notice',
  ))
    upgradeDetails(details)
  for (const native of root.querySelectorAll<HTMLSelectElement>('select[id]')) upgradeSelect(native)
  for (const native of root.querySelectorAll<HTMLInputElement>('input[type=checkbox][id]'))
    upgradeCheckbox(native)
  for (const native of root.querySelectorAll<HTMLButtonElement>('button[id]')) upgradeButton(native)
}

export const reportUi: ReportUiApi = {
  select: id => required(selects, id),
  checkbox: id => required(checkboxes, id),
  button: id => required(buttons, id),
  checkboxElement(label, checked) {
    const control = checkboxControl(undefined, label, checked)
    const host = document.createElement('span')
    host.className = 'ui-checkbox'
    mount(host, control.node)
    return { element: host, handle: control.handle }
  },
  action(label, onClick, kind = 'default') {
    const host = document.createElement('span')
    host.className = kind === 'link' ? 'ui-link' : 'ui-action'
    mount(
      host,
      <Button
        type={kind === 'link' ? 'link' : 'default'}
        size={kind === 'link' ? 'small' : 'middle'}
        onClick={onClick}
      >
        {label}
      </Button>,
    )
    return host
  },
  radio(host, options, value, onChange) {
    const state = new Cell(value)
    function View() {
      return (
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          size="small"
          value={useCell(state)}
          options={options.map(option => ({ ...option }))}
          onChange={event => {
            state.set(String(event.target.value))
            onChange(String(event.target.value))
          }}
        />
      )
    }
    mount(host, <View />)
    return {
      get value() {
        return state.get()
      },
      set value(next: string) {
        state.set(next)
      },
    }
  },
  onView(view, handler) {
    viewHandlers.set(view, handler)
  },
  functionTable(host, props) {
    // 只挂载一次，之后换数据：点表头排序时表格不卸载重建，不闪。
    const state = new Cell(props)
    function View() {
      return <FunctionTable {...useCell(state)} />
    }
    mount(host, <View />)
    return { update: next => state.set(next) }
  },
}
