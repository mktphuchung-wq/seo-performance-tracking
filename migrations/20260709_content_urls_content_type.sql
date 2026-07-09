alter table public.content_urls
  add column if not exists content_type text;

create index if not exists idx_content_urls_content_type
on public.content_urls (content_type);

create index if not exists idx_content_urls_project_type
on public.content_urls (project, content_type);

create index if not exists idx_content_urls_member_type
on public.content_urls (member_name, content_type);

create index if not exists idx_content_urls_active_type
on public.content_urls (is_active, content_type);
