import type { Metadata } from "next";
import { DiscoverClient } from "./discover-client";

export const metadata: Metadata = { title: "探索作品" };

export default function DiscoverPage() {
  return <DiscoverClient />;
}
