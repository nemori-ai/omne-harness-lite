/** The part of the window options that is the window's chrome; it is spread into `BrowserWindow`'s options. */
export type WindowChrome = Readonly<{
  titleBarStyle?: 'hiddenInset'
  trafficLightPosition?: Readonly<{ x: number; y: number }>
}>

/** Where macOS puts the window's buttons: over the sidebar's top strip, clear of the fold control below. */
export const TRAFFIC_LIGHT_POSITION = { x: 14, y: 16 } as const

/** macOS hides its title bar and insets its buttons; elsewhere the system's own frame stays. */
export function windowChrome(platform: NodeJS.Platform): WindowChrome {
  return platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { ...TRAFFIC_LIGHT_POSITION } }
    : {}
}
