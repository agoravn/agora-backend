import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function findNearbyDrivers(lat: number, lng: number, radiusMeters: number = 5000) {
  // PostGIS: Quét các tài xế đang online, rảnh việc trong bán kính 5km
  const query = `
    SELECT 
      id,
      full_name,
      vehicle_type,
      ST_Distance(
        current_location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_meters
    FROM drivers
    WHERE is_online = true 
      AND status = 'AVAILABLE'
      AND ST_DWithin(
        current_location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_meters ASC
    LIMIT 10;
  `;

  // ST_MakePoint yêu cầu (Kinh độ/Lng, Vĩ độ/Lat)
  const result = await pool.query(query, [lng, lat, radiusMeters]);
  return result.rows;
}