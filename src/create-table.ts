import { Pool } from 'pg';
import dotenv from 'dotenv';

// Nạp biến môi trường để lấy DATABASE_URL
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      trip_id VARCHAR(50) UNIQUE NOT NULL,
      customer_id VARCHAR(50) NOT NULL,
      driver_id INT REFERENCES drivers(id),
      price INT NOT NULL,
      status VARCHAR(20) DEFAULT 'ACCEPTED',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// Thực thi lệnh tạo bảng
pool.query(createTableQuery)
  .then(() => {
    console.log('✅ TUYỆT VỜI! Đã tạo bảng "trips" thành công trong PostgreSQL!');
    process.exit(0); // Tự động thoát khi xong
  })
  .catch((err) => {
    console.error('❌ Lỗi khi tạo bảng:', err);
    process.exit(1);
  });