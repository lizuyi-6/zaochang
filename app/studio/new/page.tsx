import type { Metadata } from "next";
import { CreateProductFlow } from "./create-product-flow";

export const metadata: Metadata = { title: "发布新作品" };

export default function NewProductPage() {
  return <CreateProductFlow />;
}
