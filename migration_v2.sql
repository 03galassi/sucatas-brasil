-- Executar UMA ÚNICA VEZ no D1 existente: sucatas-brasil-db.
-- Não apaga nem recria as tabelas atuais.
CREATE TABLE IF NOT EXISTS shipments (
 id TEXT PRIMARY KEY,
 customer_name TEXT NOT NULL,
 customer_document TEXT,
 destination_state TEXT NOT NULL,
 destination_city TEXT,
 destination_address TEXT,
 vehicle TEXT,
 driver TEXT,
 freight_cost REAL NOT NULL DEFAULT 0 CHECK(freight_cost >= 0),
 sale_total REAL NOT NULL DEFAULT 0 CHECK(sale_total >= 0),
 status TEXT NOT NULL DEFAULT 'preparando' CHECK(status IN ('preparando','em_transito','entregue','cancelada')),
 notes TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shipment_items (
 id TEXT PRIMARY KEY,
 shipment_id TEXT NOT NULL REFERENCES shipments(id),
 origin_unit TEXT NOT NULL CHECK(origin_unit IN ('Sete Quedas','Jardim')),
 category TEXT NOT NULL CHECK(category IN ('sucata','reaproveitado','novo')),
 product TEXT NOT NULL,
 qty REAL NOT NULL CHECK(qty > 0),
 measure TEXT NOT NULL DEFAULT 'kg',
 price_unit REAL NOT NULL DEFAULT 0 CHECK(price_unit >= 0)
);
CREATE TABLE IF NOT EXISTS shipment_expenses (
 id TEXT PRIMARY KEY,
 shipment_id TEXT NOT NULL REFERENCES shipments(id),
 category TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount >= 0),
 notes TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shipments_status_created ON shipments(status,created_at);
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON shipment_items(shipment_id);
