-- IronForge Gym Management System - Database Schema
-- PostgreSQL Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if exists (for development only)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS class_bookings CASCADE;
DROP TABLE IF EXISTS class_schedules CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS membership_plans CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    
    -- Contact Information
    phone VARCHAR(20),
    address TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    emergency_contact VARCHAR(255),
    
    -- Profile
    profile_picture_url TEXT,
    bio TEXT,
    
    -- Trainer Specific
    specializations TEXT[],
    certifications TEXT[],
    hourly_rate DECIMAL(10, 2),
    
    -- Manager Specific
    position VARCHAR(100),
    department VARCHAR(100),
    
    -- Status Management
    suspended_at TIMESTAMP,
    suspension_reason TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    
    -- Password Reset
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_role CHECK (role IN ('member', 'coach', 'manager', 'admin')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'inactive')),
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- 2. MEMBERSHIP PLANS TABLE
CREATE TABLE membership_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tier VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    
    -- Features
    features JSONB,
    access_level VARCHAR(50) NOT NULL,
    max_classes INT,
    includes_personal_training BOOLEAN DEFAULT FALSE,
    includes_sauna BOOLEAN DEFAULT FALSE,
    includes_pool BOOLEAN DEFAULT FALSE,
    
    -- Business
    setup_fee DECIMAL(10, 2) DEFAULT 0,
    cancellation_fee DECIMAL(10, 2) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    display_order INT DEFAULT 0,
    color_code VARCHAR(7),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_duration CHECK (duration IN ('monthly', 'quarterly', 'annually')),
    CONSTRAINT valid_access_level CHECK (access_level IN ('basic', 'premium', 'vip')),
    CONSTRAINT positive_price CHECK (price >= 0)
);

-- 3. SUBSCRIPTIONS TABLE
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
    
    -- Subscription Details
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    
    -- Payment
    payment_method VARCHAR(50) NOT NULL,
    payment_frequency VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    
    -- Auto-renewal
    auto_renew BOOLEAN DEFAULT TRUE,
    next_billing_date DATE,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    
    -- Pause/Resume
    paused_at TIMESTAMP,
    pause_reason TEXT,
    resume_date DATE,
    
    -- Proration
    prorated_amount DECIMAL(10, 2),
    proration_details JSONB,
    
    -- Notes
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'cancelled', 'paused', 'pending')),
    CONSTRAINT valid_payment_method CHECK (payment_method IN ('card', 'cash', 'bank_transfer', 'paypal')),
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- 4. PAYMENTS TABLE
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    
    -- Payment Details
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,
    
    -- Transaction
    transaction_id VARCHAR(255) UNIQUE,
    payment_gateway VARCHAR(50),
    gateway_response JSONB,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Receipt
    receipt_url TEXT,
    invoice_number VARCHAR(100) UNIQUE,
    
    -- Refund
    refunded_at TIMESTAMP,
    refund_amount DECIMAL(10, 2),
    refund_reason TEXT,
    
    -- Metadata
    description TEXT,
    metadata JSONB,
    processed_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
    CONSTRAINT valid_payment_type CHECK (payment_type IN ('subscription', 'session', 'product', 'other')),
    CONSTRAINT positive_amount CHECK (amount > 0)
);

-- 5. ATTENDANCE TABLE
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Check-in/out
    check_in_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP,
    
    -- Location
    location VARCHAR(100) DEFAULT 'Main Gate',
    entry_point VARCHAR(100),
    
    -- Validation
    subscription_valid BOOLEAN DEFAULT TRUE,
    access_granted BOOLEAN DEFAULT TRUE,
    denial_reason TEXT,
    
    -- Session Details
    duration_minutes INT GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (check_out_time - check_in_time)) / 60
    ) STORED,
    
    -- Metadata
    notes TEXT,
    checked_in_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_checkout CHECK (check_out_time IS NULL OR check_out_time >= check_in_time)
);

-- 6. CLASSES TABLE
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Class Details
    class_type VARCHAR(100),
    difficulty_level VARCHAR(50),
    duration_minutes INT NOT NULL,
    capacity INT NOT NULL,
    
    -- Location
    room VARCHAR(100),
    
    -- Requirements
    required_plan_level VARCHAR(50),
    requires_booking BOOLEAN DEFAULT TRUE,
    booking_deadline_hours INT DEFAULT 2,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    image_url TEXT,
    color_code VARCHAR(7),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT positive_capacity CHECK (capacity > 0),
    CONSTRAINT positive_duration CHECK (duration_minutes > 0)
);

-- 7. CLASS SCHEDULES TABLE
CREATE TABLE class_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Schedule
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    cancellation_reason TEXT,
    
    -- Capacity
    current_bookings INT DEFAULT 0,
    waitlist_count INT DEFAULT 0,
    
    -- Metadata
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_times CHECK (end_time > start_time),
    CONSTRAINT non_negative_bookings CHECK (current_bookings >= 0)
);

-- 8. CLASS BOOKINGS TABLE
CREATE TABLE class_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Booking Details
    booking_status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    is_waitlist BOOLEAN DEFAULT FALSE,
    waitlist_position INT,
    
    -- Attendance
    attended BOOLEAN,
    check_in_time TIMESTAMP,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    late_cancellation BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_booking_status CHECK (booking_status IN ('confirmed', 'cancelled', 'no_show')),
    CONSTRAINT unique_booking UNIQUE (schedule_id, user_id)
);

-- 9. NOTIFICATIONS TABLE
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification Content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    -- Actions
    action_url TEXT,
    action_text VARCHAR(100),
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'normal',
    
    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_type CHECK (notification_type IN ('info', 'warning', 'success', 'error', 'reminder')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

-- 10. AUDIT LOGS TABLE
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(50),
    
    -- Action
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- Request Details
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_method VARCHAR(10),
    request_url TEXT,
    
    -- Metadata
    description TEXT,
    severity VARCHAR(20) DEFAULT 'info',
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- CREATE INDEXES
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_plans_active ON membership_plans(is_active);
CREATE INDEX idx_plans_duration ON membership_plans(duration);
CREATE INDEX idx_plans_price ON membership_plans(price);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

CREATE INDEX idx_attendance_user_id ON attendance(user_id);
CREATE INDEX idx_attendance_check_in ON attendance(check_in_time);
CREATE INDEX idx_attendance_date ON attendance(DATE(check_in_time));

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- CREATE TRIGGER FUNCTION FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- APPLY TRIGGERS TO TABLES
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_membership_plans_updated_at BEFORE UPDATE ON membership_plans
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_schedules_updated_at BEFORE UPDATE ON class_schedules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_bookings_updated_at BEFORE UPDATE ON class_bookings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
