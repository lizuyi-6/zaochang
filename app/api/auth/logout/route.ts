import { NextResponse } from "next/server";
import { absoluteAppUrl, clearAuthCookie, requestSecure, safeReturnPath } from "../../../oauth-session";

export async function GET(request: Request) {
  await clearAuthCookie(await requestSecure(request));
  const url = absoluteAppUrl(request, "/");
  url.pathname = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  return NextResponse.redirect(url);
}
