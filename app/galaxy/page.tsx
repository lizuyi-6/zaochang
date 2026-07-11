import type { Metadata } from "next";
import { GalaxyExperience } from "./galaxy-experience";

export const metadata: Metadata = {
  title: "ASTRA 宇宙记忆",
  description: "在起源、共同想象与未来余响之间，凝视一座会呼吸的自洽星系。",
};

export default function GalaxyPage() {
  return <GalaxyExperience />;
}
