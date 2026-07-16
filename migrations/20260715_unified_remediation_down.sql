-- Staging-only rollback. Refuses teardown after remediation business data exists.
begin;
do $$
begin
  if exists(select 1 from public.monthly_member_targets)
    or exists(select 1 from public.monthly_member_kpi_configs)
    or exists(select 1 from public.url_work_events where source_lineage<>'[]'::jsonb)
  then raise exception 'Remediation data exists; disable UNIFIED_APP_ENABLED instead of deleting audit history.';
  end if;
end $$;
drop trigger if exists monthly_member_kpi_configs_locked_guard on public.monthly_member_kpi_configs;
drop function if exists public.prevent_locked_member_kpi_config_mutation();
drop table if exists public.monthly_member_kpi_config_components;
drop table if exists public.monthly_member_kpi_configs;
drop table if exists public.monthly_member_targets;
drop index if exists public.url_work_events_canonical_identity_key;
drop index if exists public.content_urls_project_url_identity_key;
alter table public.url_work_events drop column if exists source_missing_at,drop column if exists unified_source_state,drop column if exists source_lineage;
alter table public.content_urls drop column if exists unified_source_state;
drop index if exists public.work_sync_runs_idempotency_key;
alter table public.work_sync_runs drop column if exists idempotency_key,drop column if exists committed_from_run_id,
  drop column if exists needs_attention_count,drop column if exists updated_event_count,drop column if exists new_event_count,
  drop column if exists canonical_url_count,drop column if exists valid_work_record_count;
commit;
