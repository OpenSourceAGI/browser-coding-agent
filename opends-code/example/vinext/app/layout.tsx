export const metadata = {
  title: "OpenDS Code",
  description: "OpenVSCode Web running in the browser, on vinext + Workers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#1f1f1f", color: "#ccc" }}>
        {children}
      </body>
    </html>
  );
}
