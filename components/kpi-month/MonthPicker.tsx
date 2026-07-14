"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MonthPicker({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  return <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); if (/^\d{4}-\d{2}$/.test(month)) router.push(`/admin/kpi-month/${month}`); }}>
    <input aria-label="Tháng KPI" className="rounded-lg border px-3 py-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
    <button className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">Mở tháng</button>
  </form>;
}
