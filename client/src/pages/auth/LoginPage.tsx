import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { z } from "zod";
import { useAuth } from "../../auth/AuthProvider";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { applyApiError } from "../../lib/forms";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // On success the auth state changes and RequireAnonymous redirects.
  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to keep your streaks going"
      footer={
        <>
          New here?{" "}
          <Link to="/signup" state={location.state} className="font-semibold text-primary underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
        <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
        {errors.root && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-caption text-danger">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" loading={isSubmitting} fullWidth>
          Log in
        </Button>
        <Link to="/forgot-password" className="self-center text-caption text-muted underline-offset-2 hover:underline">
          Forgot your password?
        </Link>
      </form>
    </AuthLayout>
  );
}
