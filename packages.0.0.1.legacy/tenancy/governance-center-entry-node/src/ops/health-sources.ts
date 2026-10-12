import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { DeploymentKeyLoad, DeploymentParameters, HealthSources } from './health.ts'
import { probeStorage, type ProbeSources } from './health-probe.ts'

interface HealthSourceOptions extends ProbeSources {
  readonly clock: Clock
  readonly deploymentKey: DeploymentKeyLoad
  readonly deploymentParameters: DeploymentParameters
}

/** Preserve the original field reads at observation time. */
export function createHealthSources(options: HealthSourceOptions): HealthSources {
  return {
    get clock() {
      return options.clock
    },
    get deploymentKey() {
      return options.deploymentKey
    },
    get deploymentParameters() {
      return options.deploymentParameters
    },
    probe: () => probeStorage(options),
  }
}
