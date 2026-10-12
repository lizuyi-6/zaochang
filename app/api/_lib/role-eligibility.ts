export function canHoldEmailWhitelistRole(
  identity: { authVia?: unknown } | null | undefined,
): boolean {
  return identity?.authVia === "session" || identity?.authVia === "legacy";
}
