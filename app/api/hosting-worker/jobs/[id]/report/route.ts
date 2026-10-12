import { accessError, jsonError } from "../../../../_lib/errors";
import { reportHostingJob } from "../../../../_lib/hosting";
import { noStore, requireHostingWorkerRequest } from "../../../../_lib/hosting-worker-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireHostingWorkerRequest(request);
    const { id: rawId } = await context.params;
    if (!/^[1-9][0-9]*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) throw accessError("invalid_job_id", 400);
    const lease = request.headers.get("x-hosting-lease") ?? "";
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw accessError("invalid_report", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw accessError("invalid_report", 400);
    return noStore(Response.json(await reportHostingJob(Number(rawId), lease, body as Record<string, unknown>)));
  } catch (error) {
    return noStore(jsonError(error));
  }
}
