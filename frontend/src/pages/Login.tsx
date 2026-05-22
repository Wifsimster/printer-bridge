import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, KeyRound, Loader2 } from "lucide-react";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { endpoints, setToken } from "@/lib/api";

export function Login() {
  const [token, setTokenValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setSubmitting(true);
    setToken(token.trim());
    try {
      await endpoints.config();
      toast.success("Signed in");
      navigate("/", { replace: true });
    } catch {
      setToken("");
      toast.error("Invalid token");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell-bg relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-strong">
            <Printer className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">printcast</h1>
          <p className="text-sm text-muted-foreground">
            ESC/POS print bridge admin
          </p>
        </div>
        <Card className="shadow-medium">
          <CardHeader className="space-y-1.5">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Paste the bearer token you configured during setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Bearer token</Label>
                <Input
                  id="token"
                  type="password"
                  autoFocus
                  placeholder="hex…"
                  value={token}
                  onChange={(e) => setTokenValue(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button
                type="submit"
                className="w-full shadow-soft"
                disabled={submitting || !token.trim()}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
