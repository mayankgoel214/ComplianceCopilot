"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";

export default function SignupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    try {
      const user = await signIn();
      if (user) {
        toast.success("Account created successfully!");
        router.push("/");
      }
    } catch (error) {
      console.error("Signup error:", error);
      toast.error("Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <CardDescription>
            Sign up with your Google account to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
            </div>
          ) : (
            <>
              <Button
                onClick={handleGoogleSignup}
                variant="outline"
                className="w-full"
                disabled={isLoading}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                  focusable="false"
                  data-prefix="fab"
                  data-icon="google"
                  role="img"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 488 512"
                >
                  <path
                    fill="currentColor"
                    d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h240z"
                  ></path>
                </svg>
                Continue with Google
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="underline hover:text-primary">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}