import { test } from '@playwright/test'
import { checkLaunchInputs, launchSpec } from '../scripts/launch.ts'

// Before any packaged test: a packaged app whose fuses are not the test profile's starts none of them.
test("the packaged test app has the test profile's fuses", async () => {
  await checkLaunchInputs(launchSpec('packaged', 'test', { userDataDir: 'unused' }))
})
