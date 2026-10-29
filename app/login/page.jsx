"use client";

import { useState } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser.mjs";

const DOMAIN = "techbridge.co.jp";
const ALLOWED = /^[^@\s]+@techbridge\.co\.jp$/i;
const MIN_PASSWORD = 6;

const domainError = (email) => ({
  error: `「${email}」は使えません。使えるのは @${DOMAIN} のメールアドレスだけです。`,
  hint: "社内のメールアドレスで入り直してください。社内のアドレスが分からないときは、情報システム部門に問い合わせてください。",
});

// Supabase から返ってきた失敗を、画面に出す文に直す
function toMessage(err, email, mode) {
  const code = err?.code ?? "";
  const status = err?.status;
  if (code === "invalid_credentials") {
    return {
      error: "メールアドレスかパスワードが違います。",
      hint: "入力を確かめて、もう一度ログインしてください。まだ登録していないときは「新規登録」から登録してください。",
    };
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return { error: "このメールアドレスはもう登録されています。", hint: "「ログイン」に切り替えて、ログインしてください。" };
  }
  if (code === "weak_password") {
    return { error: `パスワードが短すぎます。`, hint: `${MIN_PASSWORD}文字以上にしてください。` };
  }
  // Auth Hook で断られたとき（社内メール以外）
  if (code === "hook_payload_invalid" || status === 403 || /techbridge\.co\.jp/.test(err?.message ?? "")) {
    return domainError(email);
  }
  if (code === "over_request_rate_limit" || status === 429) {
    return { error: "続けて送りすぎたため、しばらく受け付けられません。", hint: "数分待ってから、もう一度試してください。" };
  }
  if (err?.name === "AuthRetryableFetchError" || status === 0) {
    return { error: "サーバーにつながりませんでした。", hint: "インターネットの接続を確かめてから、もう一度試してください。" };
  }
  return {
    error: mode === "signup" ? "登録できませんでした。" : "ログインできませんでした。",
    hint: "少し待ってから、もう一度試してください。続くときは管理者に連絡してください。",
  };
}

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const addr = email.trim();
    setMessage(null);

    // 先に画面でも確かめる（本当の制限は Supabase の Auth Hook とサーバー側）
    if (!ALLOWED.test(addr)) {
      setMessage(domainError(addr));
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setMessage({ error: "パスワードが短すぎます。", hint: `${MIN_PASSWORD}文字以上にしてください。` });
      return;
    }

    setBusy(true);
    const supabase = supabaseBrowser();
    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email: addr, password })
        : await supabase.auth.signInWithPassword({ email: addr, password });

    if (error || !data?.session) {
      setBusy(false);
      setMessage(error ? toMessage(error, addr, mode) : { error: "ログインできませんでした。", hint: "管理者に連絡してください。" });
      return;
    }
    // 読み込み直して、サーバー側でもログイン済みとして扱う
    window.location.assign("/");
  }

  function switchMode(next) {
    setMode(next);
    setMessage(null);
  }

  return (
    <main className="login">
      <div className="login-card">
        <h1>社内文書検索</h1>
        <p className="login-lead">社内のメールアドレス（@{DOMAIN}）で入ってください。</p>

        <div className="tabs" role="tablist" aria-label="ログインか新規登録か">
          <button type="button" role="tab" aria-selected={mode === "login"} className="tab" onClick={() => switchMode("login")} disabled={busy}>
            ログイン
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className="tab" onClick={() => switchMode("signup")} disabled={busy}>
            新規登録
          </button>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            メールアドレス
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`例：yamada@${DOMAIN}`}
              required
              disabled={busy}
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? `${MIN_PASSWORD}文字以上` : ""}
              required
              disabled={busy}
            />
          </label>

          {message && (
            <div className="error" role="alert">
              <strong>{message.error}</strong>
              <p>{message.hint}</p>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={busy || !email.trim() || !password}>
            {busy ? (mode === "signup" ? "登録しています…" : "ログインしています…") : mode === "signup" ? "登録して入る" : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
