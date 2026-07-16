"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MemberPerformanceSelector({
  month,
  members,
  selected,
}: {
  month: string;
  members: Array<{ memberName: string; eventCount: number }>;
  selected: string[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(selected);
  const allSelected = members.length > 0 && chosen.length === members.length;
  function toggle(name: string) {
    setChosen((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );
  }
  function apply() {
    const params = new URLSearchParams({ month });
    for (const member of chosen) params.append("member", member);
    router.push(`/admin/member-performance?${params.toString()}`);
  }
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Chọn thành viên để phân tích</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setChosen(allSelected ? [] : members.map((row) => row.memberName))
            }
          />
          Chọn tất cả
        </label>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {members.map((member) => (
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm" key={member.memberName}>
            <input
              type="checkbox"
              checked={chosen.includes(member.memberName)}
              onChange={() => toggle(member.memberName)}
            />
            <span>{member.memberName}</span>
            <span className="ml-auto text-xs text-slate-500">{member.eventCount} event</span>
          </label>
        ))}
      </div>
      <button
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
        disabled={!chosen.length}
        onClick={apply}
      >
        Xem {chosen.length === members.length ? "tổng quan team" : chosen.length > 1 ? `so sánh ${chosen.length} thành viên` : "chi tiết thành viên"}
      </button>
    </section>
  );
}
