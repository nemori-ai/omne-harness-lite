// Setting views as `assets/v1` gives them: the Shell tool's call permission, and one item of each
// other kind.
import type { SettingView } from '@omne-harness/assets-protocol'

type Permission = Extract<SettingView, { kind: 'permission' }>

export const SHELL_ASSET = { category: 'tool', name: 'shell' } as const

export function permissionView(overrides: Partial<Permission> = {}): Permission {
  return {
    kind: 'permission',
    asset: SHELL_ASSET,
    item: 'call-permission',
    revision: '1',
    declaration: {
      title: '调用权限',
      purpose: 'Shell 工具每次调用要不要人批准。',
      appliesAt: '下一次工具调用起生效，正在进行的那一次不变。',
      clearEffect: '这一层不再有挑选，按外层求值。',
    },
    choices: [
      { value: 'deny', label: '拒绝', description: '不允许调用。', permitsOperation: false },
      { value: 'ask', label: '询问', description: '每次调用先问人。', permitsOperation: true },
      { value: 'auto', label: '自动', description: '不需要人批准。', permitsOperation: true },
    ],
    default: 'ask',
    own: null,
    effective: { kind: 'value', value: 'ask', source: 'default' },
    bound: null,
    editable: { kind: 'yes' },
    ...overrides,
  }
}

export function ordinaryView(): SettingView {
  return {
    kind: 'ordinary',
    asset: { category: 'tool', name: 'files' },
    item: 'max-read-bytes',
    revision: '4',
    declaration: {
      title: '一次读取的上限',
      purpose: '读文件时一次最多读多少字节。',
      appliesAt: '下一次读取起生效。',
      clearEffect: '这一层不再提供这个值。',
    },
    valueSchema: { type: 'integer' },
    default: { kind: 'set', value: 65536 },
    own: { kind: 'unset' },
    effective: { value: { kind: 'set', value: 65536 }, source: 'default' },
    lockedBy: null,
    editable: { kind: 'no', reason: 'locked' },
  }
}

export function secretView(): SettingView {
  return {
    kind: 'secret',
    asset: { category: 'model', name: 'openai' },
    item: 'api-key',
    revision: '2',
    declaration: {
      title: '模型供应商的密钥',
      purpose: '调用模型时用的密钥。',
      appliesAt: '下一次模型请求起生效。',
      clearEffect: '清掉这一层的密钥。',
    },
    own: 'unset',
    official: 'available',
    editable: { kind: 'no', reason: 'not-a-source' },
  }
}
