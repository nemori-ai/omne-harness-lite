// pg 方言本程只接线不跑：需要一个可连的 PostgreSQL（环境变量 OMNE_TEST_PG_URL）。跳过不是通过（verification 登记）。
import { describe, it } from 'vitest'
import { describeStorageConformance } from '@omne-harness-lite/storage/conformance'
import { openStorage } from '../src/index.ts'

const url = process.env['OMNE_TEST_PG_URL']
if (url === undefined) {
  describe.skip('storage conformance · postgres（缺 OMNE_TEST_PG_URL，未运行）', () => {
    it('skipped', () => {})
  })
} else {
  describeStorageConformance('postgres', () =>
    openStorage({ dialect: 'postgres', connectionString: url }),
  )
}
