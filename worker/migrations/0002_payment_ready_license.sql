PRAGMA defer_foreign_keys = ON;

-- Current v1 tables are still empty.
-- Old Sandbox data remains in licenses_legacy_20261001.

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS installations;
DROP TABLE IF EXISTS licenses;

-- ============================================================
-- LICENSES
-- ============================================================
--
-- A license is the actual PRO entitlement.
-- supabase_user_id is NULL until the user claims the
-- purchase through Supabase.
--
-- One license can therefore exist immediately after payment
-- even before the user completes recovery/account linking.
-- ============================================================

CREATE TABLE licenses (
    license_id TEXT PRIMARY KEY,

    supabase_user_id TEXT UNIQUE,

    customer_email TEXT,

    status TEXT NOT NULL
        CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),

    max_installations INTEGER NOT NULL DEFAULT 5,

    created_at INTEGER NOT NULL,

    activated_at INTEGER,

    last_verified_at INTEGER
);


-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE orders (
    order_id TEXT PRIMARY KEY,

    license_id TEXT NOT NULL,

    cashfree_payment_id TEXT UNIQUE,

    amount_paise INTEGER NOT NULL,

    currency TEXT NOT NULL DEFAULT 'INR',

    status TEXT NOT NULL
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),

    created_at INTEGER NOT NULL,

    paid_at INTEGER,

    FOREIGN KEY (license_id)
        REFERENCES licenses(license_id)
);


-- ============================================================
-- INSTALLATIONS
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

CREATE INDEX idx_licenses_customer_email
ON licenses(customer_email);