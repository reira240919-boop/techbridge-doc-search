// 質問に、保存した文書の塊だけを使って答える（scripts/ask.mjs とチャット画面の両方で使う）。
// 質問を数値にする → 意味が近い塊を上位5件取る → Claude に答えさせる → 出典を付ける。
// 鍵を使うので、サーバー側だけで読み込むこと。
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// 保存したときと同じ数値化の方法（embed-and-store.mjs と合わせる）
const EMBEDDING_MODEL = "text-embedding-3-small";
const ANSWER_MODEL = "claude-sonnet-4-6";
const MATCH_COUNT = 5;
export const NOT_FOUND = "該当する情報が見つかりません";

const SYSTEM_PROMPT = `あなたは株式会社テックブリッジの社内文書について答える係です。
- 渡された【資料】に書いてある内容だけで、日本語で短く答えてください。
- 資料に書いていない判断、推測、一般常識での補足はしないでください。金額・日付・ページなどを作らないでください。
- 資料に答えがはっきり書いていなければ、found を false にしてください。
- 答えに使った資料の番号を sources に入れてください。使っていない資料は入れないでください。
- 答えの文の中には、ファイル名やページ番号を書かないでください（出典は別に付けます）。`;

const AnswerSchema = z.object({
  found: z.boolean(),
  answer: z.string(),
  sources: z.array(z.number().int()),
});

const REQUIRED_ENV = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

export const formatPages = (pages) =>
  pages.length > 1 ? `p.${pages[0]}〜${pages[pages.length - 1]}` : `p.${pages[0]}`;

export function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

export function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// 戻り値: { found, answer, sources: [{ file_name, pages }], matches }
export async function answerQuestion(question) {
  const openai = new OpenAI();
  const anthropic = new Anthropic();
  const supabase = supabaseAdmin();

  // 1. 質問を数値にする
  const emb = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: question });

  // 2. 意味が近い塊を上位5件取る
  const { data: matches, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: emb.data[0].embedding,
    match_count: MATCH_COUNT,
  });
  if (error) throw error;

  const notFound = { found: false, answer: NOT_FOUND, sources: [], matches };
  if (matches.length === 0) return notFound;

  // 3. その塊だけを渡して Claude に答えさせる
  const materials = matches
    .map((m, i) => `【資料${i + 1}】ファイル: ${m.file_name} / ページ: ${formatPages(m.pages)}\n${m.content}`)
    .join("\n\n");

  const response = await anthropic.messages.parse({
    model: ANSWER_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${materials}\n\n【質問】${question}` }],
    output_config: { format: zodOutputFormat(AnswerSchema) },
  });
  const result = response.parsed_output;

  // 4. 出典はこちらで付ける（Claude が返した資料の番号から、ファイル名とページを引く）
  const used = [...new Set((result?.sources ?? []).filter((n) => n >= 1 && n <= matches.length))].map(
    (n) => matches[n - 1],
  );
  if (!result || !result.found || used.length === 0) return notFound;

  return {
    found: true,
    answer: result.answer,
    sources: used.map((m) => ({ file_name: m.file_name, pages: m.pages })),
    matches,
  };
}
