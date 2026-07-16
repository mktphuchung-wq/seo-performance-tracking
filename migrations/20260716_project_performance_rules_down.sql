-- Guarded rollback for the final Preview contract.
begin;
do $$ begin
  if exists(select 1 from public.project_gsc_verifications)
     or exists(select 1 from public.project_performance_rule_versions) then
    raise exception 'Refusing rollback: GSC verification or rule-version audit data exists';
  end if;
end $$;

alter table public.performance_range_results drop column if exists effective_horizon;
alter table public.performance_event_evaluations
  drop column if exists readiness_reason,
  drop column if exists fallback_level,
  drop column if exists effective_window_days;
drop table if exists public.project_performance_rule_versions;
alter table public.url_work_events
  drop column if exists performance_readiness_issues,
  drop column if exists performance_readiness_state,
  drop column if exists performance_kpi_eligible,
  drop column if exists content_kpi_eligible;
alter table public.content_urls
  drop column if exists classification_run_id,
  drop column if exists classified_at,
  drop column if exists gsc_eligibility_reason,
  drop column if exists registrable_domain;
alter table public.project_settings_versions
  drop column if exists include_subdomains,
  drop column if exists gsc_verification_id;
alter table public.projects drop constraint if exists projects_gsc_verification_id_fkey;
alter table public.projects
  drop column if exists include_subdomains,
  drop column if exists gsc_verification_id,
  drop column if exists gsc_verified_by,
  drop column if exists gsc_verified_at,
  drop column if exists gsc_permission_level,
  drop column if exists gsc_access_status;
drop table if exists public.project_gsc_verifications;
commit;
