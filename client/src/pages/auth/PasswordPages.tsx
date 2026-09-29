import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { authApi } from "../../api/endpoints";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { useToast } from "../../components/ui/Toast";
import { applyApiError } from "../../lib/forms";

const backToLogin = (
  <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
    Back to log in
  </Link>
);

const forgotSchema = z.object({ email: z.email("Enter a valid email address") });

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={backToLogin}>
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="text-primary" size={32} aria-hidden="true" />
          {/* Same wording whether or not the account exists; the API doesn't say either. */}
          <p className="text-body">
            If there's an account for <strong>{sentTo}</strong>, we've sent a link to reset the password. It expires in 1 hour.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new one" footer={backToLogin}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register("email")} />
        {errors.root && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-caption text-danger">
            {errors.root.message}
          </p>
        )}
        <Button type="submit" loading={isSubmitting} fullWidth>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match" });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await authApi.resetPassword(token!, password);
      toast({ message: "Password changed. Log in with your new password." });
      navigate("/login", { replace: true });
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Link not valid" footer={backToLogin}>
        <p className="text-center text-body">
          This reset link is incomplete. <Link to="/forgot-password" className="font-semibold text-primary">Request a new one</Link>.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be logged out on your other devices" footer={backToLogin}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password?.message} {...register("password")} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register("confirm")} />
        {errors.root && (
          <div role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-caption text-danger">
            {errors.root.message}{" "}
            <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link>
          </div>
        )}
        <Button type="submit" loading={isSubmitting} fullWidth>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
