import { ProgrammeSectionPage } from "../programme-section-page";

export default async function RewardsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  return <ProgrammeSectionPage mode="rewards" searchParams={searchParams} />;
}
