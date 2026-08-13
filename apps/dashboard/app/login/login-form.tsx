"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { CUSTOMER_COPY, type CustomerLocale } from "@/lib/customer-locale";

export function LoginForm({
  nextPath,
  initialMessage = "",
  locale,
  reauthentication,
}: {
  nextPath: string;
  initialMessage?: string;
  locale: CustomerLocale;
  reauthentication?: "customer-export";
}) {
  const copy = CUSTOMER_COPY[locale];
  const [state, action, pending] = useActionState(signIn, {
    message: initialMessage,
  } satisfies LoginState);

  return (
    <form action={action} className="login-form">
      <input name="next" type="hidden" value={nextPath} />
      <input name="lang" type="hidden" value={locale} />
      {reauthentication ? (
        <input name="reauth" type="hidden" value={reauthentication} />
      ) : null}
      <label htmlFor="email">{copy.email}</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        required
        type="email"
      />
      <label htmlFor="password">{copy.password}</label>
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
        {reauthentication
          ? pending
            ? copy.exportAuthorizing
            : copy.exportAuthorize
          : pending
            ? copy.signingIn
            : copy.signIn}
      </button>
    </form>
  );
}
