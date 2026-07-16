-- Additive Preview remediation: promote an unambiguous legacy member email into
-- the canonical identity table. Conflicting source emails are intentionally left
-- null for manual resolution.
with source_member_emails as (
  select
    trim(member_name) as canonical_name,
    min(lower(trim(member_email))) as email
  from public.content_urls
  where nullif(trim(member_name), '') is not null
    and nullif(trim(member_email), '') is not null
  group by trim(member_name)
  having count(distinct lower(trim(member_email))) = 1
)
update public.members m
set email = s.email,
    updated_at = now()
from source_member_emails s
where m.canonical_name = s.canonical_name
  and m.email is null
  and not exists (
    select 1 from public.members existing
    where lower(existing.email) = s.email
      and existing.id <> m.id
  );
