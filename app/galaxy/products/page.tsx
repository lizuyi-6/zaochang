import type { Metadata } from "next";
import { EcosystemShell } from "../ecosystem-shell";
import { ProductDirectory } from "./product-directory";

export const metadata: Metadata = {
  title: "全部产品 | 造场产品银河",
  description: "按产品赛道与阶段浏览造场的产品矩阵。",
};

export default function GalaxyProductsPage() {
  return <EcosystemShell><ProductDirectory /></EcosystemShell>;
}
