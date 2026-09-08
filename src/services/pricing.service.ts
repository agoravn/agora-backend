import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Khởi tạo kết nối DB riêng cho service này
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface PricingParams {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  // ĐÃ ĐỒNG BỘ: Đổi 'BIKE' thành 'MOTORBIKE' để khớp với Frontend & Database
  serviceType: 'MOTORBIKE' | 'CAR' | 'DELIVERY'; 
}

export async function calculateDynamicFloorPrice(params: PricingParams) {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, serviceType } = params;

  // 1. Dùng PostGIS tính khoảng cách (đơn vị: mét)
  const distanceQuery = `
    SELECT ST_Distance(
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
    ) AS distance_meters;
  `;
  
  const result = await pool.query(distanceQuery, [pickupLng, pickupLat, dropoffLng, dropoffLat]);
  const distanceMeters = result.rows[0].distance_meters;
  const distanceKm = distanceMeters / 1000;

  // 2. Tính giá chuẩn theo công thức (Thị trường Đà Nẵng)
  let standardPrice = 0;
  
  // ĐÃ ĐỒNG BỘ: Đổi 'BIKE' thành 'MOTORBIKE'
  if (serviceType === 'MOTORBIKE' || serviceType === 'DELIVERY') {
    const baseFare = 12000; // 12k cho 2km đầu
    const perKmRate = 4500; // 4.5k/km tiếp theo
    standardPrice = distanceKm <= 2 ? baseFare : baseFare + (distanceKm - 2) * perKmRate;
  } else if (serviceType === 'CAR') {
    const baseFare = 25000; // Ô tô 25k cho 2km đầu
    const perKmRate = 12000; 
    standardPrice = distanceKm <= 2 ? baseFare : baseFare + (distanceKm - 2) * perKmRate;
  }

  // 3. Chốt giá sàn (Floor Price) = 80% giá chuẩn, làm tròn đến nghìn đồng
  const floorPrice = Math.round((standardPrice * 0.8) / 1000) * 1000;

  return {
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    standardPrice: Math.round(standardPrice / 1000) * 1000,
    floorPrice
  };
}