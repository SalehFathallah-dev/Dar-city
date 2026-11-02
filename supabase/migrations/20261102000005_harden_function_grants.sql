-- =====================================================================
-- Migration 5: Function grants hardening (Supabase security advisor)
-- Trigger functions are not callable through the API; helper/RPC functions
-- are callable only by signed-in users (they also check roles internally).
-- =====================================================================
revoke execute on function
  public.assign_player_code(), public.check_season_club(), public.clubs_before_write(), public.set_club_from_parent(),
  public.prevent_club_change(), public.audit_row_change(), public.exam_record_clearance(), public.guard_profile_changes(),
  public.handle_new_user(), public.medical_history_versioning(), public.rtp_set_return_date(), public.set_updated_fields(),
  public.players_before_write(), public.check_injury_player_match(), public.check_document_links(),
  public.rehab_phase_change(), public.injury_status_dates()
  from public, anon, authenticated;
revoke execute on function
  public.has_club_access(uuid), public.has_club_access_now(uuid), public.storage_player_access(text),
  public.storage_club_access(text), public.get_team_availability(uuid), public.log_event(text, text, text, jsonb)
  from public, anon;
grant execute on function
  public.has_club_access(uuid), public.has_club_access_now(uuid), public.storage_player_access(text),
  public.storage_club_access(text), public.get_team_availability(uuid), public.log_event(text, text, text, jsonb)
  to authenticated;
