import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError, endpoints } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      await endpoints.signIn(email.trim(), password);
      await refresh();
      toast.success("Signed in");
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid email or password"
            : err.message
          : "Sign in failed";
      toast.error(msg);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Printer className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Sign in to printcast</CardTitle>
          <CardDescription>Use your admin email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
