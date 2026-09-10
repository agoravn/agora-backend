import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function saveTripToDatabase(tripId: string, customerId: string, driverId: number, price: number) {
  const query = `
    INSERT INTO trips (trip_id, customer_id, driver_id, price, status)
    VALUES ($1, $2, $3, $4, 'ACCEPTED')
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [tripId, customerId, driverId, price]);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Lỗi khi ghi chuyến đi vào DB:', error);
    throw error;
  }
}

// Hàm cập nhật trạng thái chuyến đi (Ví dụ: COMPLETED, CANCELLED)
export async function updateTripStatus(tripId: string, status: string) {
  const query = `
    UPDATE trips 
    SET status = $1 
    WHERE trip_id = $2 
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [status, tripId]);
    return result.rows[0];
  } catch (error) {
    console.error(`❌ Lỗi khi cập nhật trạng thái chuyến ${tripId}:`, error);
    throw error;
  }
}
// Hàm Thống kê số cuốc và Doanh thu trong ngày hôm nay
export async function getDailyStats() {
  const query = `
    SELECT 
      COUNT(id) as total_trips,
      COALESCE(SUM(price), 0) as total_revenue
    FROM trips
    WHERE status = 'COMPLETED' 
      AND DATE(created_at) = CURRENT_DATE;
  `;
  
  try {
    const result = await pool.query(query);
    return {
      totalTrips: parseInt(result.rows[0].total_trips),
      // Format tiền tệ cho đẹp mắt
      totalRevenue: parseInt(result.rows[0].total_revenue)
    };
  } catch (error) {
    console.error('❌ Lỗi khi lấy thống kê:', error);
    throw error;
  }
}