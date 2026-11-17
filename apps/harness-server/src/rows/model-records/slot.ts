// Holds what a child fiber installed; a withdrawal clears it only while it still holds that value.
export function slot<T>() {
  let current: T | undefined
  return {
    read: () => current,
    install(value: T) {
      current = value
      return () => {
        if (current === value) current = undefined
      }
    },
  }
}
