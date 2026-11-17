// Role labels shown in the UI (Spanish).
import type { AppRole } from './session';

export const ROLE_LABEL: Record<AppRole, string> = { admin: 'organizador', judge: 'juez', pilot: 'piloto' };
export const ROLES: AppRole[] = ['admin', 'judge', 'pilot'];
