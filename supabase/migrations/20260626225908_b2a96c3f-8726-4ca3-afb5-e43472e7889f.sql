-- 1. orders: lock to authenticated checkout only (no guest checkout intended).
--    Make user_id NOT NULL so the policy intent is explicit and inserts can't silently fail.
DELETE FROM public.orders WHERE user_id IS NULL;
ALTER TABLE public.orders ALTER COLUMN user_id SET NOT NULL;

-- 2. user_roles: explicitly block all client writes. Only service_role may insert/update/delete.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon, PUBLIC;

CREATE POLICY "No client inserts on user_roles"
  ON public.user_roles FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "No client updates on user_roles"
  ON public.user_roles FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on user_roles"
  ON public.user_roles FOR DELETE TO authenticated, anon
  USING (false);

-- 3. has_role: SECURITY DEFINER function should not be directly callable by clients.
--    RLS policies that reference it still work because policy evaluation runs with the
--    table owner's privileges, not the calling role's EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;