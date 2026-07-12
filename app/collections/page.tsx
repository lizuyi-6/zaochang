import type { Metadata } from "next";
import { CollectionsClient } from "./collections-client";

export const metadata: Metadata = { title: "灵感收藏" };

export default function CollectionsPage() {
  return <CollectionsClient />;
}
