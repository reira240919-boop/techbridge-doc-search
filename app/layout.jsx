import "./globals.css";

export const metadata = {
  title: "社内文書検索",
  description: "就業規則や経費精算マニュアルなど、社内の文書から答えを探します。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
