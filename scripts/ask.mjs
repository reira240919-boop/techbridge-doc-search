// 質問に、保存した文書の塊だけを使って答える。
// 使い方: node --env-file=.env scripts/ask.mjs "在宅勤務手当はいくら？"
// 答えの作り方は lib/rag.mjs（チャット画面と同じ）。
import { answerQuestion, formatPages, missingEnv } from "../lib/rag.mjs";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('質問を指定してください。例: node --env-file=.env scripts/ask.mjs "在宅勤務手当はいくら？"');
    process.exit(1);
  }
  for (const name of missingEnv()) {
    console.error(`.env に ${name} がありません`);
    process.exit(1);
  }

  const { found, answer, sources, matches } = await answerQuestion(question);

  console.log(`質問: ${question}`);
  console.log(`\n検索で取った塊（近い順）:`);
  matches.forEach((m, i) => {
    console.log(`  [資料${i + 1}] ${m.file_name} ${formatPages(m.pages)}（近さ ${m.similarity.toFixed(3)}）`);
  });

  console.log(`\n答え: ${answer}`);
  if (found) {
    console.log(`出典:`);
    for (const s of sources) console.log(`  ・${s.file_name} ${formatPages(s.pages)}`);
  }
}

main().catch((err) => {
  console.error("答えられませんでした:", err.message ?? err);
  process.exit(1);
});
