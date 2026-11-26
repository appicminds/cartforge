"use client";

import { useState } from "react";
import { Copy, Mail, UserPlus, Users } from "lucide-react";
import { PERMISSIONS, type CreatedInvitation, type StaffMember } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useInvite, useTeam, useTeamAction } from "@/lib/staff";

/** Settings → Team: who can open this store, with which role (Next 1). */
export default function TeamPage() {
  const { can, store } = useSession();
  const canEdit = can(PERMISSIONS.STAFF_WRITE);
  const team = useTeam();
  const action = useTeamAction();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);

  const assignable = team.data?.roles.filter((r) => r.assignable) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team"
        description={`People who can open ${store?.store_name ?? "this store"} in the admin, and what they can do.`}
        primaryAction={
          canEdit ? (
            <Button onClick={() => setInviting(true)} disabled={!assignable.length}>
              <UserPlus aria-hidden /> Invite someone
            </Button>
          ) : undefined
        }
      />
      {!canEdit && (
        <Alert tone="info" title="View only">
          Your role can see the team but not change it.
        </Alert>
      )}

      <Card>
        <CardHeader title="Members" />
        <CardBody>
          {team.isError ? (
            <Alert tone="danger" title="Couldn't load the team">
              {team.error.message}
            </Alert>
          ) : !team.data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="divide-y divide-border" aria-label="Team members">
              {team.data.members.map((m) => (
                <li key={m.membership_id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.name}
                      {m.is_you && <Badge>You</Badge>}
                      {m.is_owner && <Badge tone="primary">Owner</Badge>}
                    </p>
                    <p className="truncate text-sm text-fg-muted">
                      {m.email} · joined {formatDate(m.joined_at)}
                    </p>
                  </div>
                  {canEdit && m.manageable ? (
                    <>
                      <Select
                        aria-label={`Role for ${m.name}`}
                        className="w-48"
                        value={m.role.id}
                        disabled={action.isPending}
                        onChange={(e) =>
                          action.mutate(
                            { kind: "role", membershipId: m.membership_id, roleId: e.target.value },
                            {
                              onSuccess: () => toast.success(`${m.name}'s role updated`),
                              onError: (err) => toast.error(err.message),
                            },
                          )
                        }
                      >
                        {assignable.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoving(m)}
                        aria-label={`Remove ${m.name}`}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-fg-muted">{m.role.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Invitations" />
        <CardBody>
          {!team.data ? (
            <Skeleton className="h-12 w-full" />
          ) : team.data.invitations.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No open invitations"
              description="Invite people to help run the store. They choose their own password."
            />
          ) : (
            <ul className="divide-y divide-border" aria-label="Open invitations">
              {team.data.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Mail aria-hidden className="size-4 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-sm text-fg-muted">
                      {i.role.name}
                      {i.invited_by && <> · invited by {i.invited_by}</>} ·{" "}
                      {i.expired ? "expired" : `expires ${formatDate(i.expires_at)}`}
                    </p>
                  </div>
                  {i.expired && <Badge tone="danger">Expired</Badge>}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Cancel invitation for ${i.email}`}
                      onClick={() =>
                        action.mutate(
                          { kind: "revoke", invitationId: i.id },
                          {
                            onSuccess: () => toast.success("Invitation cancelled"),
                            onError: (err) => toast.error(err.message),
                          },
                        )
                      }
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <InviteDialog
        open={inviting}
        roles={assignable}
        onClose={() => setInviting(false)}
        onCreated={(inv) => {
          setInviting(false);
          setCreated(inv);
        }}
      />
      <CreatedDialog invitation={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "this person"}?`}
        description="They lose access to this store right away. Their account and other stores aren't affected."
        confirmLabel="Remove"
        destructive
        pending={action.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          action.mutate(
            { kind: "remove", membershipId: removing.membership_id },
            {
              onSuccess: () => {
                toast.success(`${removing.name} removed`);
                setRemoving(null);
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }
      />
    </div>
  );
}

function InviteDialog({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (inv: CreatedInvitation) => void;
}) {
  const invite = useInvite();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const fieldError = (path: string) =>
    invite.error instanceof ApiError
      ? invite.error.fields.find((f) => f.path === path)?.message
      : undefined;
  const general =
    invite.error && !fieldError("email") && !fieldError("role_id") ? invite.error.message : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite someone"
      description="They get a link to join this store. It works for 7 days."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={invite.isPending}>
            Send invitation
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate(
            { email, role_id: roleId || roles[0]?.id || "" },
            {
              onSuccess: (inv) => {
                setEmail("");
                setRoleId("");
                invite.reset();
                onCreated(inv);
              },
            },
          );
        }}
      >
        {general && <Alert tone="danger" title={general} />}
        <Field label="Email" required error={fieldError("email")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="off"
              aria-describedby={describedBy}
              invalid={invalid}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Role"
          required
          error={fieldError("role_id")}
          hint="You can only give roles with access you have yourself."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={roleId || roles[0]?.id || ""}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function CreatedDialog({
  invitation,
  onClose,
}: {
  invitation: CreatedInvitation | null;
  onClose: () => void;
}) {
  const toast = useToast();
  return (
    <Dialog
      open={invitation !== null}
      onClose={onClose}
      title="Invitation created"
      description={
        invitation?.emailed
          ? `We emailed ${invitation.email}. You can also send them this link yourself.`
          : `Email isn't set up yet, so send ${invitation?.email ?? "them"} this link yourself.`
      }
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {invitation && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label="Invitation link"
              value={invitation.url}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invitation.url);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy — select the link and copy it");
                }
              }}
            >
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            Anyone with this link can join as {invitation.role.name}, so share it only with{" "}
            {invitation.email}.
          </p>
        </div>
      )}
    </Dialog>
  );
}
