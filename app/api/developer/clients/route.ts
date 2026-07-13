import { jsonError, requireMember } from "../../_lib/community";
import { createDeveloperClient, listDeveloperClients, updateDeveloperClient } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();
    return Response.json({ clients: await listDeveloperClients(member.email) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const input = await request.json() as Record<string, unknown>;
    return Response.json({ client: await createDeveloperClient(member.email, input) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const member = await requireMember();
    const input = await request.json() as Record<string, unknown>;
    return Response.json(await updateDeveloperClient(member.email, String(input.clientId ?? ""), String(input.action ?? "")));
  } catch (error) {
    return jsonError(error);
  }
}
