import { describeStorageConformance } from '@omne-harness-lite/storage/conformance'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

const file = tempSqliteFile('conformance')
describeStorageConformance('sqlite (node:sqlite)', () => openStorage({ dialect: 'sqlite', file }))
