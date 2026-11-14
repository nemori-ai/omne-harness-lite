import type { FunctionTableProps } from '../metrics/function-table.tsx'

export interface SelectOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

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

export interface ReportUiApi {
  select(id: string): SelectHandle
  checkbox(id: string): CheckboxHandle
  button(id: string): ButtonHandle
  checkboxElement(label: string, checked: boolean): { element: HTMLElement; handle: CheckboxHandle }
  action(label: string, onClick: () => void, kind?: 'default' | 'link'): HTMLElement
  radio(
    host: HTMLElement,
    options: readonly SelectOption[],
    value: string,
    onChange: (value: string) => void,
  ): { value: string }
  onView(view: ViewName, handler: () => void): void
  functionTable(
    host: HTMLElement,
    props: FunctionTableProps,
  ): { update(props: FunctionTableProps): void }
}
