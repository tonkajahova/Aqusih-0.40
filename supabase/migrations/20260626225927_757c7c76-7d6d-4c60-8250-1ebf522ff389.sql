-- RLS policies that reference has_role require the calling role to hold EXECUTE.
-- Re-grant to authenticated (needed by policies); keep anon revoked.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;