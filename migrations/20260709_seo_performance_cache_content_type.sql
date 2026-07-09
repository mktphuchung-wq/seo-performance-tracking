alter table public.seo_performance_cache
  add column if not exists content_type text;

create index if not exists idx_seo_cache_content_type
on public.seo_performance_cache (content_type);

create index if not exists idx_seo_cache_range_type
on public.seo_performance_cache (range_key, content_type);

create index if not exists idx_seo_cache_member_type
on public.seo_performance_cache (member_name, content_type);
