// PDF を読み、ページごとに文字を取り出し、検索用の塊（チャンク）に分ける。
// 使い方: node scripts/chunk-pdf.mjs case3-doc2-expense-manual.pdf
// 結果は output/<ファイル名>.chunks.json に保存し、画面にも表示する。
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import { getEncoding } from "js-tiktoken";

// トークンの数え方: OpenAI の Embedding API と同じ cl100k_base で、"\n" でつないだ塊の本文を数える
const encoder = getEncoding("cl100k_base");
const countTokens = (text) => encoder.encode(text).length;

// 1つの塊の目安（最小〜最大）と、前の塊から引き継ぐ量（すべてトークン）
// 文書が短く、最小に届かない塊はそのまま1つにする
const MIN_TOKENS = 500;
const MAX_TOKENS = 1000;
const OVERLAP_TOKENS = 100;

// 節の見出しとみなす行（例: 「1. 精算の基本フロー」「第3条」）
const HEADING = /^(\d+(\.\d+)*\.\s|第[0-9一二三四五六七八九十百]+[章条節])/;

// この文字数以上で、句点などで終わらない行は、PDF の折り返しとみなして次の行とつなぐ
const WRAP_MIN_LENGTH = 40;

// NFKC でそろわない部首の文字（見つけたら足す）
const RADICAL_MAP = { "⻑": "長", "⺠": "民","⻄": "西", "⻘": "青", "⻝": "食", "⻤": "鬼", "⻨": "麦", "⻩": "黄", "⻭": "歯", "⻯": "竜", "⻲": "亀" };

// ページの文字を整える
function cleanText(text) {
  const lines = text
    // 「⽇」（部首の文字）を普通の「日」にするなど、見た目が同じ別の文字をそろえる
    .normalize("NFKC")
    .replace(/[⺀-⻿]/g, (ch) => RADICAL_MAP[ch] ?? ch)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  // 折り返しで切れた文をつなぐ
  const joined = [];
  for (const line of lines) {
    const prev = joined[joined.length - 1];
    if (prev !== undefined && prev.length >= WRAP_MIN_LENGTH && !/[。．.!?！？)）」』]$/.test(prev)) {
      joined[joined.length - 1] = prev + line;
    } else {
      joined.push(line);
    }
  }
  return joined.join("\n");
}

// 文に分ける（句点などの直後で区切る）
const splitSentences = (text) => text.split(/(?<=[。！？!?])/).filter((s) => s.trim() !== "");

// 1ページの行を、詰める単位（段落 = 1行）にする。各単位にページ番号と「節の始まりか」を付ける
// 1行が最大を超えるときだけ文に分け、1文でも超えるときだけ文字の途中で切る
function toUnits(text, page) {
  const units = [];
  for (const line of text.split("\n").filter((l) => l.trim() !== "")) {
    const sectionStart = HEADING.test(line);
    let pieces = [line];
    if (countTokens(line) > MAX_TOKENS) {
      pieces = splitSentences(line).flatMap((s) => {
        if (countTokens(s) <= MAX_TOKENS) return [s];
        const parts = [];
        let rest = s;
        while (rest) {
          let n = rest.length;
          while (countTokens(rest.slice(0, n)) > MAX_TOKENS) n = Math.floor(n * 0.9);
          parts.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        return parts;
      });
    }
    pieces.forEach((t, i) => units.push({ text: t, page, sectionStart: sectionStart && i === 0, overlap: false }));
  }
  return units;
}

const tokensOf = (units) => countTokens(units.map((u) => u.text).join("\n"));

// 塊の終わりから、次の塊に引き継ぐ単位を取り出す（行ごと。1行が長いときは文ごと）
function overlapFrom(units) {
  const carry = [];
  for (let i = units.length - 1; i >= 0; i--) {
    const next = [{ ...units[i] }, ...carry];
    if (tokensOf(next) <= OVERLAP_TOKENS) {
      carry.unshift({ ...units[i] });
      continue;
    }
    if (carry.length === 0) {
      // 最後の1行だけで超えるときは、その行の終わりの文を引き継ぐ
      const sentences = splitSentences(units[i].text);
      let tail = "";
      for (let j = sentences.length - 1; j >= 0; j--) {
        if (countTokens(sentences[j] + tail) > OVERLAP_TOKENS) break;
        tail = sentences[j] + tail;
      }
      if (tail) carry.unshift({ ...units[i], text: tail });
    }
    break;
  }
  return carry.map((u) => ({ ...u, sectionStart: false, overlap: true }));
}

// 単位を塊に詰める。最大を超えそうになったら、最小を下回らない範囲で一番後ろの節の境目で切る
// 節の境目で切れないときは段落（行）の境目で切る
function buildChunks(units) {
  const chunks = [];
  let current = [];

  for (const unit of units) {
    let justCut = false;
    while (current.length && tokensOf([...current, unit]) > MAX_TOKENS) {
      // 切った直後に入らないときは、先に引き継ぎ分を減らす
      if (justCut && current[0].overlap) {
        current.shift();
        continue;
      }
      if (current.every((u) => u.overlap)) {
        current = [];
        break;
      }
      let cut = current.length;
      for (let i = current.length - 1; i > 0; i--) {
        if (current[i].sectionStart && !current[i].overlap && tokensOf(current.slice(0, i)) >= MIN_TOKENS) {
          cut = i;
          break;
        }
      }
      const done = current.slice(0, cut);
      chunks.push(done);
      current = [...overlapFrom(done), ...current.slice(cut)];
      justCut = true;
    }
    current.push(unit);
  }
  if (current.some((u) => !u.overlap)) chunks.push(current);

  // 最後の塊が最小に届かず、前の塊と合わせても最大以内なら、前の塊にまとめる
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    const merged = [...prev, ...last.filter((u) => !u.overlap)];
    if (tokensOf(last) < MIN_TOKENS && tokensOf(merged) <= MAX_TOKENS) {
      chunks.splice(-2, 2, merged);
    }
  }
  return chunks;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("PDF のパスを指定してください。例: node scripts/chunk-pdf.mjs case3-doc2-expense-manual.pdf");
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(filePath)));
  const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

  // 節がページをまたぐことがあるので、全ページの単位を順につないでから詰める
  const units = [];
  pages.forEach((raw, i) => {
    const page = i + 1;
    const text = cleanText(raw);
    console.log(`\n===== ${fileName} / ${page} ページ（${text.length} 文字）=====`);
    console.log(text || "（文字が取り出せませんでした）");
    units.push(...toUnits(text, page));
  });

  // 塊がまたいだページはすべて pages に残す。page は最初のページ
  const chunks = buildChunks(units).map((us, i) => {
    const content = us.map((u) => u.text).join("\n");
    const chunkPages = [...new Set(us.map((u) => u.page))];
    return {
      file_name: fileName,
      page: chunkPages[0],
      pages: chunkPages,
      chunk_index: i,
      tokens: countTokens(content),
      content,
    };
  });

  console.log(`\n===== 塊の一覧 =====`);
  for (const c of chunks) {
    const pageLabel = c.pages.length > 1 ? `p.${c.pages[0]}-${c.pages[c.pages.length - 1]}` : `p.${c.page}`;
    console.log(`\n[#${c.chunk_index}] ${c.file_name} ${pageLabel}（${c.tokens} トークン / ${c.content.length} 文字）`);
    console.log(c.content);
  }

  await mkdir("output", { recursive: true });
  const outPath = path.join("output", `${path.parse(fileName).name}.chunks.json`);
  await writeFile(outPath, JSON.stringify(chunks, null, 2), "utf8");

  console.log(`\n全 ${totalPages} ページ / 塊 ${chunks.length} 個`);
  console.log(`保存先: ${outPath}`);
}

main().catch((err) => {
  console.error("取り込みに失敗しました:", err);
  process.exit(1);
});
