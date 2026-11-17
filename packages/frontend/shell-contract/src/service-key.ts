declare const serviceShape: unique symbol

export type ServiceKey<T> = string & { readonly [serviceShape]?: () => T }

export function serviceKey<T>(name: string): ServiceKey<T> {
  return name as ServiceKey<T>
}

export function serviceOf<T>(services: Readonly<Record<string, unknown>>, key: ServiceKey<T>): T {
  return services[key] as T
}
