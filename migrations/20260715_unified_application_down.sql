-- Guarded rollback for the unified application migration.
-- Operational rollback should prefer disabling unified writes and retaining audit data.
begin;
do $$
begin
  if exists(select 1 from public.project_settings_versions)
    or exists(select 1 from public.member_project_contribution_weights)
    or exists(select 1 from public.performance_range_results)
    or exists(select 1 from public.kpi_templates)
    or exists(select 1 from public.application_audit_log) then
    raise exception 'Unified application data exists; disable writes and keep audit data instead of dropping schema.';
  end if;
end $$;

drop table if exists public.kpi_template_components;
drop table if exists public.kpi_templates;
drop table if exists public.performance_range_results;
drop table if exists public.member_project_contribution_weights;
drop table if exists public.project_settings_versions;
drop table if exists public.project_domain_mappings;
drop table if exists public.application_audit_log;

alter table public.monthly_member_kpi_component_scores
  drop column if exists evidence,
  drop column if exists na_reason,
  drop column if exists is_not_applicable;
alter table public.work_sync_runs
  drop column if exists approval_reason,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists accepted_row_count,
  drop column if exists workflow_stage;
alter table public.url_work_events
  drop column if exists readiness_issues,
  drop column if exists kpi_ready;
alter table public.content_urls
  drop column if exists gsc_ready,
  drop column if exists classification_version,
  drop column if exists classification_issues,
  drop column if exists classification_status,
  drop column if exists normalized_domain,
  drop column if exists project_id;
alter table public.projects
  drop column if exists kpi_ready,
  drop column if exists gsc_ready,
  drop column if exists gsc_property,
  drop column if exists lifecycle,
  drop column if exists canonical_domain;
commit;
