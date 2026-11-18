-- =====================================================================
-- Migration 11: playing position becomes optional.
-- Players can be registered from a roster list that has no positions;
-- the position (still limited to the allowed values) is completed later.
-- =====================================================================
alter table public.players alter column position drop not null;
