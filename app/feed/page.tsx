import type { Metadata } from "next";
import { FeedClient } from "./feed-client";

export const metadata: Metadata = { title: "创作者动态" };

export default function FeedPage() {
  return <FeedClient />;
}
