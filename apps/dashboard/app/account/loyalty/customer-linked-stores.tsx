"use client";

import type { CrossWorkspaceCustomerLinksV1 } from "@starfiniti/contracts";
import { Link2, LockKeyhole, Store, Unlink } from "lucide-react";
import { useActionState } from "react";
import {
  unlinkCustomerStoreAccount,
  type CustomerLinkActionState,
} from "./customer-link-actions";

const idle: CustomerLinkActionState = { kind: "idle", message: "" };

export function CustomerLinkedStores({
  state,
}: Readonly<{
  state:
    | Readonly<{ kind: "unavailable" }>
    | Readonly<{ kind: "ready"; value: CrossWorkspaceCustomerLinksV1 }>;
}>) {
  const [actionState, action, pending] = useActionState(
    unlinkCustomerStoreAccount,
    idle,
  );

  if (state.kind === "unavailable") {
    return (
      <section className="member-linked-stores unavailable" role="status">
        <LockKeyhole aria-hidden="true" />
        <div>
          <h3>Connected-store status unavailable</h3>
          <p>
            We could not verify the current link safely. Your points, store
            accounts, and checkout are unchanged.
          </p>
        </div>
      </section>
    );
  }
  if (state.value.links.length === 0) return null;

  return (
    <section
      className="member-linked-stores"
      aria-labelledby="linked-stores-title"
    >
      <header>
        <span aria-hidden="true">
          <Link2 />
        </span>
        <div>
          <p>Verified identity</p>
          <h3 id="linked-stores-title">Connected stores</h3>
          <small>
            Every store was connected with its own signed proof. Email was not
            used to match accounts.
          </small>
        </div>
      </header>

      {actionState.kind !== "idle" ? (
        <p
          className={`member-linked-stores-message ${actionState.kind}`}
          role={actionState.kind === "error" ? "alert" : "status"}
        >
          {actionState.message}
        </p>
      ) : null}

      {state.value.links.map((link) => (
        <article key={link.linkSetId}>
          <div className="member-linked-stores-summary">
            <div>
              <strong>{link.programmeGroupName}</strong>
              <span>
                {link.state === "active"
                  ? `${link.members.length} stores share one wallet`
                  : "Shared access is currently disconnected"}
              </span>
            </div>
            <small>Revision {link.revision}</small>
          </div>
          <ul>
            {link.members.map((member) => (
              <li key={member.accountId}>
                <span className="member-linked-store-icon" aria-hidden="true">
                  <Store />
                </span>
                <div>
                  <strong>{member.storeName}</strong>
                  <span>{member.workspaceName}</span>
                </div>
                {member.canonical ? (
                  <small className="member-linked-store-home">
                    <LockKeyhole aria-hidden="true" /> Wallet home
                  </small>
                ) : member.canUnlink ? (
                  <form action={action}>
                    <input
                      name="accountId"
                      type="hidden"
                      value={member.accountId}
                    />
                    <label>
                      <input
                        disabled={pending}
                        name="confirmation"
                        required
                        type="checkbox"
                        value="unlink"
                      />
                      Confirm disconnect
                    </label>
                    <button disabled={pending} type="submit">
                      <Unlink aria-hidden="true" />
                      {pending ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="member-linked-stores-safety">
            Disconnecting restores the exact source identity for this store.
            Existing points and immutable history are never moved or deleted.
          </p>
        </article>
      ))}
    </section>
  );
}
