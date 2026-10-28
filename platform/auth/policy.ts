/** Result of a permission check. Apps write their own policy functions returning this shape. */
export type Decision = { allowed: true } | { allowed: false; reason: string };

export const allow = (): Decision => ({ allowed: true });
export const deny = (reason: string): Decision => ({ allowed: false, reason });

export function hasRole(user: { role: string }, ...roles: string[]): boolean {
  return roles.includes(user.role);
}
