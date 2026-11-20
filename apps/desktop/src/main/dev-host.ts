import { watch } from 'node:fs'
import type { DevelopmentHost } from './dev-host.contract.ts'

export const developmentHost: DevelopmentHost | undefined = {
  userDataSuffix: 'dev',
  watchPage(pageRoot, reload) {
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(pageRoot, { recursive: true }, () => {
      clearTimeout(timer)
      timer = setTimeout(reload, 200)
    })
  },
}
