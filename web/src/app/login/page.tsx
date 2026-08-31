'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Hexagon, Lock, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true);
    try {
      await login(values.email, values.password);
      router.replace('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to sign in';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-12 overflow-hidden bg-background">
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-72 h-72 bg-chart-2/10 rounded-full blur-2xl pointer-events-none -z-10" />

      <div className="w-full max-w-[420px] mx-auto">
        {/* Brand Header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-white/20 transition-transform duration-300 hover:scale-105">
            <Hexagon className="size-7 fill-primary-foreground/20" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Hexenex ERP</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Enterprise Operations &amp; Resource Management</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-border/60 shadow-xl backdrop-blur-xs bg-card/95">
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-lg font-semibold tracking-tight">Sign in to your account</CardTitle>
            <CardDescription className="text-xs">
              Enter your corporate credentials to access the admin suite
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@hexenex.com"
                  autoComplete="username"
                  className="h-9.5 text-sm"
                  {...register('email')}
                />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-9.5 text-sm"
                  {...register('password')}
                />
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-semibold gap-2 shadow-md shadow-primary/20 mt-2 transition-all hover:shadow-primary/30"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Authenticating…
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" />
              <span>Enterprise Single Sign-on &amp; IAM protected</span>
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Hexenex. All rights reserved.
        </p>
      </div>
    </div>
  );
}
