-- ImageFlow D1 Database Schema

CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    upload_time TEXT NOT NULL,
    expiry_time TEXT,
    orientation TEXT NOT NULL CHECK (orientation IN ('landscape', 'portrait')),
    format TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    path_original TEXT NOT NULL,
    path_webp TEXT,
    path_avif TEXT,
    size_original INTEGER NOT NULL,
    size_webp INTEGER DEFAULT 0,
    size_avif INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_images_orientation ON images(orientation);
CREATE INDEX IF NOT EXISTS idx_images_upload_time ON images(upload_time DESC);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS image_tags (
    image_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (image_id, tag_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
