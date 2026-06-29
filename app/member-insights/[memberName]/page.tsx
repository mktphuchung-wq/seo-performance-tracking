import { redirect } from "next/navigation";

export default function MemberInsightLegacyRedirect({ params }: { params: { memberName: string } }) {
  redirect(`/member-insights?member=${encodeURIComponent(params.memberName)}`);
}
