import { accessError, jsonError } from "../../_lib/errors";
import { claimHostingJob } from "../../_lib/hosting";
import { noStore, requireHostingWorkerRequest } from "../../_lib/hosting-worker-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireHostingWorkerRequest(request);
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw accessError("invalid_claim", 400);
    }
    const worker = input && typeof input === "object" ? (input as Record<string, unknown>).worker : null;
    if (typeof worker !== "string" || worker.length > 64) throw accessError("invalid_claim", 400);
    return noStore(Response.json(await claimHostingJob(worker)));
  } catch (error) {
    return noStore(jsonError(error));
  }
}
