import type { Metadata } from "next";
import { CirclesClient } from "./circles-client";

export const metadata: Metadata = { title: "社区圈子" };

export default function CirclesPage() {
  return <CirclesClient />;
}
