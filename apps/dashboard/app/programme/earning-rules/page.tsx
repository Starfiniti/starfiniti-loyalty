import { ProgrammeSectionPage } from "../programme-section-page";

export default async function EarningRulesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  return <ProgrammeSectionPage mode="earning" searchParams={searchParams} />;
}
