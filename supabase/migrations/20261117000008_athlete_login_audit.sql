-- =====================================================================
-- Migration 8: athletes may record their own sign-in / sign-out in the
-- audit log (nothing else). Staff behaviour is unchanged.
-- =====================================================================
create or replace function public.log_event(p_action text, p_record_type text, p_record_id text default null, p_details jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_staff() or (public.current_player_id() is not null and p_action in ('LOGIN','LOGOUT'))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_action not in ('LOGIN','LOGOUT','EXPORT_CSV','EXPORT_PDF','BACKUP_EXPORT','VIEW_DOCUMENT','PRINT') then
    raise exception 'Unsupported audit action %', p_action;
  end if;
  insert into public.audit_logs (user_id, action, record_type, record_id, new_values)
  values (auth.uid(), p_action, left(p_record_type, 80), left(p_record_id, 120), p_details);
end $$;
