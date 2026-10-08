-- The owner check only reads the caller's own ohf_owners row, which RLS already
-- allows, so it does not need definer rights.
alter function public.ohf_is_owner() security invoker;
