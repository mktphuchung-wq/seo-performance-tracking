import { redirect } from "next/navigation";

export default function DashboardUrlPage({ searchParams }: { searchParams?: { id?: string } }) {
  redirect(searchParams?.id ? `/url/${searchParams.id}` : "/dashboard");
}
