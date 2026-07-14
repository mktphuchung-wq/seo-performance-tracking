-- Safe rollback helper for an unused staging installation only.
-- This intentionally refuses to remove v2 structures after KPI business rows exist.
begin;
do $$
begin
  if exists(select 1 from public.monthly_member_kpi_results limit 1)
     or exists(select 1 from public.work_source_rows limit 1)
     or exists(select 1 from public.gsc_url_daily_metrics limit 1) then
    raise exception 'Refusing rollback: KPI v2 contains business or audit data. Disable the feature flag instead.';
  end if;
end $$;
drop trigger if exists monthly_member_kpi_results_locked_guard on public.monthly_member_kpi_results;
drop function if exists public.prevent_locked_kpi_mutation();
drop table if exists public.kpi_override_audit_log;
drop table if exists public.quality_review_calibrations;
drop table if exists public.monthly_member_kpi_results;
drop table if exists public.monthly_member_kpi_component_scores;
drop table if exists public.monthly_kpi_component_definitions;
drop table if exists public.monthly_member_project_kpi_results;
drop table if exists public.performance_project_member_month_results;
drop table if exists public.performance_event_evaluations;
drop table if exists public.performance_evaluation_cohorts;
drop table if exists public.gsc_url_daily_metrics;
drop table if exists public.gsc_fetch_runs;
drop table if exists public.kpi_quality_rubric_versions;
drop table if exists public.kpi_quality_rubrics;
drop table if exists public.content_url_aliases;
drop table if exists public.work_source_rows;
drop table if exists public.work_sync_runs;
drop table if exists public.member_aliases;
drop table if exists public.members;
drop table if exists public.project_aliases;
drop table if exists public.projects;
commit;
