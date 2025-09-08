-- VeilPix Database Schema for Supabase
-- Run this SQL in your Supabase SQL editor to create the required tables

-- Users table (extends Clerk user data)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    clerk_user_id VARCHAR(255), -- For easy lookups
    session_id VARCHAR(255), -- For anonymous users
    request_type VARCHAR(50) NOT NULL, -- 'retouch', 'filter', 'adjust'
    cost_usd DECIMAL(10,4) DEFAULT 0.04, -- Cost per request
    charged_amount_usd DECIMAL(10,4) DEFAULT 0.07, -- Amount charged to user
    gemini_request_id VARCHAR(255),
    image_size VARCHAR(20), -- 'small', 'medium', 'large'
    processing_time_ms INTEGER,
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing records table
CREATE TABLE IF NOT EXISTS billing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_invoice_id VARCHAR(255),
    billing_period_start TIMESTAMP WITH TIME ZONE,
    billing_period_end TIMESTAMP WITH TIME ZONE,
    total_requests INTEGER DEFAULT 0,
    total_amount_usd DECIMAL(10,2) DEFAULT 0,
    stripe_charge_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Free usage tracking for anonymous users
CREATE TABLE IF NOT EXISTS anonymous_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    ip_address INET,
    request_count INTEGER DEFAULT 0,
    last_request_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, ip_address)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_clerk_user_id ON usage_logs(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_id ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_billing_records_user_id ON billing_records(user_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_usage_session_id ON anonymous_usage(session_id);

-- RLS (Row Level Security) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Users can only see their own usage logs
CREATE POLICY "Users can view own usage" ON usage_logs
    FOR SELECT USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Users can only see their own billing records
CREATE POLICY "Users can view own billing" ON billing_records
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
    ));

-- Anonymous usage is accessible by session_id only
CREATE POLICY "Anonymous usage by session" ON anonymous_usage
    FOR ALL USING (session_id = current_setting('app.session_id', true));

-- Functions for common queries
CREATE OR REPLACE FUNCTION get_user_usage_count(p_clerk_user_id VARCHAR(255), p_period_start TIMESTAMP WITH TIME ZONE DEFAULT (NOW() - INTERVAL '1 month'))
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM usage_logs
        WHERE clerk_user_id = p_clerk_user_id
        AND created_at >= p_period_start
        AND success = true
    );
END;
$$ LANGUAGE plpgsql;