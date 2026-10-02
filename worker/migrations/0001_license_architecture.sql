PRAGMA defer_foreign_keys = on;

-- ============================================================
-- Preserve the old Sandbox-only schema.
-- ============================================================

ALTER TABLE licenses
RENAME TO licenses_legacy_20261001;


-- ============================================================
-- LICENSES
--
-- One PRO license belongs to one Supabase user.
-- One license can be connected to multiple installations.
-- ============================================================

CREATE TABLE licenses (
    license_id TEXT PRIMARY KEY,

    supabase_user_id TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL
        CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),

    max_installations INTEGER NOT NULL DEFAULT 5,

    created_at INTEGER NOT NULL,

    activated_at INTEGER,

    last_verified_at INTEGER
);


-- ============================================================
-- ORDERS
--
-- One license can have multiple payment/order attempts.
-- This keeps Cashfree payment history separate from ownership.
-- ============================================================

CREATE TABLE orders (
    order_id TEXT PRIMARY KEY,

    license_id TEXT NOT NULL,

    cashfree_payment_id TEXT UNIQUE,

    amount_paise INTEGER NOT NULL,

    currency TEXT NOT NULL DEFAULT 'INR',

    status TEXT NOT NULL,

    created_at INTEGER NOT NULL,

    paid_at INTEGER,

    FOREIGN KEY (license_id)
        REFERENCES licenses(license_id)
);


-- ============================================================
-- INSTALLATIONS
--
-- Every browser/profile installation gets its own random ID.
-- Multiple installations can belong to one license.
-- ============================================================

CREATE TABLE installations (
    installation_id TEXT PRIMARY KEY,

    license_id TEXT,

    created_at INTEGER NOT NULL,

    last_seen_at INTEGER,

    FOREIGN KEY (license_id)
        REFERENCES licenses(license_id)
        ON DELETE SET NULL
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_orders_license_id
ON orders(license_id);

CREATE INDEX idx_installations_license_id
ON installations(license_id);

CREATE INDEX idx_installations_last_seen_at
ON installations(last_seen_at);

CREATE INDEX idx_licenses_status
ON licenses(status);


-- ============================================================
-- DATABASE OPTIMIZATION
-- ============================================================

PRAGMA optimize;