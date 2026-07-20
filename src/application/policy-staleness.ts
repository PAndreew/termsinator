export function policyUrlsChanged(
  analyzedUrls: readonly string[],
  discoveredUrls: readonly string[],
): boolean {
  if (analyzedUrls.length === 0) return false;
  const current = new Set(discoveredUrls);
  return analyzedUrls.some((url) => !current.has(url));
}
