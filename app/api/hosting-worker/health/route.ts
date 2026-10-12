import { jsonError } from "../../_lib/errors";
import { noStore, requireHostingWorkerRequest } from "../../_lib/hosting-worker-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireHostingWorkerRequest(request);
    return noStore(Response.json({ ok: true }));
  } catch (error) {
    return noStore(jsonError(error));
  }
}
