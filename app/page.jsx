"use client";

import { useEffect, useRef, useState } from "react";
import { DOCUMENTS } from "../lib/documents.mjs";
import { supabaseBrowser } from "../lib/supabase-browser.mjs";

const EXAMPLES = ["在宅勤務手当はいくら？", "経費精算の締め日はいつ？", "PCを紛失したらどうする？"];

const formatPages = (pages) =>
  pages.length > 1 ? `p.${pages[0]}〜${pages[pages.length - 1]}` : `p.${pages[0]}`;

export default function ChatPage() {
  const [input, setInput] = useState("");
  // この画面を開いている間のやり取りだけを並べる（前の会話を答えに使うことはしない）
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setEmail(data?.user?.email ?? ""));
  }, []);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    window.location.assign("/login");
  }

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [items, sending]);

  async function ask(question) {
    const q = question.trim();
    if (!q || sending) return;
    setSending(true);
    setInput("");
    setItems((prev) => [...prev.filter((it) => it.type !== "error"), { type: "question", text: q }]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      // ログインが切れていたら、ログイン画面へ
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setItems((prev) => [
          ...prev,
          {
            type: "error",
            question: q,
            error: data?.error ?? "答えを受け取れませんでした。",
            hint: data?.hint ?? "少し待ってから、もう一度送信してください。",
          },
        ]);
        return;
      }
      setItems((prev) => [...prev, { type: "answer", ...data }]);
    } catch {
      setItems((prev) => [
        ...prev,
        {
          type: "error",
          question: q,
          error: "サーバーにつながりませんでした。",
          hint: "インターネットの接続を確かめてから、もう一度送信してください。",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  function onKeyDown(e) {
    // Enter で送信、Shift + Enter で改行。日本語の変換中の Enter では送らない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <h1>社内文書検索</h1>
        <p>就業規則・経費精算・セキュリティなど、社内の文書に書いてあることから答えます。</p>
        <div className="account">
          {email && <span>{email} でログイン中</span>}
          <button type="button" onClick={logout}>
            ログアウト
          </button>
        </div>
      </header>

      <section className="log" ref={logRef} aria-live="polite">
        {items.length === 0 && !sending && (
          <div className="empty">
            <h2>まだ質問はありません</h2>
            <p>
              知りたいことを下の入力欄に書いて「送信」を押してください。答えの下に、根拠になった文書とページが出ます。
            </p>
            <p>たとえば、こんな質問ができます。</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="example" onClick={() => setInput(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((it, i) => {
          if (it.type === "question") {
            return (
              <div key={i} className="question">
                {it.text}
              </div>
            );
          }
          if (it.type === "error") {
            return (
              <div key={i} className="error" role="alert">
                <strong>{it.error}</strong>
                <p>{it.hint}</p>
                <button type="button" onClick={() => ask(it.question)} disabled={sending}>
                  もう一度送る
                </button>
              </div>
            );
          }
          return (
            <div key={i} className={`answer${it.found ? "" : " notfound"}`}>
              <p>{it.answer}</p>
              {it.found ? (
                <div className="sources">
                  <h3>出典（クリックで PDF の該当ページを開きます）</h3>
                  <ul>
                    {it.sources.map((s) => (
                      <li key={s.file_name}>
                        <a
                          href={`/api/pdf/${encodeURIComponent(s.file_name)}#page=${s.pages[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span>{DOCUMENTS[s.file_name] ?? s.file_name}</span>
                          <span className="page">{formatPages(s.pages)}</span>
                          <span className="file">{s.file_name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="note">
                  社内の文書に書いてある内容だけで答えています。言い方を変えて質問するか、担当の部署に確認してください。
                </p>
              )}
              {it.logSaved === false && <p className="note">※ このやり取りの記録は保存できませんでした。</p>}
            </div>
          );
        })}

        {sending && <div className="loading">文書を探して、答えを作っています…</div>}
      </section>

      <footer className="composer">
        <form onSubmit={onSubmit}>
          <textarea
            id="question"
            aria-label="質問"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="例：在宅勤務手当はいくら？"
            maxLength={500}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? "回答を作成中…" : "送信"}
          </button>
        </form>
        <p className="help">Enter で送信、Shift + Enter で改行</p>
      </footer>
    </main>
  );
}
