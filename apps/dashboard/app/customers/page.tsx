import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";
import { signOut } from "@/app/actions";
import { formatPointText, normalizeCustomerSearch } from "@/lib/customers";
import { listCustomers } from "@/lib/server/customers";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") redirect("/login?next=%2Fcustomers");
  if (tenant.kind === "unassigned") redirect("/");

  const query = normalizeCustomerSearch((await searchParams).q);
  const customers = await listCustomers(tenant.context, query);

  return (
    <main className="customer-page" id="main-content" tabIndex={-1}>
      <header className="programme-topbar">
        <div>
          <Link className="programme-brand" href="/">
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <nav aria-label="Account navigation">
          <Link className="secondary" href="/programme">
            Programme
          </Link>
          <Link className="secondary" href="/operations">
            Operations
          </Link>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="customer-heading">
        <div>
          <p className="login-eyebrow">Tenant-scoped operations</p>
          <h1>Customers</h1>
          <p>
            Search pseudonymous customer references and inspect authoritative
            wallet balances. Channel IDs stay masked in the interface.
          </p>
        </div>
        <div className="customer-heading-actions">
          {["owner", "admin"].includes(tenant.context.membershipRole) ? (
            <Link className="primary" href="/customers/bulk">
              Bulk adjustment
            </Link>
          ) : null}
          <span className="role-badge">{tenant.context.membershipRole}</span>
        </div>
      </div>

      <section className="customer-panel">
        <form className="customer-search" method="get" role="search">
          <label htmlFor="customer-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search customer references</span>
          </label>
          <input
            defaultValue={query}
            id="customer-search"
            maxLength={100}
            name="q"
            placeholder="Search display reference"
          />
          <button className="primary" type="submit">
            Search
          </button>
          {query ? (
            <Link className="secondary" href="/customers">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="customer-result-heading">
          <div>
            <Users aria-hidden="true" />
            <strong>{customers.length} customers</strong>
          </div>
          <span>Newest 50 · RLS protected</span>
        </div>

        {customers.length === 0 ? (
          <div className="empty-state">
            <h2>No matching customers</h2>
            <p>
              Try a different display reference. Email is deliberately not an
              identity or merge key.
            </p>
          </div>
        ) : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Channel identity</th>
                  <th scope="col">Available</th>
                  <th scope="col">Pending</th>
                  <th scope="col">Reserved</th>
                  <th scope="col">Created</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.displayReference}</strong>
                      <span>
                        {customer.status} · wallet{" "}
                        {customer.walletStatus ?? "not created"}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {customer.maskedExternalId ?? "Not linked"}
                      </strong>
                      <span>
                        {customer.identityKind ?? "No channel identity"}
                      </span>
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.availablePoints)}
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.pendingPoints)}
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.reservedPoints)}
                    </td>
                    <td>{formatDate(customer.createdAt)}</td>
                    <td>
                      <Link
                        aria-label={`Open ${customer.displayReference}`}
                        className="table-link"
                        href={`/customers/${customer.id}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
