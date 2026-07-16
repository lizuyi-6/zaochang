export function resolvePublicAppOrigin(requestUrl: string, appEnv: string | undefined, configuredOrigin: string | undefined) {
  const configured = configuredOrigin?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("invalid_public_app_origin");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("invalid_public_app_origin");
    }
    return url.origin;
  }
  if (appEnv === "production") throw new Error("public_app_origin_required");
  return new URL(requestUrl).origin;
}
