
-- Fix login loop: ensure the attendant user has an assigned role
INSERT INTO public.user_roles (user_id, role)
SELECT '081aaa4b-386e-426a-8383-cd5334eef380', 'atendente'::public.app_role
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '081aaa4b-386e-426a-8383-cd5334eef380')
ON CONFLICT (user_id, role) DO NOTHING;
