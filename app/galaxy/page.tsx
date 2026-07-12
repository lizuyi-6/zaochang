import type { Metadata } from "next";
import { GalaxyExperience } from "./galaxy-experience";

export const metadata: Metadata = {
  title: "造场产品银河",
  description: "探索造场的产品赛道、真实产品与开放孵化生态，让下一颗行星从一个产品信号开始。",
};

export default function GalaxyPage() {
  return <GalaxyExperience />;
}
