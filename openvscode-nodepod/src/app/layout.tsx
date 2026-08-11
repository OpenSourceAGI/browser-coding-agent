import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenVSCode on Nodepod",
  description:
    "The VS Code workbench running entirely in the browser, with Nodepod providing the filesystem, processes, sockets and shell.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
