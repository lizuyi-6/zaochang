export function hostedUrlSelect(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error("invalid_sql_alias");
  return `(SELECT live_url FROM product_hosted_urls WHERE product_id = ${alias}.id) AS hostedUrl`;
}
