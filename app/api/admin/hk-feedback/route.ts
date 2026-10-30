import { GET as listFeedback } from "../../hyperknow/feedback/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return listFeedback(request);
}
