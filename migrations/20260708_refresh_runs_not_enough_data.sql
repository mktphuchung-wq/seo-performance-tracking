alter table public.refresh_runs drop constraint if exists refresh_runs_status_check;
alter table public.refresh_runs add constraint refresh_runs_status_check check (status in ('running', 'success', 'failed', 'not_enough_data'));
