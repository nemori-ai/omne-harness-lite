import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import {
  attachScheduleReads,
  bindScheduleReads,
  describeActivation,
  scheduleReadsOf,
} from '@omne-harness/schedule-tools'
import { checkReleaseDescription } from '@omne-harness/tool-contract/testing'
import { DEFINITION, ID, NOW, TENANT, context, parse, services, view } from './world.ts'

type Service = ReturnType<typeof services>

function reading(
  service: Service,
  overrides: Partial<Parameters<typeof bindScheduleReads>[0]> = {},
) {
  const controller = new AbortController()
  const reads = bindScheduleReads({
    tenant: TENANT,
    queries: () => service.queries,
    context: async () => context,
    now: () => NOW as never,
    ...overrides,
  })
  const detach = attachScheduleReads(controller.signal, reads)
  return { signal: controller.signal, detach, controller }
}

const describing = (command: string, params: unknown, signal: AbortSignal) =>
  describeActivation({ arguments: parse(command as never, params) as never, signal })

const rows = (described: Awaited<ReturnType<typeof describeActivation>>) =>
  Object.fromEntries(described.rows.map(row => [row.label, row.value]))
const typed = (described: Awaited<ReturnType<typeof describeActivation>>) =>
  JSON.parse(writeJsonText(described.typed!))

describe('what an activating call would do, for the release card', () => {
  it('names a new schedule, its rule, time zone, next times and work, from the reads attached to it', async () => {
    const service = services([])
    const { signal } = reading(service)
    const described = await describing('create', { definition: DEFINITION }, signal)
    expect(rows(described)).toEqual({
      动作: '新建并生效',
      日程: '交月报',
      规则: '每月最后一个工作日，17:00',
      时区: 'Asia/Shanghai',
      接下来三次: ['2026-11-30 17:00'],
      要做的事: '提醒「月报」',
    })
    expect(typed(described)).toEqual({
      action: 'create',
      name: '交月报',
      next: { kind: 'times', times: ['2026-11-30 17:00'] },
    })
  })

  it('reads the schedule a change names, and says a pause ends its next times', async () => {
    const service = services([])
    const { signal } = reading(service)
    const paused = await describing('pause', { schedule: ID, revision: 3 }, signal)
    expect(rows(paused)).toEqual({
      动作: '暂停',
      日程: '交月报',
      规则: '每月最后一个工作日，17:00',
      接下来三次: '这一动作之后不再执行',
      要做的事: '提醒「月报」',
    })
    expect(typed(paused).next).toEqual({ kind: 'none' })
    const renamed = await describing(
      'update',
      { schedule: ID, revision: 3, label: '交季报' },
      signal,
    )
    expect(rows(renamed)).toMatchObject({ 动作: '修改生效中的日程', 改成: '名字「交季报」' })
  })

  it('says what it could not read instead of failing the detail', async () => {
    const service = services([])
    ;(service.queries as any).preview = async () => ({ kind: 'error', error: { code: 'x' } })
    ;(service.queries as any).get = async () => {
      throw new Error('down')
    }
    const { signal } = reading(service)
    const resumed = await describing('resume', { schedule: ID, revision: 3 }, signal)
    expect(rows(resumed)).toEqual({
      动作: '恢复',
      日程: '未命名',
      规则: '取不到',
      时区: '取不到',
      接下来三次: '取不到',
      要做的事: '取不到',
    })
    expect(typed(resumed)).toEqual({
      action: 'resume',
      name: '未命名',
      next: { kind: 'unavailable' },
    })
  })

  it('describes from the arguments alone when nothing is attached to the description', async () => {
    const described = await describing(
      'create',
      { definition: DEFINITION },
      new AbortController().signal,
    )
    expect(rows(described)).toMatchObject({
      日程: '交月报',
      规则: '每月最后一个工作日，17:00',
      时区: '取不到',
      接下来三次: '取不到',
    })
  })

  it('reaches nothing for a context of another tenant', async () => {
    const service = services([])
    const { signal } = reading(service, {
      context: async () => ({ owner: { kind: 'tenant', tenantId: 'tenant/o/b' } }) as never,
    })
    expect(rows(await describing('promote', { schedule: ID, revision: 2 }, signal))).toMatchObject({
      日程: '未命名',
      接下来三次: '取不到',
    })
  })

  it('gives the same description every time and writes nothing', async () => {
    const service = services([])
    const { signal } = reading(service)
    const checked = await checkReleaseDescription(
      describeActivation as never,
      {
        principal: null,
        tenant: null as never,
        arguments: parse('replace', {
          schedule: ID,
          revision: 2,
          definition: DEFINITION,
          reason: 'r',
        }),
        signal,
      },
      { state: async () => service.asked.length },
    )
    expect(checked).toHaveProperty('ok')
  })

  it('takes the reads away when the description detaches or aborts', () => {
    const one = reading(services([]))
    expect(scheduleReadsOf(one.signal)).toBeDefined()
    one.detach()
    expect(scheduleReadsOf(one.signal)).toBeUndefined()
    const other = reading(services([]))
    other.controller.abort()
    expect(scheduleReadsOf(other.signal)).toBeUndefined()
  })
})

it('keeps the view the world serves in step with the schedule a change names', () => {
  expect(view().definition.label).toBe(DEFINITION.label)
})
