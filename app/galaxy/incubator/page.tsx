import type { Metadata } from "next";
import { EcosystemShell } from "../ecosystem-shell";
import { IncubationConsole } from "./incubation-console";

export const metadata: Metadata = {
  title: "项目孵化控制台 | 造场产品银河",
  description: "查看项目阶段、当前任务、下一步、负责人和评估反馈。",
};

export default function GalaxyIncubatorPage() {
  return <EcosystemShell><IncubationConsole /></EcosystemShell>;
}
