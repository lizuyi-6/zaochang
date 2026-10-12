import { accessError, jsonError } from "../../../../_lib/errors";
import { openHostingBundle } from "../../../../_lib/hosting";
import { noStore, requireHostingWorkerRequest } from "../../../../_lib/hosting-worker-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireHostingWorkerRequest(request);
    const { id: rawId } = await context.params;
    if (!/^[1-9][0-9]*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) throw accessError("invalid_job_id", 400);
    const lease = request.headers.get("x-hosting-lease") ?? "";
    const bundle = await openHostingBundle(Number(rawId), lease);
    return noStore(new Response(bundle.body, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "x-bundle-sha256": bundle.sha256,
        "content-disposition": "attachment; filename=hosting-bundle.zip",
      },
    }));
  } catch (error) {
    return noStore(jsonError(error));
  }
}
