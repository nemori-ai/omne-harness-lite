import * as runner from 'vitest'
import { describeAtomicStorageConformance } from '@omne-harness-lite/storage/conformance'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

const file = tempSqliteFile('atomic-full')
describeAtomicStorageConformance(
  'SQLite FULL',
  () => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }),
  runner,
)
