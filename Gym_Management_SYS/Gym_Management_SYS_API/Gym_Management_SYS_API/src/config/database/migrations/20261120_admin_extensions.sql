BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly';
UPDATE subscriptions SET payment_frequency='monthly' WHERE payment_frequency IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='subscriptions_valid_frequency'
      AND conrelid='subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_valid_frequency
      CHECK (payment_frequency IN ('monthly','quarterly','annually'));
  END IF;
END $$;

ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS duration_value INTEGER;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(20);
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='membership_plans' AND column_name='duration'
    ) THEN
        UPDATE membership_plans
        SET duration_value = CASE
                WHEN duration = 'monthly' THEN 1
                WHEN duration = 'quarterly' THEN 3
                WHEN duration = 'annually' THEN 1
                ELSE COALESCE(duration_value, 1)
            END,
            duration_unit = CASE
                WHEN duration = 'monthly' THEN 'month'
                WHEN duration = 'quarterly' THEN 'month'
                WHEN duration = 'annually' THEN 'year'
                ELSE COALESCE(duration_unit, 'month')
            END
        WHERE duration_value IS NULL OR duration_unit IS NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS trainer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trainer_assignments_valid_status
    CHECK (status IN ('active','inactive','ended'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_assignments_active_unique
  ON trainer_assignments(member_id,trainer_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_trainer_assignments_member ON trainer_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_trainer_assignments_trainer ON trainer_assignments(trainer_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

COMMIT;
