import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";
import { signOut } from "@/app/actions";
import { MerchantLocaleSwitcher } from "@/components/merchant-locale-switcher";
import { formatPointText, normalizeCustomerSearch } from "@/lib/customers";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { listCustomers } from "@/lib/server/customers";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

function formatDate(value: string, locale: MerchantLocale): string {
  return new Intl.DateTimeFormat(merchantIntlLocale(locale), {
    dateStyle: "medium",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lang?: string | string[] }>;
}) {
  const resolvedParams = await searchParams;
  const locale = resolveMerchantLocale(resolvedParams.lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const target = merchantLocalePath("/customers", locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(target)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const query = normalizeCustomerSearch(resolvedParams.q);
  const customers = await listCustomers(tenant.context, query);

  return (
    <main
      className="customer-page"
      id="main-content"
      lang={locale}
      tabIndex={-1}
    >
      <header className="programme-topbar">
        <div>
          <Link
            className="programme-brand"
            href={merchantLocalePath("/", locale)}
          >
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <div className="programme-topbar-actions">
          <MerchantLocaleSwitcher locale={locale} />
          <nav aria-label={t("Account navigation")}>
            <Link
              className="secondary"
              href={merchantLocalePath("/programme", locale)}
            >
              {t("Programme")}
            </Link>
            <Link
              className="secondary"
              href={merchantLocalePath("/operations", locale)}
            >
              {t("Operations")}
            </Link>
            <form action={signOut}>
              <input name="lang" type="hidden" value={locale} />
              <button className="secondary" type="submit">
                {t("Sign out")}
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="customer-heading">
        <div>
          <p className="login-eyebrow">{t("Tenant-scoped operations")}</p>
          <h1>{t("Customers")}</h1>
          <p>
            {t(
              "Search pseudonymous customer references and inspect authoritative wallet balances. Channel IDs stay masked in the interface.",
            )}
          </p>
        </div>
        <div className="customer-heading-actions">
          {["owner", "admin"].includes(tenant.context.membershipRole) ? (
            <Link
              className="primary"
              href={merchantLocalePath("/customers/bulk", locale)}
            >
              {t("Bulk adjustment")}
            </Link>
          ) : null}
          <span className="role-badge">{tenant.context.membershipRole}</span>
        </div>
      </div>

      <section className="customer-panel">
        <form className="customer-search" method="get" role="search">
          {locale === "sl-SI" ? (
            <input name="lang" type="hidden" value={locale} />
          ) : null}
          <label htmlFor="customer-search">
            <Search aria-hidden="true" />
            <span className="sr-only">{t("Search customer references")}</span>
          </label>
          <input
            defaultValue={query}
            id="customer-search"
            maxLength={100}
            name="q"
            placeholder={t("Search display reference")}
          />
          <button className="primary" type="submit">
            {t("Search")}
          </button>
          {query ? (
            <Link
              className="secondary"
              href={merchantLocalePath("/customers", locale)}
            >
              {t("Clear")}
            </Link>
          ) : null}
        </form>

        <div className="customer-result-heading">
          <div>
            <Users aria-hidden="true" />
            <strong>
              {customers.length} {t("customers")}
            </strong>
          </div>
          <span>{t("Newest 50 · RLS protected")}</span>
        </div>

        {customers.length === 0 ? (
          <div className="empty-state">
            <h2>{t("No matching customers")}</h2>
            <p>
              {t(
                "Try a different display reference. Email is deliberately not an identity or merge key.",
              )}
            </p>
          </div>
        ) : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th scope="col">{t("Customer")}</th>
                  <th scope="col">{t("Channel identity")}</th>
                  <th scope="col">{t("Available")}</th>
                  <th scope="col">{t("Pending")}</th>
                  <th scope="col">{t("Reserved")}</th>
                  <th scope="col">{t("Created")}</th>
                  <th scope="col">
                    <span className="sr-only">{t("Open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.displayReference}</strong>
                      <span>
                        {customer.status} · {t("wallet")}{" "}
                        {customer.walletStatus ?? t("not created")}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {customer.maskedExternalId ?? t("Not linked")}
                      </strong>
                      <span>
                        {customer.identityKind ?? t("No channel identity")}
                      </span>
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.availablePoints, locale)}
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.pendingPoints, locale)}
                    </td>
                    <td className="points-cell">
                      {formatPointText(customer.reservedPoints, locale)}
                    </td>
                    <td>{formatDate(customer.createdAt, locale)}</td>
                    <td>
                      <Link
                        aria-label={`${t("Open")} ${customer.displayReference}`}
                        className="table-link"
                        href={merchantLocalePath(
                          `/customers/${customer.id}`,
                          locale,
                        )}
                      >
                        {t("View")}
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
