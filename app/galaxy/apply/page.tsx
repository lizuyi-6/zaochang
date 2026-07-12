import type { Metadata } from "next";
import { EcosystemShell } from "../ecosystem-shell";
import { IncubationApplication } from "./incubation-application";

export const metadata: Metadata = {
  title: "申请加入造场 | 产品银河",
  description: "发射产品信号，让项目进入造场的评估与孵化轨道。",
};

export default function GalaxyApplyPage() {
  return <EcosystemShell><IncubationApplication /></EcosystemShell>;
}
