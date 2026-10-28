import AuditPage from "@/apps/kyc/screens/AuditPage";

type Search = { actor?: string; case?: string; action?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  return <AuditPage searchParams={await searchParams} />;
}
