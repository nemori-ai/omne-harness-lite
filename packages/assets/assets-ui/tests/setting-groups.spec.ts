import { describe, expect, it } from 'vitest'
import type { SettingView } from '@omne-harness/assets-protocol'
import { groupsOf } from '../src/model/setting-groups.ts'
import type { Row } from '../src/model/settings-machine.ts'
import { ordinaryView } from './fixtures/views.ts'

const group = (id: string, title = id) => ({ id, title, description: `${title} 的说明` })

function row(key: string, owner: SettingView['owner'], declared: ReturnType<typeof group>): Row {
  const view = ordinaryView()
  return {
    key,
    view: { ...view, owner, declaration: { ...view.declaration, group: declared } },
    read: { kind: 'read' },
    write: { kind: 'none' },
  }
}

const CALENDAR = {
  kind: 'independent',
  providerId: 'calendar',
  definitionId: 'environment',
} as const
const SCHEDULE = {
  kind: 'independent',
  providerId: 'schedule',
  definitionId: 'environment',
} as const

describe('the blocks of the settings page', () => {
  it('one block per owner and group, in the order they first appear; asset rows are not blocks', () => {
    const rows = [
      row('a', CALENDAR, group('environment', '日历与时区')),
      row('b', { kind: 'asset', category: 'tool', name: 'Shell' }, group('environment')),
      row('c', SCHEDULE, group('environment', 'agent 管理日程')),
      row('d', CALENDAR, group('environment', '日历与时区')),
      row('e', CALENDAR, group('other', '别的')),
    ]
    expect(
      groupsOf(rows).map(block => [block.title, block.description, block.rows.map(r => r.key)]),
    ).toEqual([
      ['日历与时区', '日历与时区 的说明', ['a', 'd']],
      ['agent 管理日程', 'agent 管理日程 的说明', ['c']],
      ['别的', '别的 的说明', ['e']],
    ])
  })
})
