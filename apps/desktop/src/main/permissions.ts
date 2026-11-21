/** The one permission a page has: the microphone, to record speech. Video with it is refused. */
export function onlyMicrophone(permission: string, media: readonly string[]): boolean {
  return permission === 'media' && media.length > 0 && media.every(type => type === 'audio')
}
