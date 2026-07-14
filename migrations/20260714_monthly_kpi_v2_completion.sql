-- Monthly KPI v2 completion. Additive, idempotent, staging/shadow only.
-- Apply after 20260714_monthly_kpi_engine_v2.sql.
begin;

create table if not exists public.monthly_member_month_targets (
  id bigserial primary key,
  month_key date not null,
  member_id uuid references public.members(id),
  member_name text not null,
  member_email text,
  target_units numeric(10,2) not null,
  base_target_units numeric(10,2) not null,
  active_workday_ratio numeric(6,5) not null default 1,
  target_adjustment_reason text,
  target_version text not null default 'member_target_v2',
  is_locked boolean not null default false,
  locked_at timestamptz,
  locked_by text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_member_month_targets_key unique(month_key,member_name),
  constraint monthly_member_month_targets_values_check check(
    target_units>=0 and base_target_units>=0 and active_workday_ratio between 0 and 1
  ),
  constraint monthly_member_month_targets_proration_reason_check check(
    active_workday_ratio=1 or nullif(trim(target_adjustment_reason),'') is not null
  )
);
create index if not exists monthly_member_month_targets_member_month_idx
  on public.monthly_member_month_targets(member_name,month_key desc);

alter table public.monthly_member_kpi_targets
  add column if not exists member_month_target_id bigint references public.monthly_member_month_targets(id),
  add column if not exists allocation_units numeric(10,2),
  add column if not exists allocation_reason text;
update public.monthly_member_kpi_targets set allocation_units=target_units
where allocation_units is null;

create or replace function public.allocation_total_matches_target(target_id bigint)
returns boolean language sql stable as $$
  select not exists(select 1 from public.monthly_member_kpi_targets where member_month_target_id=target_id)
    or abs(
      coalesce((select sum(coalesce(allocation_units,target_units)) from public.monthly_member_kpi_targets where member_month_target_id=target_id),0)
      - coalesce((select target_units from public.monthly_member_month_targets where id=target_id),0)
    ) < 0.005
$$;

alter table public.performance_event_evaluations
  add column if not exists work_month date,
  add column if not exists measurement_month date,
  add column if not exists data_cutoff date,
  add column if not exists availability_reason text,
  add column if not exists error_category text,
  add column if not exists rule_snapshot jsonb not null default '{}'::jsonb;
create unique index if not exists performance_event_measurement_rule_key
  on public.performance_event_evaluations(work_event_id,measurement_month,rule_version)
  where measurement_month is not null;
create index if not exists performance_event_measurement_member_idx
  on public.performance_event_evaluations(measurement_month,status,work_event_id);

alter table public.performance_project_member_month_results
  add column if not exists mature_event_units numeric(12,2) not null default 0,
  add column if not exists candidate_event_units numeric(12,2) not null default 0,
  add column if not exists availability_reason text,
  add column if not exists error_category text,
  add column if not exists acknowledged_by text,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement_reason text;
create index if not exists performance_project_member_measurement_idx
  on public.performance_project_member_month_results(member_name,month_key,project);

alter table public.url_work_quality_reviews
  add column if not exists exclusion_reason text,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;

alter table public.url_work_events
  add column if not exists approval_reason text;

alter table public.project_kpi_settings
  add column if not exists gsc_delay_days integer not null default 3,
  add column if not exists stable_min_eligible_events integer not null default 3,
  add column if not exists stable_min_total_impressions integer not null default 300;

create table if not exists public.monthly_kpi_workflow_states (
  id bigserial primary key,
  month_key date not null,
  member_name text not null,
  state text not null default 'draft',
  state_version integer not null default 1,
  prerequisites jsonb not null default '{}'::jsonb,
  last_run_id text,
  locked_result_id bigint references public.monthly_member_kpi_results(id),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_kpi_workflow_states_key unique(month_key,member_name),
  constraint monthly_kpi_workflow_states_state_check check(state in (
    'draft','source_reconciled','events_persisted','targets_ready','quality_in_review',
    'performance_ready_or_acknowledged','calculated','approved','locked'
  ))
);

create table if not exists public.monthly_kpi_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  month_key date not null,
  member_name text,
  step text not null,
  status text not null default 'running',
  actor text not null,
  rule_version text,
  diagnostics jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint monthly_kpi_calculation_runs_status_check check(status in ('running','completed','partial','failed')),
  constraint monthly_kpi_calculation_runs_step_check check(step in ('sync','target','review','performance','calculate','finalize','reopen'))
);
create index if not exists monthly_kpi_calculation_runs_month_idx
  on public.monthly_kpi_calculation_runs(month_key,member_name,started_at desc);

create table if not exists public.monthly_kpi_idempotency_keys (
  id bigserial primary key,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'running',
  response_status integer,
  response_payload jsonb,
  run_id uuid references public.monthly_kpi_calculation_runs(id),
  expires_at timestamptz not null default now()+interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_kpi_idempotency_keys_key unique(scope,idempotency_key),
  constraint monthly_kpi_idempotency_keys_status_check check(status in ('running','completed','failed'))
);

create table if not exists public.monthly_kpi_shadow_differences (
  id bigserial primary key,
  month_key date not null,
  member_name text not null,
  component_key text not null,
  source_url text,
  work_event_id bigint references public.url_work_events(id),
  rule_version text,
  sheet_value numeric,
  v2_value numeric,
  delta numeric,
  explanation_category text,
  explanation text,
  is_explained boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_kpi_shadow_differences_explanation_check check(
    is_explained=false or (nullif(trim(explanation_category),'') is not null and nullif(trim(explanation),'') is not null)
  )
);
create index if not exists monthly_kpi_shadow_differences_review_idx
  on public.monthly_kpi_shadow_differences(month_key,member_name,is_explained,component_key);

create table if not exists public.monthly_kpi_shadow_approvals (
  id bigserial primary key,
  month_key date not null,
  member_name text,
  approval_role text not null,
  status text not null default 'pending',
  approver text,
  note text,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_kpi_shadow_approvals_key unique(month_key,member_name,approval_role),
  constraint monthly_kpi_shadow_approvals_role_check check(approval_role in ('pm','finance')),
  constraint monthly_kpi_shadow_approvals_status_check check(status in ('pending','approved','rejected'))
);
create unique index if not exists monthly_kpi_shadow_approvals_scope_key
  on public.monthly_kpi_shadow_approvals(month_key,coalesce(member_name,''),approval_role);

alter table public.monthly_member_kpi_results
  add column if not exists calculation_run_id uuid references public.monthly_kpi_calculation_runs(id),
  add column if not exists workflow_state text,
  add column if not exists shadow_only boolean not null default true;

insert into public.kpi_quality_rubric_versions(rubric_id,version,status,total_weight_pct,effective_from,approved_by,approved_at)
select id,'quality_new_content_v3','approved',100,'2026-07-01','migration',now()
from public.kpi_quality_rubrics where rubric_key='new_content'
on conflict do nothing;

with criteria(criterion_key,criterion_name,weight_pct,display_order,allows_na) as (values
 ('intent_audience_pain','Search intent, audience/persona, pain point',15,10,false),
 ('outline_structure','Outline, hierarchy, structure',10,20,false),
 ('usefulness_semantics','Usefulness, completeness, semantic coverage',25,30,false),
 ('accuracy_eeat','Accuracy, E-E-A-T, trustworthy sourcing',15,40,false),
 ('metadata_onpage','Metadata, on-page/entity optimization',10,50,false),
 ('links','Internal/external links',10,60,true),
 ('ux_media_accessibility','UX, media, accessibility',10,70,true),
 ('faq_answerability','FAQs / answerability when appropriate to intent',5,80,true)
)
insert into public.kpi_quality_criteria(project,criterion_key,criterion_name,review_level,weight_pct,display_order,is_active,
  description,rubric_version_id,work_type,allows_na,score_anchor_json)
select null,c.criterion_key,c.criterion_name,'url',c.weight_pct,c.display_order,true,c.criterion_name,v.id,'new_content',c.allows_na,
  '{"0":"Missing","1":"Poor","2":"Weak","3":"Acceptable","4":"Meets","5":"Excellent"}'::jsonb
from criteria c
join public.kpi_quality_rubrics r on r.rubric_key='new_content'
join public.kpi_quality_rubric_versions v on v.rubric_id=r.id and v.version='quality_new_content_v3'
on conflict do nothing;

commit;
