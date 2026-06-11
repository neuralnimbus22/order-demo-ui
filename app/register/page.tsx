import type { Metadata } from "next";
import AuthCard from "@/components/auth-card";
import RegisterForm from "@/components/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="A minute now, everyday goods forever."
    >
      <RegisterForm />
    </AuthCard>
  );
}
