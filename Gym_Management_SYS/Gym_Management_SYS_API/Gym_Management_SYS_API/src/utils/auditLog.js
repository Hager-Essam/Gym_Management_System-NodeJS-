import { query } from '../config/database.js';

export const writeAuditLog = async ({ actorId, action, entityType, entityId = null, metadata = {} }) => {
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [actorId || null, action, entityType, entityId, JSON.stringify(metadata)]
  );
};
