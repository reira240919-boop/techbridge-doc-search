-- 質問の数値に意味が近い塊を、近い順に返す（similarity は 1 に近いほど近い）
create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 5
)
returns table (
  id bigint,
  file_name text,
  page integer,
  pages integer[],
  chunk_index integer,
  content text,
  similarity double precision
)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.file_name, c.page, c.pages, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 呼べるのはサーバー用の鍵だけにする
revoke execute on function public.match_document_chunks(extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_document_chunks(extensions.vector, integer) to service_role;
