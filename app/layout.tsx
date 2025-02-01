import type { Metadata } from "next"
import { Orbitron } from "next/font/google"
import "./globals.css"
import type React from "react"
import Script from 'next/script';

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "LottoGPT - 미래형 AI 로또 번호 생성기",
  description: "최첨단 인공지능 기술을 활용한 혁신적인 로또 번호 예측 서비스",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <head>
        <Script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4859745494345842" crossOrigin="anonymous"></Script>
      </head>
      <body className={orbitron.className}>{children}</body>
    </html>
  )
}

