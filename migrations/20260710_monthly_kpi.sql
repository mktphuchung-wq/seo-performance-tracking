-- Phase 3: monthly KPI targets, work-unit rules, and quality review storage.
-- Phase 4+ will consume these tables; this migration does not change current
-- performance calculations or remove any Phase 1/2 compatibility objects.

begin;

create table if not exists public.monthly_member_kpi_targets (
  id bigserial primary key,
  month_key date not null,
  project text not null,
  member_name text not null,
  member_email text,
  target_units numeric(10,2) not null default 0,
  target_urls integer not null default 0,
  quantity_weight_pct numeric(5,2),
  quality_weight_pct numeric(5,2),
  performance_weight_pct numeric(5,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_member_kpi_targets_month_key_check
    check (month_key = date_trunc('month', month_key)::date),
  constraint monthly_member_kpi_targets_target_units_check
    check (target_units >= 0),
  constraint monthly_member_kpi_targets_target_urls_check
    check (target_urls >= 0),
  constraint monthly_member_kpi_targets_weights_check
    check (
      (quantity_weight_pct is null and quality_weight_pct is null and performance_weight_pct is null)
      or (
        quantity_weight_pct is not null
        and quality_weight_pct is not null
        and performance_weight_pct is not null
        and quantity_weight_pct between 0 and 100
        and quality_weight_pct between 0 and 100
        and performance_weight_pct between 0 and 100
        and quantity_weight_pct + quality_weight_pct + performance_weight_pct = 100
      )
    ),
  constraint monthly_member_kpi_targets_month_project_member_key
    unique (month_key, project, member_name)
);

create index if not exists monthly_member_kpi_targets_project_month_idx
  on public.monthly_member_kpi_targets (project, month_key);
create index if not exists monthly_member_kpi_targets_member_month_idx
  on public.monthly_member_kpi_targets (member_name, month_key);

-- Rule resolution order is member-specific, then project-specific, then global.
-- A member rule may optionally be restricted to one project.
create table if not exists public.kpi_work_unit_rules (
  id bigserial primary key,
  project text,
  member_name text,
  work_type text not null,
  difficulty text not null default 'normal',
  unit_value numeric(8,2) not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_work_unit_rules_work_type_check
    check (work_type in ('new_content', 'audit', 'update', 'portfolio')),
  constraint kpi_work_unit_rules_difficulty_check
    check (nullif(trim(difficulty), '') is not null),
  constraint kpi_work_unit_rules_unit_value_check
    check (unit_value >= 0)
);

create unique index if not exists kpi_work_unit_rules_scope_key
  on public.kpi_work_unit_rules (
    coalesce(project, ''),
    coalesce(member_name, ''),
    work_type,
    difficulty
  );
create index if not exists kpi_work_unit_rules_resolution_idx
  on public.kpi_work_unit_rules (member_name, project, work_type, difficulty)
  where is_active = true;

create table if not exists public.kpi_quality_criteria (
  id bigserial primary key,
  project text,
  criterion_key text not null,
  criterion_name text not null,
  review_level text not null,
  weight_pct numeric(5,2) not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_quality_criteria_key_check
    check (criterion_key ~ '^[a-z][a-z0-9_]*$'),
  constraint kpi_quality_criteria_name_check
    check (nullif(trim(criterion_name), '') is not null),
  constraint kpi_quality_criteria_review_level_check
    check (review_level in ('url', 'member_month')),
  constraint kpi_quality_criteria_weight_check
    check (weight_pct > 0 and weight_pct <= 100),
  constraint kpi_quality_criteria_display_order_check
    check (display_order >= 0)
);

create unique index if not exists kpi_quality_criteria_scope_key
  on public.kpi_quality_criteria (
    coalesce(project, ''),
    review_level,
    criterion_key
  );
create index if not exists kpi_quality_criteria_active_level_idx
  on public.kpi_quality_criteria (review_level, project, display_order)
  where is_active = true;

create table if not exists public.url_work_quality_reviews (
  id bigserial primary key,
  work_event_id bigint not null references public.url_work_events(id) on delete cascade,
  review_status text not null default 'pending',
  quality_pct numeric(5,2),
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint url_work_quality_reviews_work_event_key unique (work_event_id),
  constraint url_work_quality_reviews_status_check
    check (review_status in ('pending', 'approved', 'excluded')),
  constraint url_work_quality_reviews_quality_pct_check
    check (quality_pct is null or quality_pct between 0 and 100),
  constraint url_work_quality_reviews_approval_check
    check (review_status <> 'approved' or reviewed_at is not null)
);

create index if not exists url_work_quality_reviews_status_idx
  on public.url_work_quality_reviews (review_status);
create index if not exists url_work_quality_reviews_reviewed_at_idx
  on public.url_work_quality_reviews (reviewed_at);

create table if not exists public.url_work_quality_scores (
  id bigserial primary key,
  review_id bigint not null references public.url_work_quality_reviews(id) on delete cascade,
  criterion_id bigint not null references public.kpi_quality_criteria(id),
  score smallint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint url_work_quality_scores_score_check check (score between 1 and 5),
  constraint url_work_quality_scores_review_criterion_key unique (review_id, criterion_id)
);

create index if not exists url_work_quality_scores_criterion_idx
  on public.url_work_quality_scores (criterion_id);

-- Frequency and collaboration are intentionally stored once per member/project/month,
-- rather than duplicated across URL reviews.
create table if not exists public.member_month_quality_reviews (
  id bigserial primary key,
  month_key date not null,
  project text not null,
  member_name text not null,
  member_email text,
  frequency_score smallint,
  collaboration_score smallint,
  review_status text not null default 'pending',
  quality_pct numeric(5,2),
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_month_quality_reviews_month_key_check
    check (month_key = date_trunc('month', month_key)::date),
  constraint member_month_quality_reviews_frequency_score_check
    check (frequency_score is null or frequency_score between 1 and 5),
  constraint member_month_quality_reviews_collaboration_score_check
    check (collaboration_score is null or collaboration_score between 1 and 5),
  constraint member_month_quality_reviews_status_check
    check (review_status in ('pending', 'approved', 'excluded')),
  constraint member_month_quality_reviews_quality_pct_check
    check (quality_pct is null or quality_pct between 0 and 100),
  constraint member_month_quality_reviews_approval_check
    check (review_status <> 'approved' or reviewed_at is not null),
  constraint member_month_quality_reviews_month_project_member_key
    unique (month_key, project, member_name)
);

create index if not exists member_month_quality_reviews_project_month_idx
  on public.member_month_quality_reviews (project, month_key);
create index if not exists member_month_quality_reviews_member_month_idx
  on public.member_month_quality_reviews (member_name, month_key);
create index if not exists member_month_quality_reviews_status_idx
  on public.member_month_quality_reviews (review_status, month_key);

-- Global unit defaults. More specific rules can be added without replacing them.
insert into public.kpi_work_unit_rules (project, member_name, work_type, difficulty, unit_value, notes)
values
  (null, null, 'new_content', 'normal', 1, 'Phase 3 global default'),
  (null, null, 'update', 'normal', 1, 'Phase 3 global default'),
  (null, null, 'audit', 'basic', 1, 'Phase 3 global default'),
  (null, null, 'audit', 'standard', 1.2, 'Phase 3 global default'),
  (null, null, 'audit', 'deep', 1.5, 'Phase 3 global default'),
  (null, null, 'portfolio', 'normal', 0, 'Phase 3 global default')
on conflict do nothing;

-- URL criteria total 100%; member-month criteria total 100% independently.
insert into public.kpi_quality_criteria (
  project, criterion_key, criterion_name, review_level, weight_pct, display_order, description
)
values
  (null, 'structure', 'Structure', 'url', 20, 10, 'Information architecture, headings, and content organization.'),
  (null, 'content', 'Content', 'url', 20, 20, 'Accuracy, usefulness, completeness, and search-intent fit.'),
  (null, 'metadata', 'Metadata', 'url', 20, 30, 'Title, description, and other relevant metadata.'),
  (null, 'image_video', 'Image / Video', 'url', 20, 40, 'Relevant media, optimization, and accessibility.'),
  (null, 'links', 'Links', 'url', 20, 50, 'Internal and external link quality.'),
  (null, 'frequency', 'Frequency', 'member_month', 50, 10, 'Consistency of delivery during the month.'),
  (null, 'collaboration', 'Collaboration', 'member_month', 50, 20, 'Collaboration and communication during the month.')
on conflict do nothing;

commit;
