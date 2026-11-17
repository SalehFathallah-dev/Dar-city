-- =====================================================================
-- Migration 6: athlete role (separate file – a new enum value must be
-- committed before it can be used by the next migration).
-- =====================================================================
alter type public.app_role add value if not exists 'athlete';
