import { pgEnum } from 'drizzle-orm/pg-core';
import {
  actionStatuses,
  diagnosticStatuses,
  documentGroups,
  equipmentTypes,
  registerTargets,
  requirementTypes,
  userRoles,
} from '@easynr10/shared';

export const userRole = pgEnum('user_role', userRoles);
export const diagnosticStatus = pgEnum('diagnostic_status', diagnosticStatuses);
export const actionStatus = pgEnum('action_status', actionStatuses);
export const requirementType = pgEnum('requirement_type', requirementTypes);
export const equipmentType = pgEnum('equipment_type', equipmentTypes);
export const registerTarget = pgEnum('register_target', registerTargets);
export const documentGroup = pgEnum('document_group', documentGroups);
