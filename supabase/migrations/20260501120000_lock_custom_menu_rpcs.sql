-- Restrict custom menu mutation RPCs to server-side edge functions.
-- The app now calls secure-custom-menu with an app session token; the edge
-- function uses the service role to execute these helpers after authorization.
REVOKE ALL ON FUNCTION public.apply_custom_menu(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_to_full_menu(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.save_custom_menu_dishes(uuid, uuid[], uuid[]) FROM anon, authenticated;

GRANT ALL ON FUNCTION public.apply_custom_menu(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.reset_to_full_menu(uuid) TO service_role;
GRANT ALL ON FUNCTION public.save_custom_menu_dishes(uuid, uuid[], uuid[]) TO service_role;
