import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ResetPassword } from "@/openhiggsfield/reset-password";

import "@/openhiggsfield/openhiggsfield.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ohf-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Set your password — OpenHiggsfield AI",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPassword fontClassName={inter.variable} />;
}
