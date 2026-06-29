import { redirect } from "next/navigation";

export default function AdminMemberDetailRedirect({ params }: { params: { memberName: string } }) {
  redirect(`/member-insights?member=${encodeURIComponent(params.memberName)}`);
}
