"use client";

import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import ClientOnly from "@/components/ClientOnly";
import { ApiError, login } from "@/lib/api";

const HOME = "/route53/hosted-zones";

/** Only allow same-site relative paths, to avoid open redirects. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return HOME;
  return next;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Form
        actions={
          <Button variant="primary" formAction="submit" loading={loading}>
            Sign in
          </Button>
        }
      >
        <Container
          media={{
            content: (
              <div
                style={{
                  background: "#232f3e",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/aws-logo.svg" alt="AWS" width={64} height={38} />
              </div>
            ),
            position: "top",
            height: 88,
          }}
          header={
            <Header variant="h1" description="Route 53 console">
              Sign in
            </Header>
          }
        >
          <SpaceBetween size="l">
            {error ? (
              <Alert type="error" header="Sign in failed">
                {error}
              </Alert>
            ) : null}
            <FormField label="Username">
              <Input
                value={username}
                onChange={({ detail }) => setUsername(detail.value)}
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </FormField>
            <FormField label="Password">
              <Input
                type="password"
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </FormField>
            <Alert type="info">
              Demo account: <b>demo</b> / <b>demo</b>. Any other username and password creates a new account.
            </Alert>
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
        background: "#f2f3f3",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Suspense is required by useSearchParams; ClientOnly keeps Cloudscape out of the server render. */}
        <Suspense fallback={null}>
          <ClientOnly>
            <LoginForm />
          </ClientOnly>
        </Suspense>
      </div>
    </div>
  );
}
