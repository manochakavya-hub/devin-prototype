import HomePage from "@/apps/home/HomePage";

export default async function Page({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  return <HomePage denied={(await searchParams).denied} />;
}
