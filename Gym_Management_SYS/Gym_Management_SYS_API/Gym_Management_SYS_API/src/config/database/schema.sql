-- ============================================================
-- IronForge Gym Management System
-- Member Flow Database Schema
-- PostgreSQL 13+
--
-- Includes:
--   users, member_profiles, membership_plans, subscriptions,
--   payments, attendance, classes, class_schedules,
--   class_bookings, notifications
--
-- IMPORTANT:
--   1. Run this in a NEW/empty database for the cleanest setup.
--   2. Public registration must always create role = 'member'
--      in the backend. Never trust a role sent by the client.
--   3. Activate a subscription in the backend only after payment
--      has been verified (or after staff confirms a cash payment).
-- ============================================================

BEGIN;

-- gen_random_uuid() is built into supported modern PostgreSQL versions.
-- No UUID extension is required.

-- ============================================================
-- 1. USERS
-- Shared authentication/account table for all roles.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role VARCHAR(20) NOT NULL DEFAULT 'member',
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    phone VARCHAR(20),
    address TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    profile_picture_url TEXT,

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verification_token_hash VARCHAR(255),

    password_reset_token_hash VARCHAR(255),
    password_reset_expires_at TIMESTAMPTZ,

    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,

    CONSTRAINT users_valid_role
        CHECK (role IN ('member', 'trainer', 'manager', 'admin')),

    CONSTRAINT users_valid_status
        CHECK (status IN ('active', 'inactive', 'suspended')),

    CONSTRAINT users_valid_gender
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'))
);

-- Case-insensitive unique email for non-deleted accounts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active_unique
    ON users (LOWER(email))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);


-- ============================================================
-- 2. MEMBER PROFILES
-- Member-only information. One profile per member account.
-- ============================================================

CREATE TABLE IF NOT EXISTS member_profiles (
    user_id UUID PRIMARY KEY
        REFERENCES users(id) ON DELETE CASCADE,

    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(20),

    fitness_goal VARCHAR(100),
    activity_level VARCHAR(30),

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT member_profiles_valid_activity_level
        CHECK (
            activity_level IS NULL OR
            activity_level IN ('beginner', 'intermediate', 'advanced')
        )
);


-- ============================================================
-- 3. MEMBERSHIP PLANS
-- Plans displayed to members and managed by authorized staff.
-- ============================================================

CREATE TABLE IF NOT EXISTS membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    price NUMERIC(10, 2) NOT NULL,
    duration_value INTEGER NOT NULL,
    duration_unit VARCHAR(20) NOT NULL,

    access_level VARCHAR(20) NOT NULL DEFAULT 'basic',
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_classes INTEGER,
    includes_personal_training BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,

    CONSTRAINT membership_plans_nonnegative_price
        CHECK (price >= 0),

    CONSTRAINT membership_plans_positive_duration
        CHECK (duration_value > 0),

    CONSTRAINT membership_plans_valid_duration_unit
        CHECK (duration_unit IN ('day', 'week', 'month', 'year')),

    CONSTRAINT membership_plans_valid_access_level
        CHECK (access_level IN ('basic', 'premium', 'vip')),

    CONSTRAINT membership_plans_nonnegative_max_classes
        CHECK (max_classes IS NULL OR max_classes >= 0),

    CONSTRAINT membership_plans_features_is_array
        CHECK (jsonb_typeof(features) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_plans_name_unique
    ON membership_plans (LOWER(name))
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_membership_plans_available
    ON membership_plans (is_active, is_visible)
    WHERE deleted_at IS NULL;


-- ============================================================
-- 4. SUBSCRIPTIONS
-- A member can have subscription history.
-- Only one active subscription per member is allowed.
-- amount stores the price at the time of purchase.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    plan_id UUID NOT NULL
        REFERENCES membership_plans(id) ON DELETE RESTRICT,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EGP',

    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,

    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    paused_at TIMESTAMPTZ,
    resume_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,

    CONSTRAINT subscriptions_valid_status
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'paused')),

    CONSTRAINT subscriptions_valid_dates
        CHECK (end_date >= start_date),

    CONSTRAINT subscriptions_nonnegative_amount
        CHECK (amount >= 0),

    CONSTRAINT subscriptions_valid_currency
        CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
    ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
    ON subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date
    ON subscriptions(end_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_subscription_per_member
    ON subscriptions(user_id)
    WHERE status = 'active' AND deleted_at IS NULL;


-- ============================================================
-- 5. PAYMENTS
-- One subscription may have multiple payment attempts.
-- Do not store card numbers, CVVs, or other sensitive card data.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    subscription_id UUID
        REFERENCES subscriptions(id) ON DELETE RESTRICT,

    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EGP',

    payment_method VARCHAR(30) NOT NULL,
    payment_type VARCHAR(30) NOT NULL DEFAULT 'subscription',

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    transaction_id VARCHAR(255),
    payment_gateway VARCHAR(50),
    gateway_response JSONB,

    receipt_url TEXT,
    invoice_number VARCHAR(100),

    refunded_at TIMESTAMPTZ,
    refund_amount NUMERIC(10, 2),
    refund_reason TEXT,

    description TEXT,
    metadata JSONB,

    processed_by UUID
        REFERENCES users(id) ON DELETE SET NULL,

    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payments_positive_amount
        CHECK (amount > 0),

    CONSTRAINT payments_valid_currency
        CHECK (currency ~ '^[A-Z]{3}$'),

    CONSTRAINT payments_valid_method
        CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'wallet')),

    CONSTRAINT payments_valid_type
        CHECK (payment_type IN ('subscription', 'session', 'product', 'other')),

    CONSTRAINT payments_valid_status
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),

    CONSTRAINT payments_valid_refund
        CHECK (
            refund_amount IS NULL OR
            (refund_amount >= 0 AND refund_amount <= amount)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_id_unique
    ON payments(transaction_id)
    WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_invoice_number_unique
    ON payments(invoice_number)
    WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);


-- ============================================================
-- 6. ATTENDANCE
-- A member may have only one open visit at a time.
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    check_in_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMPTZ,

    location VARCHAR(100) NOT NULL DEFAULT 'Main Gate',

    access_granted BOOLEAN NOT NULL DEFAULT TRUE,
    denial_reason TEXT,

    checked_in_by UUID
        REFERENCES users(id) ON DELETE SET NULL,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT attendance_valid_checkout
        CHECK (check_out_time IS NULL OR check_out_time >= check_in_time)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in_time
    ON attendance(check_in_time DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_open_per_member
    ON attendance(user_id)
    WHERE check_out_time IS NULL;


-- ============================================================
-- 7. CLASSES
-- Class definitions, e.g. Yoga, HIIT, Spinning.
-- ============================================================

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(150) NOT NULL,
    description TEXT,
    class_type VARCHAR(100),
    difficulty_level VARCHAR(30),

    duration_minutes INTEGER NOT NULL,
    capacity INTEGER NOT NULL,

    room VARCHAR(100),
    required_plan_level VARCHAR(20),

    requires_booking BOOLEAN NOT NULL DEFAULT TRUE,
    booking_deadline_hours INTEGER NOT NULL DEFAULT 2,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,

    CONSTRAINT classes_positive_duration
        CHECK (duration_minutes > 0),

    CONSTRAINT classes_positive_capacity
        CHECK (capacity > 0),

    CONSTRAINT classes_nonnegative_booking_deadline
        CHECK (booking_deadline_hours >= 0),

    CONSTRAINT classes_valid_difficulty
        CHECK (
            difficulty_level IS NULL OR
            difficulty_level IN ('beginner', 'intermediate', 'advanced')
        ),

    CONSTRAINT classes_valid_plan_level
        CHECK (
            required_plan_level IS NULL OR
            required_plan_level IN ('basic', 'premium', 'vip')
        )
);

CREATE INDEX IF NOT EXISTS idx_classes_active
    ON classes(is_active)
    WHERE deleted_at IS NULL;


-- ============================================================
-- 8. CLASS SCHEDULES
-- A class can have many scheduled sessions.
-- ============================================================

CREATE TABLE IF NOT EXISTS class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    class_id UUID NOT NULL
        REFERENCES classes(id) ON DELETE RESTRICT,

    trainer_id UUID
        REFERENCES users(id) ON DELETE SET NULL,

    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    cancellation_reason TEXT,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT class_schedules_valid_status
        CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),

    CONSTRAINT class_schedules_valid_times
        CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_class_schedules_class_id
    ON class_schedules(class_id);

CREATE INDEX IF NOT EXISTS idx_class_schedules_trainer_id
    ON class_schedules(trainer_id);

CREATE INDEX IF NOT EXISTS idx_class_schedules_date
    ON class_schedules(scheduled_date);


-- ============================================================
-- 9. CLASS BOOKINGS
-- booking_status is the single source of truth for booking state.
-- Waitlisted bookings use status = 'waitlisted'.
-- ============================================================

CREATE TABLE IF NOT EXISTS class_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    schedule_id UUID NOT NULL
        REFERENCES class_schedules(id) ON DELETE RESTRICT,

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    booking_status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    waitlist_position INTEGER,

    attended_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT class_bookings_valid_status
        CHECK (
            booking_status IN (
                'confirmed',
                'waitlisted',
                'cancelled',
                'attended',
                'no_show'
            )
        ),

    CONSTRAINT class_bookings_valid_waitlist_position
        CHECK (
            (booking_status = 'waitlisted' AND waitlist_position IS NOT NULL
                AND waitlist_position > 0)
            OR
            (booking_status <> 'waitlisted' AND waitlist_position IS NULL)
        ),

    CONSTRAINT class_bookings_unique_user_schedule
        UNIQUE (schedule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_bookings_user_id
    ON class_bookings(user_id);

CREATE INDEX IF NOT EXISTS idx_class_bookings_schedule_id
    ON class_bookings(schedule_id);

CREATE INDEX IF NOT EXISTS idx_class_bookings_status
    ON class_bookings(booking_status);


-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    notification_type VARCHAR(30) NOT NULL DEFAULT 'info',

    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    action_url TEXT,
    action_text VARCHAR(100),

    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,

    CONSTRAINT notifications_valid_type
        CHECK (
            notification_type IN ('info', 'warning', 'success', 'error', 'reminder')
        ),

    CONSTRAINT notifications_valid_priority
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    CONSTRAINT notifications_valid_read_state
        CHECK (
            (is_read = FALSE AND read_at IS NULL)
            OR
            (is_read = TRUE AND read_at IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(user_id, created_at DESC)
    WHERE is_read = FALSE;


-- ============================================================
-- 11. UPDATED_AT TRIGGER
-- Automatically refreshes updated_at on updates.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users',
        'member_profiles',
        'membership_plans',
        'subscriptions',
        'payments',
        'attendance',
        'classes',
        'class_schedules',
        'class_bookings'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I',
            table_name,
            table_name
        );

        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            table_name,
            table_name
        );
    END LOOP;
END;
$$;


-- ============================================================
-- 12. VERIFICATION
-- ============================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

COMMIT;

-- ============================================================
-- IMPLEMENTATION NOTES
--
-- 1. Create users + member_profiles in one DB transaction during
--    member registration.
--
-- 2. Calculate subscription end_date in the backend based on the
--    selected plan's duration_value and duration_unit.
--
-- 3. Create a subscription as 'pending' first.
--
-- 4. Verify payment on the backend. Only then mark the payment
--    'completed' and subscription 'active', ideally in one DB
--    transaction.
--
-- 5. For cash payments, activate only after authorized staff
--    confirms receipt.
--
-- 6. Enforce role checks in backend middleware/services:
--    users.role = 'member' for member-only actions.
--
-- 7. Enforce that class_schedules.trainer_id references a user
--    whose role is 'trainer' in backend logic (or with a dedicated
--    database trigger if strict DB-level enforcement is required).
--
-- 8. Enforce that attendance.user_id and class_bookings.user_id
--    belong to members, and that payment.user_id matches the
--    subscription's user_id, in backend logic or DB triggers.
--
-- 9. Class capacity and waitlist position must be managed with
--    transactions/locking to prevent overbooking under concurrency.
--
-- 10. The unique booking constraint intentionally preserves one
--     booking record per member per schedule, including cancelled
--     bookings. If you want re-booking after cancellation, implement
--     a reactivation/update flow rather than inserting another row.
-- ============================================================
