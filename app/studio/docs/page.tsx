import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireFounder } from "../../api/_lib/admin.ts";
import { DocsManager } from "./docs-manager.tsx";

export const metadata: Metadata = { title: "文档管理" };
export const dynamic = "force-dynamic";

export default async function StudioDocsPage() {
  try {
    await requireFounder();
  } catch {
    notFound();
  }
  return <DocsManager />;
}
