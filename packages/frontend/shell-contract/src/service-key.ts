declare const serviceShape: unique symbol

export type ServiceKey<T> = string & { readonly [serviceShape]?: () => T }

export function serviceKey<T>(name: string): ServiceKey<T> {
  return name as ServiceKey<T>
}
