// app/layout.tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Initialize fonts
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Qplus Voice Assistant",
  description: "Quantum Strides Real-time AI Interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Keeping FontAwesome for the icons as requested */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      {/* Apply font variables to the body */}
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-slate-950 text-slate-100 overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}