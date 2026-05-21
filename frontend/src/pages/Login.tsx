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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Printer className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Sign in to printcast</CardTitle>
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
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
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
  );
}
