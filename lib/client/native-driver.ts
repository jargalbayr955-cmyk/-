// Presentation only. Authentication and driver permissions always come from the server.
export function isNativeDriver() {
  return typeof navigator !== 'undefined' && /\bAchiltDriverAndroid\/1\b/.test(navigator.userAgent)
}
