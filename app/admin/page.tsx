import { notFound } from "next/navigation";
import { requireAdmin } from "../api/_lib/admin";
import { AdminConsole } from "./admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch {
    notFound();
  }
  return <AdminConsole />;
}
