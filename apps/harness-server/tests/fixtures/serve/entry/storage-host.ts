import type { Context } from '@deepseek-ai/cordis'
import { S0_ASSEMBLY_LIFECYCLE_KEY } from '../../../../src/lifecycle.ts'
import type {
  AssemblyLifecycle,
  EntryObjectModule,
  RowId,
  StopResult,
} from '../../../../src/types.ts'
import {
  FixtureStorageHostService,
  storageHostKey,
  type FixtureStorageControl,
} from '../definitions.ts'
import { storageEvents } from '../rows/storage/index.ts'

const STORAGE_ROW = 'storage' as RowId

export type FixtureHostOptions = Readonly<{
  register?: boolean
}>

class FixtureStorageHost extends FixtureStorageHostService {
  private readonly controls: FixtureStorageControl[] = []
  private readonly registers: boolean

  constructor(ctx: Context, registers: boolean) {
    super(ctx)
    this.registers = registers
  }

  attachControl(control: FixtureStorageControl): void {
    this.controls.push(control)
    if (!this.registers) return
    const controls = this.controls
    const lifecycle: AssemblyLifecycle = this.ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY)
    lifecycle.register({
      phase: 'storage',
      row: STORAGE_ROW,
      start: async () => {
        storageEvents.push('start')
      },
      stop: async (): Promise<StopResult> => {
        const results = await Promise.all(
          controls.map(saved => saved.close({ initiator: 'assembly' })),
        )
        return results.every(result => result === 'closed')
          ? { kind: 'settled' }
          : { kind: 'incomplete', detail: 'a control did not close' }
      },
      assemblyReportSettled: () => {
        for (const saved of controls) saved.assemblyReportSettled()
      },
    })
  }
}

export function fixtureStorageHost(options: FixtureHostOptions = {}): EntryObjectModule {
  return {
    name: storageHostKey,
    implementation: 'real',
    registersFor: [STORAGE_ROW],
    install(scope) {
      new FixtureStorageHost(scope, options.register ?? true)
    },
  }
}
