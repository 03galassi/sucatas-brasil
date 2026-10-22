PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','gerente','vendedor')),
 unit TEXT NOT NULL CHECK(unit IN ('Sete Quedas','Jardim')), active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock (
 id INTEGER PRIMARY KEY AUTOINCREMENT, unit TEXT NOT NULL CHECK(unit IN ('Sete Quedas','Jardim')),
 category TEXT NOT NULL CHECK(category IN ('sucata','reaproveitado','novo')), product TEXT NOT NULL,
 measure TEXT NOT NULL DEFAULT 'kg', quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(unit,category,product,measure)
);
CREATE TABLE IF NOT EXISTS purchases (
 id TEXT PRIMARY KEY, unit TEXT NOT NULL, seller TEXT NOT NULL, material TEXT NOT NULL,
 gross REAL NOT NULL, tare REAL NOT NULL, net REAL NOT NULL, price_kg REAL NOT NULL, total REAL NOT NULL,
 payment TEXT NOT NULL, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sales (
 id TEXT PRIMARY KEY, unit TEXT NOT NULL, category TEXT NOT NULL, product TEXT NOT NULL, qty REAL NOT NULL,
 measure TEXT NOT NULL, price REAL NOT NULL, total REAL NOT NULL, payment TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cash_movements (
 id TEXT PRIMARY KEY, unit TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('entrada','saida')),
 category TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0), payment TEXT NOT NULL, description TEXT NOT NULL,
 source_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transfers (
 id TEXT PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL, category TEXT NOT NULL, product TEXT NOT NULL,
 qty REAL NOT NULL, measure TEXT NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'em_transito'
 CHECK(status IN ('em_transito','recebida')), created_by TEXT NOT NULL, received_by TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, received_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, unit TEXT NOT NULL, action TEXT NOT NULL,
 entity_id TEXT, summary TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_unit ON stock(unit,category);
CREATE INDEX IF NOT EXISTS idx_cash_unit_created ON cash_movements(unit,created_at);
