-- =====================================================================
-- Migration 9: when a player record is deleted, its athlete account is
-- disabled (instead of blocking the delete).
-- =====================================================================
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.player_id is distinct from old.player_id) then
    if not public.can_manage_users() then
      raise exception 'Only the physician or an administrator can change roles or account status' using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception 'You cannot change your own role or account status' using errcode = '42501';
    end if;
    if new.role = 'super_admin' and not public.is_admin() then
      raise exception 'Only a Super Administrator can create administrators' using errcode = '42501';
    end if;
  end if;
  if new.role = 'athlete' and new.player_id is null and new.is_active then
    if old.player_id is not null then
      new.is_active := false;  -- the linked player was removed: disable the account
    else
      raise exception 'An athlete account must be linked to a player' using errcode = '23514';
    end if;
  end if;
  if new.role is distinct from 'athlete' then
    new.player_id := null;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Email is managed by authentication and cannot be edited here' using errcode = '42501';
  end if;
  return new;
end $$;
