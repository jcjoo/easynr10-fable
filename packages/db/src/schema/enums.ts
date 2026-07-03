import { pgEnum } from 'drizzle-orm/pg-core';
import {
  actionStatuses,
  diagnosticStatuses,
  documentGroups,
  equipmentTypes,
  groupKinds,
  memberRoles,
  requirementTypes,
  userRoles,
} from '@easynr10/shared';

export const userRole = pgEnum('user_role', userRoles);
export const memberRole = pgEnum('member_role', memberRoles);
export const diagnosticStatus = pgEnum('diagnostic_status', diagnosticStatuses);
export const actionStatus = pgEnum('action_status', actionStatuses);
export const requirementType = pgEnum('requirement_type', requirementTypes);
export const groupKind = pgEnum('group_kind', groupKinds);
export const equipmentType = pgEnum('equipment_type', equipmentTypes);
export const documentGroup = pgEnum('document_group', documentGroups);
