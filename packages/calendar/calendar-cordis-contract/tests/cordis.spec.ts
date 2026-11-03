import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { CalendarSupply } from '@omne-harness/calendar-contract'
import { CalendarSupplyService, calendarSupplyKey } from '../src/cordis.ts'

it('owns one supply key and registers subclasses through the shared definition', async () => {
  class Supply extends CalendarSupplyService {
    probe: CalendarSupply['probe'] = async () => {
      throw new Error('unused')
    }
    refresh: CalendarSupply['refresh'] = async () => {
      throw new Error('unused')
    }
    importSeed: CalendarSupply['importSeed'] = async () => {
      throw new Error('unused')
    }
    queryPublication: CalendarSupply['queryPublication'] = async () => {
      throw new Error('unused')
    }
    health: CalendarSupply['health'] = async () => {
      throw new Error('unused')
    }
  }
  const root = new Context()
  const fiber = root.plugin(Supply)
  await fiber.await()
  expect(calendarSupplyKey).toBe('calendarSupply')
  expect(calendarSupplyKey).toBe(CalendarSupplyService.provide)
  expect(root.get(calendarSupplyKey)).toBeInstanceOf(CalendarSupplyService)
  await fiber.dispose()
  expect(root.get(calendarSupplyKey)).toBeUndefined()
  await root.fiber.dispose()
})
