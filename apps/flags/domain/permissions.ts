import { allow, deny, type Decision } from "@/platform/auth/policy";
import { FLAG_ROLES, type Environment, type FlagAction, type FlagRole } from "@/apps/flags/domain/constants";

type Actor = { id: string; role: string };

export function isFlagRole(role: string): role is FlagRole {
  return (FLAG_ROLES as readonly string[]).includes(role);
}

/**
 * - auditor: read-only
 * - engineer: create flags, turn them on/off in staging
 * - release_manager: everything an engineer can do, plus production on/off and archiving
 */
export function checkPermission(user: Actor, action: FlagAction, env?: Environment): Decision {
  if (!isFlagRole(user.role)) return deny(`Role '${user.role}' has no access to feature flags`);
  if (user.role === "auditor") return deny("Auditors have read-only access");
  if (action === "archive" && user.role !== "release_manager") return deny("Only release managers can archive flags");
  if ((action === "enable" || action === "disable") && env === "production" && user.role !== "release_manager") {
    return deny("Only release managers can change production");
  }
  return allow();
}
