// 塊の JSON を読み、本文を数値（vector）にして Supabase の document_chunks に保存する。
// 使い方: node --env-file=.env scripts/embed-and-store.mjs output/case3-doc2-expense-manual.chunks.json
// 同じファイル名と塊の番号がすでにあれば上書きする。
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// テーブルの次元（1536）と合わせる
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("塊の JSON のパスを指定してください。例: node --env-file=.env scripts/embed-and-store.mjs output/case3-doc2-expense-manual.chunks.json");
    process.exit(1);
  }
  for (const name of ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[name]) {
      console.error(`.env に ${name} がありません`);
      process.exit(1);
    }
  }

  const chunks = JSON.parse(await readFile(jsonPath, "utf8"));
  const openai = new OpenAI();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks.map((c) => c.content),
  });
  const rows = chunks.map((c, i) => {
    const embedding = res.data[i].embedding;
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`数値の次元が ${embedding.length} です（${EMBEDDING_DIMENSIONS} のはず）`);
    }
    return {
      file_name: c.file_name,
      page: c.page,
      pages: c.pages,
      chunk_index: c.chunk_index,
      tokens: c.tokens,
      content: c.content,
      embedding,
    };
  });

  const { error } = await supabase.from("document_chunks").upsert(rows, { onConflict: "file_name,chunk_index" });
  if (error) throw error;

  // 保存できたかを、テーブルから読み直して確かめる（数値の中身は出さない）
  const fileName = chunks[0]?.file_name;
  const { data, error: readError } = await supabase
    .from("document_chunks")
    .select("file_name, page, pages, chunk_index, tokens, content")
    .eq("file_name", fileName)
    .order("chunk_index");
  if (readError) throw readError;

  console.log(`保存しました: ${data.length} 件（${fileName}）`);
  for (const r of data) {
    console.log(`[#${r.chunk_index}] p.${r.pages.join("-")} / ${r.tokens} トークン / ${r.content.replace(/\n/g, " ").slice(0, 40)}…`);
  }
  console.log(`数値の次元: ${EMBEDDING_DIMENSIONS}（${EMBEDDING_MODEL}）`);
}

main().catch((err) => {
  console.error("保存に失敗しました:", err.message ?? err);
  process.exit(1);
});
