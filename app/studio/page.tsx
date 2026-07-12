import type { Metadata } from "next";
import { StudioClient } from "./studio-client";

export const metadata: Metadata = { title: "创作台" };

export default function StudioPage() {
  return <StudioClient />;
}
