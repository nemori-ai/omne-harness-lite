import { describeStorageConformance } from '@omne-harness-lite/storage/conformance'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

const file = tempSqliteFile('conformance')
// 一致性套件的两个实例同文件、都不开升级守卫（守卫实例之外的打开者不看锁，design.md「属主实例」）
describeStorageConformance('sqlite (node:sqlite)', () =>
  openStorage({ dialect: 'sqlite', file, upgrade: false }),
)
