-- Versioned Rule Registry metadata. Additive and idempotent.
-- Apply on an isolated Preview branch before enabling Rule Registry writes.
begin;

alter table public.kpi_work_unit_rules
  add column if not exists status text not null default 'approved',
  add column if not exists reason text not null default 'Imported legacy rule',
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz;
alter table public.kpi_work_unit_rules drop constraint if exists kpi_work_unit_rules_status_check;
alter table public.kpi_work_unit_rules add constraint kpi_work_unit_rules_status_check
  check(status in ('draft','approved','retired'));
create index if not exists kpi_work_unit_rules_effective_registry_idx
  on public.kpi_work_unit_rules(valid_from desc,rule_version,status);

alter table public.kpi_quality_rubric_versions
  add column if not exists effective_to date,
  add column if not exists reason text not null default 'Imported legacy rubric',
  add column if not exists created_by text;
alter table public.kpi_quality_rubric_versions drop constraint if exists kpi_quality_rubric_versions_dates_check;
alter table public.kpi_quality_rubric_versions add constraint kpi_quality_rubric_versions_dates_check
  check(effective_to is null or effective_from is null or effective_to>=effective_from);
create index if not exists kpi_quality_rubric_versions_effective_registry_idx
  on public.kpi_quality_rubric_versions(effective_from desc,status,rubric_id);

commit;
