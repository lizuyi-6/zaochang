import type { Metadata } from "next";
import { GalaxyExperience } from "./galaxy-experience";

export const metadata: Metadata = {
  title: "ASTRA 宇宙记忆",
  description: "在微光、漂流与回声之间，凝视一座会呼吸的实时星空。",
};

export default function GalaxyPage() {
  return <GalaxyExperience />;
}
