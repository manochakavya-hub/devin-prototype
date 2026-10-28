import DetailPage from "@/apps/flags/screens/DetailPage";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <DetailPage flagKey={key} />;
}
