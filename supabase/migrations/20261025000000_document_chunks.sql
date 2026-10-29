-- 文章を数値（vector）で検索できるようにする
create extension if not exists vector with schema extensions;

-- PDF を区切った塊。1行 = 1つの塊
create table public.document_chunks (
  id bigint generated always as identity primary key,
  file_name text not null,                       -- ファイル名
  page integer not null,                         -- 最初のページ
  pages integer[] not null,                      -- 塊がまたいだページ（出典はこれを全部出す）
  chunk_index integer not null,                  -- そのファイルの中での塊の番号
  tokens integer not null,                       -- 本文のトークン数（cl100k_base）
  content text not null,                         -- 本文
  embedding extensions.vector(1536) not null,    -- text-embedding-3-small の数値
  created_at timestamptz not null default now(),
  unique (file_name, chunk_index)
);

-- ルールを付けないまま鍵をかける。読み書きできるのはサーバー用の鍵だけ
alter table public.document_chunks enable row level security;
