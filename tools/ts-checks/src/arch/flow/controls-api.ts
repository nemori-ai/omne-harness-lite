import type { FunctionTableProps } from '../../metrics/flow/function-table.tsx'

/** 下拉的一个选项。disabled 的选项可见但不可选。 */
export interface SelectOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

/**
 * 控件句柄：页面脚本只经句柄读写控件，不碰 antd 渲染出来的 DOM。
 * 程序设值不触发 onChange，与原生控件一致；用户操作先更新值，再通知监听者。
 */
export interface SelectHandle {
  value: string
  readonly options: readonly SelectOption[]
  setOptions(options: readonly SelectOption[]): void
  onChange(listener: (value: string) => void): void
}

export interface CheckboxHandle {
  checked: boolean
  onChange(listener: (checked: boolean) => void): void
}

export interface ButtonHandle {
  disabled: boolean
  hidden: boolean
  pressed: boolean
  onClick(listener: () => void): void
}

export type ViewName = 'architecture' | 'conformance' | 'metrics'

/**
 * 内联 bundle 设为 `window.ReportUi`。页面标记仍写原生控件；bundle 加载时把它们换成 antd 组件，
 * id、可见文字与选项照搬，脚本再按 id 取句柄。折叠区与视图切换同样在加载时替换。
 */
export interface ReportUiApi {
  select(id: string): SelectHandle
  checkbox(id: string): CheckboxHandle
  button(id: string): ButtonHandle
  /** 动态生成的复选框：返回放好控件的元素与句柄，调用方自行插入。 */
  checkboxElement(label: string, checked: boolean): { element: HTMLElement; handle: CheckboxHandle }
  /** 动态生成的按钮：返回放好按钮的元素，调用方自行插入。 */
  action(label: string, onClick: () => void, kind?: 'default' | 'link'): HTMLElement
  radio(
    host: HTMLElement,
    options: readonly SelectOption[],
    value: string,
    onChange: (value: string) => void,
  ): { value: string }
  /** 视图切换由各面板脚本登记处理函数；当前视图跟随面板的 hidden 属性。 */
  onView(view: ViewName, handler: () => void): void
  /** 表格挂载一次；之后经 update 换数据，不重建。 */
  functionTable(
    host: HTMLElement,
    props: FunctionTableProps,
  ): { update(props: FunctionTableProps): void }
}
