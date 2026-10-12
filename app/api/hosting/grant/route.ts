import { jsonError } from "../../_lib/errors";
import { requireMember } from "../../_lib/access-control";
import { getHostingGrant } from "../../_lib/hosting";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getHostingGrant(await requireMember()));
  } catch (error) {
    return jsonError(error);
  }
}
