import type { SettingView } from '@omne-harness/assets-protocol'
import { writeJsonText } from '@omne-harness/json-text'
import { FactRow } from '@omne-harness/ui-kit'
import type { JSX } from 'react'

type Layer = 'default' | 'organization' | 'tenant'

const LAYER: Readonly<Record<Layer, string>> = {
  default: '默认',
  organization: '组织',
  tenant: '租户（这一层）',
}

const NOT_EDITABLE: Readonly<Record<'locked' | 'not-a-source' | 'prohibited-above', string>> = {
  locked: '被上层锁定',
  'not-a-source': '这一层不能配这一项',
  'prohibited-above': '上层已经主动禁止',
}

const SECRET: Readonly<Record<'unset' | 'available' | 'revoked' | 'unreadable', string>> = {
  unset: '未配置',
  available: '可用',
  revoked: '已吊销',
  unreadable: '读不出',
}

type Permission = Extract<SettingView, { kind: 'permission' }>
type Ordinary = Extract<SettingView, { kind: 'ordinary' }>
type Secret = Extract<SettingView, { kind: 'secret' }>

const choiceLabel = (view: Permission, value: string): string =>
  view.choices.find(choice => choice.value === value)?.label ?? value

function permissionEffective(view: Permission): { value: string; source: string } {
  const effective = view.effective
  switch (effective.kind) {
    case 'value':
      return { value: choiceLabel(view, effective.value), source: LAYER[effective.source] }
    case 'prohibited':
      return {
        value: `被${effective.by === 'organization' ? '组织' : '租户'}主动禁止`,
        source: LAYER[effective.by],
      }
    default:
      return { value: '上层允许的档位是空的，什么都不允许', source: '上层的锁' }
  }
}

function PermissionFacts({ view }: { readonly view: Permission }): JSX.Element {
  const { value, source } = permissionEffective(view)
  return (
    <>
      <FactRow term="生效的值">{value}</FactRow>
      <FactRow term="来源">{source}</FactRow>
      <FactRow term="这一层的挑选">
        {view.own === null ? '没有挑选' : choiceLabel(view, view.own)}
      </FactRow>
      {view.bound === null ? null : (
        <FactRow term="上层只允许">
          {view.bound.length === 0 ? '无' : view.bound.map(v => choiceLabel(view, v)).join('、')}
        </FactRow>
      )}
    </>
  )
}

function OrdinaryFacts({ view }: { readonly view: Ordinary }): JSX.Element {
  const { value, source } = view.effective
  return (
    <>
      <FactRow term="生效的值">
        {value.kind === 'set' ? <code>{writeJsonText(value.value)}</code> : '没有值'}
      </FactRow>
      <FactRow term="来源">{source === null ? '没有哪一层给值' : LAYER[source]}</FactRow>
      <FactRow term="这一层的值">
        {view.own.kind === 'set' ? <code>{writeJsonText(view.own.value)}</code> : '未设置'}
      </FactRow>
    </>
  )
}

function SecretFacts({ view }: { readonly view: Secret }): JSX.Element {
  return (
    <>
      <FactRow term="这一层的秘密">{SECRET[view.own]}</FactRow>
      <FactRow term="部署层的秘密">{SECRET[view.official]}</FactRow>
    </>
  )
}

function KindFacts({ view }: { readonly view: SettingView }): JSX.Element {
  switch (view.kind) {
    case 'permission':
      return <PermissionFacts view={view} />
    case 'ordinary':
      return <OrdinaryFacts view={view} />
    case 'secret':
      return <SecretFacts view={view} />
  }
}

export function Facts({ view }: { readonly view: SettingView }): JSX.Element {
  return (
    <>
      <KindFacts view={view} />
      <FactRow term="何时生效">{view.declaration.appliesAt}</FactRow>
      <FactRow term="能不能改">
        {view.editable.kind === 'yes' ? '能改' : `不能改：${NOT_EDITABLE[view.editable.reason]}`}
      </FactRow>
    </>
  )
}

export function hasOwn(view: SettingView): boolean {
  switch (view.kind) {
    case 'permission':
      return view.own !== null
    case 'ordinary':
      return view.own.kind === 'set'
    case 'secret':
      return view.own !== 'unset'
  }
}
