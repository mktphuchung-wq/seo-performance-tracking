import { redirect } from "next/navigation";export default async function LegacyKpiMonthDetail(props:{params: Promise<{month:string}>}) {
  const params = await props.params;
  redirect(`/admin/kpi-close?month=${params.month}`);
}
