import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { useAuth } from "../../auth/useAuth";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { applyApiError } from "../../lib/forms";

// Mirrors the API's rules so most mistakes are caught before a round trip.
const schema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
});
type Values = z.infer<typeof schema>;

export function SignupPage() {
  const { signup } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup({ email: values.email, password: values.password, name: values.name || undefined });
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <AuthLayout
      title="Build better habits"
      subtitle="Create a free account to start tracking"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField label="Name (optional)" autoComplete="given-name" error={errors.name?.message} {...register("name")} />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        {errors.root && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-caption text-danger">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" loading={isSubmitting} fullWidth>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
