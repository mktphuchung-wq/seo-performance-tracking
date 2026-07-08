alter table public.content_urls
  add column if not exists content_worked_at date;

create index if not exists idx_content_urls_content_worked_at
on public.content_urls (content_worked_at);

create index if not exists idx_content_urls_active_worked_at
on public.content_urls (is_active, content_worked_at);

create index if not exists idx_content_urls_project_worked_at
on public.content_urls (project, content_worked_at);

create index if not exists idx_content_urls_member_worked_at
on public.content_urls (member_name, content_worked_at);
