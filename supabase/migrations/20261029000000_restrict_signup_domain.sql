-- 社内メール（@techbridge.co.jp）だけ登録できるようにする Auth Hook（before user created）
create or replace function public.hook_restrict_signup_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text := lower(coalesce(event->'user'->>'email', ''));
begin
  if email ~ '^[^@]+@techbridge\.co\.jp$' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', '社内のメールアドレス（@techbridge.co.jp）だけ登録できます。'
    )
  );
end;
$$;

-- 呼べるのは Supabase Auth だけにする
grant execute on function public.hook_restrict_signup_domain(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_domain(jsonb) from authenticated, anon, public;
