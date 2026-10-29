// 出典の PDF を返す。取り込んだ PDF だけを返し、それ以外のファイルは返さない
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOCUMENTS } from "../../../../lib/documents.mjs";
import { getAllowedUser } from "../../../../lib/auth.mjs";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  // ログイン済みの社内メールの人だけ
  if (!(await getAllowedUser())) {
    return new Response("ログインが必要です。社内のメールアドレス（@techbridge.co.jp）でログインしてください。", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { name } = await params;
  if (!Object.hasOwn(DOCUMENTS, name)) {
    return new Response("この文書は見つかりません。", { status: 404 });
  }

  const data = await readFile(path.join(process.cwd(), name));
  return new Response(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}
