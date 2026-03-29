import type { Metadata } from "next";
import { Inter, Roboto_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

// Основной UI шрифт (безопасный аналог Geist)
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist-sans", // Связываем с tailwind.config
});

// Моноширинный шрифт для данных/цифр (безопасный аналог Geist Mono)
const robotoMono = Roboto_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist-mono",
});

// Заголовочный шрифт
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-playfair-display", // Связываем с tailwind.config
});

export const metadata: Metadata = {
  title: "UrbanBlind | Analytics",
  description: "Аналитика безопасности городской среды",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${inter.variable} ${robotoMono.variable} ${playfair.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
