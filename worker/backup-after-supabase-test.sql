PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "licenses_legacy_20261001" (installation_id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL, payment_id TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, activated_at INTEGER);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('test-installation-002','kgp_pro_1790799129037_ac6a3cae32ea',NULL,'PENDING',1790799129433,NULL);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation','kgp_pro_1790799512996_40cce693c50e',NULL,'PENDING',1790799513433,NULL);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation-001','kgp_pro_1790800777911_20f30a0bb3f74b53ae04251064920bbb',NULL,'PENDING',1790800778348,NULL);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation-002','kgp_pro_1790801142061_f3b2ff7a39e04083bd2f038828011226','1458924807533673472','ACTIVE',1790801142454,1790801200117);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation-003','kgp_pro_1790804987743_d33fca3a74c74ea6bdb27046ffebe0bb','1458940952978906624','ACTIVE',1790804988267,1790805047355);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation-004','kgp_pro_1790806070833_f301a04d3a224b93a4c21ef3cd9b25cf','1458945485234757120','ACTIVE',1790806072671,1790806130112);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('checkout-test-installation-005','kgp_pro_1790806617657_91d95a867e134192b441617d67d9a00c','1458947685100600320','ACTIVE',1790806618662,1790806650218);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('kgp_install_c6aec2ba-6486-424c-8e2f-16468288c9e1','kgp_pro_1790807017855_d11b4920dc1d4f579efefa78a5761db9','1458949340793715712','ACTIVE',1790807018680,1790807046752);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('kgp_install_330c49e9-f37a-4920-878f-07a9882b335b','kgp_pro_1790808210459_05148200270a47a995e7eb17cbbc751b','1458954346180107776','ACTIVE',1790808211054,1790808281710);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('kgp_install_8bfb520c-8234-4ada-b726-b39c291dbd5e','kgp_pro_1790808397285_8490a33a23a140119823b0ecf55d836f','1458955276589513728','ACTIVE',1790808398057,1790808464668);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('kgp_install_7dfc77c9-21b9-49bf-8635-11e95ee44e30','kgp_pro_1790858928457_7902850a8ce949f7998af580c5559f34','1459167051078949888','ACTIVE',1790858929234,1790858965409);
INSERT INTO "licenses_legacy_20261001" ("installation_id","order_id","payment_id","status","created_at","activated_at") VALUES('kgp_install_9b199d2e-e638-4ca6-b44b-8528694ec061','kgp_pro_1790859476834_ee3288ab6b8e462b9eb6e86ece40088b','1459169361647005184','ACTIVE',1790859477554,1790859505837);
ANALYZE sqlite_schema;
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('_cf_KV','_cf_KV','2 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('licenses_legacy_20261001','sqlite_autoindex_licenses_legacy_20261001_2','12 1');
INSERT INTO "sqlite_stat1" ("tbl","idx","stat") VALUES('licenses_legacy_20261001','sqlite_autoindex_licenses_legacy_20261001_1','12 1');
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
INSERT INTO "licenses" ("license_id","supabase_user_id","customer_email","status","max_installations","created_at","activated_at","last_verified_at") VALUES('lic_a5ea91f1ecf84f7586a165beeb31386a',NULL,'adhithyashivakumar2511@gmail.com','ACTIVE',5,1790870979988,1790871543098,NULL);
INSERT INTO "licenses" ("license_id","supabase_user_id","customer_email","status","max_installations","created_at","activated_at","last_verified_at") VALUES('lic_c7e04bb112554632bda61f43e79c3958',NULL,'adsads@example.com','ACTIVE',5,1790871560716,1790871587929,NULL);
INSERT INTO "licenses" ("license_id","supabase_user_id","customer_email","status","max_installations","created_at","activated_at","last_verified_at") VALUES('lic_42207ed06f1a4ce39a93fd8957b2bbb5','b98324ce-6dae-4cca-a0a5-69176f519c5a','adhithyashivakumar2511@gmail.com','ACTIVE',5,1790876378199,1790876432923,1790876876156);
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
INSERT INTO "orders" ("order_id","license_id","cashfree_payment_id","amount_paise","currency","status","created_at","paid_at") VALUES('kgp_pro_1790870980666_107d5872195f40449953545c0d9a33a6','lic_a5ea91f1ecf84f7586a165beeb31386a','1459217775537801728',100,'INR','PAID',1790870980666,1790871543098);
INSERT INTO "orders" ("order_id","license_id","cashfree_payment_id","amount_paise","currency","status","created_at","paid_at") VALUES('kgp_pro_1790870986306_c7ad2fbfe6b14375b512fadb07edd902','lic_a5ea91f1ecf84f7586a165beeb31386a',NULL,100,'INR','PENDING',1790870986307,NULL);
INSERT INTO "orders" ("order_id","license_id","cashfree_payment_id","amount_paise","currency","status","created_at","paid_at") VALUES('kgp_pro_1790871561041_a89b1f99c75b4454ac072e4f2db09b92','lic_c7e04bb112554632bda61f43e79c3958','1459220071170932224',100,'INR','PAID',1790871561041,1790871597964);
INSERT INTO "orders" ("order_id","license_id","cashfree_payment_id","amount_paise","currency","status","created_at","paid_at") VALUES('kgp_pro_1790871564721_5e87c1e05d5f4a39a368c8b298841be3','lic_c7e04bb112554632bda61f43e79c3958',NULL,100,'INR','PENDING',1790871564721,NULL);
INSERT INTO "orders" ("order_id","license_id","cashfree_payment_id","amount_paise","currency","status","created_at","paid_at") VALUES('kgp_pro_1790876378673_572ae3c2f68e4590964884f27672d961','lic_42207ed06f1a4ce39a93fd8957b2bbb5','1459240249485131264',100,'INR','PAID',1790876378673,1790876445506);
CREATE TABLE installations (
    installation_id TEXT PRIMARY KEY,

    license_id TEXT,

    created_at INTEGER NOT NULL,

    last_seen_at INTEGER,

    FOREIGN KEY (license_id)
        REFERENCES licenses(license_id)
        ON DELETE SET NULL
);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('checkout-test-installation-006','lic_a5ea91f1ecf84f7586a165beeb31386a',1790870980328,1790870980328);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('checkout-test-installation-008','lic_c7e04bb112554632bda61f43e79c3958',1790871560871,1790871560871);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('kgp_install_913569c0-8359-40ab-97b7-51bc9c80048a','lic_42207ed06f1a4ce39a93fd8957b2bbb5',1790876378361,1790876443809);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('kgp_install_34d8bc03-c485-4de1-92f0-230e3659a2b0','lic_42207ed06f1a4ce39a93fd8957b2bbb5',1790876606271,1790876607637);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('kgp_install_2271e002-4a99-4081-a088-71766dd98e18','lic_42207ed06f1a4ce39a93fd8957b2bbb5',1790876740165,1790876741533);
INSERT INTO "installations" ("installation_id","license_id","created_at","last_seen_at") VALUES('kgp_install_304b3013-555e-475f-a8cc-c878cc7dc04c','lic_42207ed06f1a4ce39a93fd8957b2bbb5',1790876874809,1790876876156);
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
