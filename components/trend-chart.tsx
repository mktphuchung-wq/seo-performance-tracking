"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyMetric } from "../lib/google";

export function TrendChart({ data }: { data: DailyMetric[] }) {
  return <div className="h-72 rounded-xl border bg-white p-4">{data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="clicks" stroke="#2563eb" /><Line type="monotone" dataKey="impressions" stroke="#16a34a" /></LineChart></ResponsiveContainer> : <p className="text-slate-500">No daily data found.</p>}</div>;
}
