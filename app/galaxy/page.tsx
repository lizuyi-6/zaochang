import type { Metadata } from "next";
import { GalaxyExperience } from "./galaxy-experience";

export const metadata: Metadata = {
  title: "ASTRA 星图实验",
  description: "一座可巡航、可触碰的实时银河系。",
};

export default function GalaxyPage() {
  return <GalaxyExperience />;
}
