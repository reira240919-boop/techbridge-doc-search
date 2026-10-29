// 質問を受け取り、答えと出典を返す。やり取りは conversations に記録する。
import { answerQuestion, missingEnv, supabaseAdmin } from "../../../lib/rag.mjs";
import { getAllowedUser } from "../../../lib/auth.mjs";

export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 500;

const fail = (status, error, hint) => Response.json({ error, hint }, { status });

export async function POST(request) {
  // ログイン済みの社内メールの人だけ。それ以外は質問を読む前に断る
  if (!(await getAllowedUser())) {
    return fail(401, "ログインが必要です。", "社内のメールアドレス（@techbridge.co.jp）でログインし直してください。");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "質問を読み取れませんでした。", "ページを再読み込みしてから、もう一度送信してください。");
  }

  const question = String(body?.question ?? "").trim();
  if (!question) {
    return fail(400, "質問が空です。", "質問を入力してから送信してください。");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return fail(400, `質問が長すぎます（${MAX_QUESTION_LENGTH}文字まで）。`, "知りたいことを1つに絞って、短くしてから送信してください。");
  }

  const missing = missingEnv();
  if (missing.length > 0) {
    console.error("足りない設定:", missing.join(", "));
    return fail(500, "サーバーの設定が足りないため、答えを作れません。", "管理者に連絡してください。");
  }

  let result;
  try {
    result = await answerQuestion(question);
  } catch (err) {
    console.error("答えの作成に失敗:", err);
    return fail(
      502,
      "答えを作る途中で失敗しました。",
      "少し待ってから、もう一度送信してください。続くときは管理者に連絡してください。",
    );
  }

  // 記録に失敗しても、答えは返す（画面で記録できなかったことを伝える）
  const { error: logError } = await supabaseAdmin().from("conversations").insert({
    question,
    answer: result.answer,
    found: result.found,
    sources: result.sources,
  });
  if (logError) console.error("記録の保存に失敗:", logError);

  return Response.json({
    found: result.found,
    answer: result.answer,
    sources: result.sources,
    logSaved: !logError,
  });
}
