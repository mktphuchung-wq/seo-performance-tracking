import { redirect } from "next/navigation";export default async function LegacyMember(props:{params: Promise<{memberName:string}>}) {
  const params = await props.params;
  redirect(`/admin/member-performance?member=${encodeURIComponent(params.memberName)}`);
}
