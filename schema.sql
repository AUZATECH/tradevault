-- TradeVault Database Schema
-- Run: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS tradevault CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tradevault;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  pair         VARCHAR(20)  NOT NULL,           -- EURUSD, VIX75, etc.
  trade_type   ENUM('buy','sell') NOT NULL,
  session      ENUM('London','New York','Asian') NULL,
  entry_price  DECIMAL(12,5) NOT NULL,
  exit_price   DECIMAL(12,5) NULL,
  stop_loss    DECIMAL(12,5) NULL,
  take_profit  DECIMAL(12,5) NULL,
  lot_size     DECIMAL(10,2) NULL,
  outcome      ENUM('win','loss','breakeven','running') NOT NULL DEFAULT 'running',
  pnl          DECIMAL(12,2) NULL,              -- Profit/Loss in USD
  risk_reward  DECIMAL(6,2) NULL,               -- Actual R:R achieved
  smc_tags     JSON NULL,                        -- ["OB","FVG","BOS"] etc.
  notes        TEXT NULL,
  chart_url    VARCHAR(500) NULL,
  trade_date   DATE NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date   (user_id, trade_date),
  INDEX idx_user_pair   (user_id, pair),
  INDEX idx_user_outcome (user_id, outcome)
);

-- Sample seed data (optional — comment out in production)
-- INSERT INTO users (username, email, password_hash) VALUES
-- ('solomon', 'solomon@auzatech.com', '$2a$12$placeholder_hash_here');
