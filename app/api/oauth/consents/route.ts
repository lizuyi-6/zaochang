import { jsonError, requireMember } from "../../_lib/community";
import { listUserConsents, revokeUserConsent } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();
    return Response.json({ consents: await listUserConsents(member.email) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const member = await requireMember();
    const input = await request.json() as Record<string, unknown>;
    return Response.json(await revokeUserConsent(member.email, String(input.clientId ?? "")));
  } catch (error) {
    return jsonError(error);
  }
}
