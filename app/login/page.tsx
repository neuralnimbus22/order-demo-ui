import type { Metadata } from "next";
import AuthCard from "@/components/auth-card";
import LoginForm from "@/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  return (
    <AuthCard title="Welcome back" subtitle="Log in to your Sundry account.">
      <LoginForm justRegistered={registered === "1"} />
    </AuthCard>
  );
}
