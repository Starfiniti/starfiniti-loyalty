import {
  BarChart3,
  Check,
  Crown,
  Database,
  Headphones,
  KeyRound,
  Megaphone,
  ScrollText,
  Shield,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  EnterpriseAccessRoleV1,
  OrganizationAccessWorkspaceV1,
} from "@starfiniti/contracts";
import {
  activeMembershipTotal,
  permissionLabel,
  profileAssignmentSummary,
} from "./access-review-model";

const roleIcons: Record<EnterpriseAccessRoleV1, LucideIcon> = {
  owner: Crown,
  admin: Shield,
  marketer: Megaphone,
  operator: Wrench,
  support: Headphones,
  analyst: BarChart3,
  auditor: ScrollText,
};

export function AccessReview({
  workspace,
}: Readonly<{ workspace: OrganizationAccessWorkspaceV1 }>) {
  const currentProfile = workspace.catalogue.profiles.find(
    ({ role }) => role === workspace.currentAccess.role,
  );
  const totalMembers = activeMembershipTotal(workspace);

  return (
    <>
      <section className="access-hero">
        <div>
          <p className="login-eyebrow">Enterprise access</p>
          <h1>Know exactly who can do what</h1>
          <p>
            Live PostgreSQL membership—not email, domain, SSO groups, or token
            metadata—decides access to {workspace.organization.name}.
          </p>
        </div>
        <span className="access-hero-icon" aria-hidden="true">
          <ShieldCheck />
        </span>
      </section>

      <section className="access-summary" aria-label="Access summary">
        <article>
          <span className="access-summary-icon">
            <Database aria-hidden="true" />
          </span>
          <div>
            <small>Organization state</small>
            <strong>{workspace.organization.status}</strong>
          </div>
        </article>
        <article>
          <span className="access-summary-icon">
            <KeyRound aria-hidden="true" />
          </span>
          <div>
            <small>Your access</small>
            <strong>
              {workspace.currentAccess.effective
                ? (currentProfile?.label ?? workspace.currentAccess.role)
                : "Suspended"}
            </strong>
          </div>
        </article>
        <article>
          <span className="access-summary-icon">
            <Shield aria-hidden="true" />
          </span>
          <div>
            <small>Live members</small>
            <strong>{totalMembers}</strong>
          </div>
        </article>
        <article>
          <span className="access-summary-icon">
            <ScrollText aria-hidden="true" />
          </span>
          <div>
            <small>Policy version</small>
            <strong>Access V1</strong>
          </div>
        </article>
      </section>

      <section className="access-current-card">
        <div>
          <p className="login-eyebrow">
            {workspace.currentAccess.effective
              ? "Your effective M13 permissions"
              : "Assigned profile · permissions inactive"}
          </p>
          <h2>{currentProfile?.label ?? workspace.currentAccess.role}</h2>
          <p>
            {currentProfile?.description}
            {workspace.currentAccess.effective
              ? null
              : " The organization is suspended, so this profile cannot authorize a command."}
          </p>
        </div>
        <ul
          className={
            workspace.currentAccess.effective ? undefined : "is-inactive"
          }
        >
          {workspace.currentAccess.permissions.map((permission) => (
            <li key={permission}>
              <Check aria-hidden="true" />
              {permissionLabel(permission)}
            </li>
          ))}
        </ul>
      </section>

      <section
        className="access-role-section"
        aria-labelledby="access-roles-title"
      >
        <header>
          <div>
            <p className="login-eyebrow">Separation of duties</p>
            <h2 id="access-roles-title">Seven clear access profiles</h2>
            <p>
              These permissions govern enterprise identity administration.
              Existing loyalty operations keep their narrower checks until
              explicitly migrated.
            </p>
          </div>
          <span className="access-live-badge">
            <span />
            Live database policy
          </span>
        </header>
        <div className="access-role-grid">
          {workspace.catalogue.profiles.map((profile) => {
            const Icon = roleIcons[profile.role];
            const current = profile.role === workspace.currentAccess.role;
            return (
              <article
                className={current ? "is-current" : undefined}
                key={profile.role}
              >
                <header>
                  <span className="access-role-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{profile.label}</h3>
                    <small>
                      {profileAssignmentSummary(profile, workspace)}
                    </small>
                  </div>
                  {current ? (
                    <span className="access-you-badge">You</span>
                  ) : null}
                </header>
                <p>{profile.description}</p>
                <ul>
                  {profile.permissions.map((permission) => (
                    <li key={permission}>
                      <Check aria-hidden="true" />
                      {permissionLabel(permission)}
                    </li>
                  ))}
                </ul>
                <footer>
                  {profile.assignmentKind === "support_grant"
                    ? "Scoped grant · approval · expiry · visible audit"
                    : "Live membership · immediate revocation"}
                </footer>
              </article>
            );
          })}
        </div>
      </section>

      <section className="access-trust-boundary">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2>Authentication is not tenant authority</h2>
          <p>
            Authentik proves identity and Supabase issues the application
            session. Every organization request still rechecks the live
            membership row, so a revoked member fails even while an older JWT
            has not expired.
          </p>
        </div>
        <code>auth.uid() → membership → permission</code>
      </section>
    </>
  );
}
