import { ProgrammeSectionPage } from "../programme-section-page";

export default async function VipTiersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  return <ProgrammeSectionPage mode="tiers" searchParams={searchParams} />;
}
