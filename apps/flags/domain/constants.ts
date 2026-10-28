export const FLAGS_APP = "flags";

export const FLAG_ROLES = ["engineer", "release_manager", "auditor"] as const;
export type FlagRole = (typeof FLAG_ROLES)[number];

export const ENVIRONMENTS = ["staging", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const TOGGLE_ACTIONS = ["enable", "disable"] as const;
export type ToggleAction = (typeof TOGGLE_ACTIONS)[number];
export type FlagAction = "create" | ToggleAction | "archive";

/** lower_snake_case, 3–50 chars. */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]{2,49}$/;
/** Keys that would collide with routes. */
export const RESERVED_KEYS = ["audit", "new"];
export const MAX_DESCRIPTION_LENGTH = 300;
export const MAX_REASON_LENGTH = 2000;

/** Audit action name, e.g. "enable_production", so the log and its filters say which environment changed. */
export const toggleAuditAction = (action: ToggleAction, env: Environment) => `${action}_${env}`;
