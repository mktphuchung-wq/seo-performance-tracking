import { redirect } from "next/navigation";

export default function AdminUrlsRedirect({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => qs.append(key, item));
    else if (value) qs.set(key, value);
  });
  redirect(`/url-data-source${qs.toString() ? `?${qs.toString()}` : ""}`);
}
