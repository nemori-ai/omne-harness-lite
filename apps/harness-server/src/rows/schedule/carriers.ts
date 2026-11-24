import type { Context } from '@deepseek-ai/cordis'
import { carriersOf, needText, workPathOf } from '@omne-harness/schedule'
import type {
  ScheduleCarrierNeed,
  ScheduleJobExecutor,
  ScheduleProgram,
  SchedulePurpose,
  ScheduleResultCarrier,
  ScheduleWork,
  ScheduleWorkPath,
} from '@omne-harness/schedule-contract'
import {
  ScheduleCarriersService,
  ScheduleExecutorsService,
  ScheduleProgramsService,
} from '@omne-harness/schedule-cordis-contract/cordis'

/** Entries rows register by key; withdrawing takes back only the entry it registered. Plain fields, since Cordis hands services out through a proxy. */
class Registry<T> {
  private readonly entries = new Map<string, T>()
  add(key: string, value: T): () => void {
    if (this.entries.has(key)) throw new Error(`${key} is already registered`)
    this.entries.set(key, value)
    return () => {
      if (this.entries.get(key) === value) this.entries.delete(key)
    }
  }
  get(key: string): T | undefined {
    return this.entries.get(key)
  }
}

class Programs extends ScheduleProgramsService {
  private readonly registry = new Registry<ScheduleProgram>()
  register(program: ScheduleProgram) {
    return this.registry.add(program.name, program)
  }
  get(name: string) {
    return this.registry.get(name)
  }
}

class Executors extends ScheduleExecutorsService {
  private readonly registry = new Registry<ScheduleJobExecutor>()
  register(path: ScheduleWorkPath, executor: ScheduleJobExecutor) {
    return this.registry.add(path, executor)
  }
  get(path: ScheduleWorkPath) {
    return this.registry.get(path)
  }
}

class ResultCarriers extends ScheduleCarriersService {
  private readonly registry = new Registry<ScheduleResultCarrier>()
  register(carrier: ScheduleResultCarrier) {
    return this.registry.add(needText(carrier), carrier)
  }
  has(carrier: ScheduleResultCarrier) {
    return this.registry.get(needText(carrier)) !== undefined
  }
}

export type Carriers = Readonly<{
  programs: ScheduleProgramsService
  executors: ScheduleExecutorsService
  results: ScheduleCarriersService
}>

/** The three registration surfaces of this run, each provided on the row's context. */
export function createCarriers(ctx: Context): Carriers {
  return {
    programs: new Programs(ctx),
    executors: new Executors(ctx),
    results: new ResultCarriers(ctx),
  }
}

function present(carriers: Carriers, need: ScheduleCarrierNeed): boolean {
  if (need.kind === 'executor') return carriers.executors.get(need.ref) !== undefined
  if (need.kind === 'program') return carriers.programs.get(need.ref) !== undefined
  return carriers.results.has(need)
}

/** The carriers a purpose selects that are not registered now, by name. */
export function missingCarriers(carriers: Carriers, purpose: SchedulePurpose): readonly string[] {
  return carriersOf(purpose)
    .filter(need => !present(carriers, need))
    .map(needText)
}

export function executorOf(
  carriers: Carriers,
  work: ScheduleWork,
): ScheduleJobExecutor | undefined {
  return carriers.executors.get(workPathOf(work))
}
