// Presentation only. Authentication and driver permissions always come from the server.
export function isNativeDriver() {
  return typeof navigator !== 'undefined' && /\bAchiltDriverAndroid\/\d+\b/.test(navigator.userAgent)
}

export function nativeVideoNeedsUpdate() {
  return typeof navigator !== 'undefined' && /\bAchiltDriverAndroid\/1\b/.test(navigator.userAgent)
}
