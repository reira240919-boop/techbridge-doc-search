-- 質問と答えのやり取りの記録。1行 = 1回の質問
-- 記録として残すだけで、前のやり取りを答えに使うことはしない
create table public.conversations (
  id bigint generated always as identity primary key,
  question text not null,                    -- 質問
  answer text not null,                      -- 画面に出した答え
  found boolean not null,                    -- 文書に答えがあったか
  sources jsonb not null default '[]',       -- 出典 [{ file_name, pages }]
  created_at timestamptz not null default now()
);

-- ルールを付けないまま鍵をかける。読み書きできるのはサーバー用の鍵だけ
alter table public.conversations enable row level security;
