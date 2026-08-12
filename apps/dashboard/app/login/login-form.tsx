"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({
  nextPath,
  initialMessage = "",
}: {
  nextPath: string;
  initialMessage?: string;
}) {
  const [state, action, pending] = useActionState(signIn, {
    message: initialMessage,
  } satisfies LoginState);

  return (
    <form action={action} className="login-form">
      <input name="next" type="hidden" value={nextPath} />
      <label htmlFor="email">Email address</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        required
        type="email"
      />
      <label htmlFor="password">Password</label>
      <input
        autoComplete="current-password"
        id="password"
        minLength={8}
        name="password"
        required
        type="password"
      />
      <p aria-live="polite" className="login-message">
        {state.message}
      </p>
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
