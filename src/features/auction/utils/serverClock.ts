/**
 * Estimate the Firebase Realtime Database server clock from the local clock.
 * serverTimeOffset is reported as server time minus local time.
 */
export function getEstimatedServerNow(serverTimeOffset = 0, localNow = Date.now()): number {
  return localNow + serverTimeOffset;
}

export function getTimeLeftMs(
  timerEndsAt: string | null | undefined,
  serverTimeOffset = 0,
  localNow = Date.now(),
): number {
  if (!timerEndsAt) return 0;
  return Math.max(0, new Date(timerEndsAt).getTime() - getEstimatedServerNow(serverTimeOffset, localNow));
}
