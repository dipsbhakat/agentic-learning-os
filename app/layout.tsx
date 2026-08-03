import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic Learning OS",
  description: "A persistent, multi-agent system that owns your learning journey.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <header className="topbar">
            <Link href="/" className="brand">
              Agentic Learning OS
            </Link>
            <nav>
              <Link href="/">Dashboard</Link>
              <Link href="/chat">Mentor</Link>
              <Show when="signed-in">
                <UserButton />
              </Show>
              <Show when="signed-out">
                <Link href="/sign-in">Sign in</Link>
              </Show>
            </nav>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
