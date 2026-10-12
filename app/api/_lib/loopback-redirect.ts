export type LoopbackRegistrationSource = "developer" | "dynamic";
export type LoopbackRedirectPurpose = "authorization" | "payment";

export function loopbackRedirectAllowed(input: {
  appEnv: string | undefined;
  registrationSource: LoopbackRegistrationSource | string;
  purpose: LoopbackRedirectPurpose;
}): boolean {
  if (input.appEnv !== "production") return true;
  return input.registrationSource === "dynamic" && input.purpose === "authorization";
}

export function isLoopbackHttpRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
