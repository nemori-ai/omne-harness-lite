import type { TenantSettingsPort } from '@omne-harness/assets-access'

type Port = TenantSettingsPort

export type SettingView = Extract<
  Awaited<ReturnType<Port['describe']>>,
  { kind: 'described' }
>['item']
export type SecretView = Extract<SettingView, { kind: 'secret' }>
export type SecretItemInput = Pick<
  Parameters<Port['describe']>[0],
  'principal' | 'tenant' | 'asset' | 'item'
>
export type SecretListInput = Pick<Parameters<Port['list']>[0], 'principal' | 'tenant' | 'asset'>

type Refusal<K extends string> = Readonly<{ kind: K }>
type Written = Readonly<{ kind: 'written'; revision: '0' }>

export type SecretListOutcome =
  | Readonly<{ kind: 'listed'; items: readonly SecretView[] }>
  | Refusal<'denied' | 'unavailable'>
export type SecretDescribeOutcome =
  | Readonly<{ kind: 'described'; item: SecretView }>
  | Refusal<'denied' | 'not-visible' | 'conflict' | 'unavailable'>
export type SecretSetOutcome =
  | Written
  | Refusal<'denied' | 'not-visible' | 'invalid' | 'conflict' | 'unavailable' | 'unknown'>
export type SecretClearOutcome =
  | Written
  | Refusal<'no-change' | 'denied' | 'not-visible' | 'conflict' | 'unavailable' | 'unknown'>

export interface SecretSettings {
  list(input: SecretListInput): Promise<SecretListOutcome>
  describe(input: SecretItemInput): Promise<SecretDescribeOutcome>
  set(input: SecretItemInput & Readonly<{ secret: string }>): Promise<SecretSetOutcome>
  clear(input: SecretItemInput): Promise<SecretClearOutcome>
}
