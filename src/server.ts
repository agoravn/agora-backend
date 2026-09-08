import { saveTripToDatabase, updateTripStatus } from './services/trip.service';
import { findNearbyDrivers } from './services/driver.service';
import { calculateDynamicFloorPrice } from './services/pricing.service';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

// 1. KHỞI TẠO ỨNG DỤNG & SERVER
const app = express();
const httpServer = createServer(app);

// Cấu hình Middleware
app.use(cors());
app.use(express.json());

// Báo cho Express biết thư mục public chứa Giao diện Web
app.use(express.static('public'));

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// BẢN ĐỒ LƯU TRỮ TÀI XẾ ĐANG MỞ APP
// Giúp Server biết tài xế nào đang dùng Socket ID nào để bắn cuốc cho chuẩn
const activeDrivers = new Map<number, string>();

// 2. KẾT NỐI HẠ TẦNG (Database & Cache)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

pool.connect().catch((err) => console.error('❌ Lỗi PostgreSQL:', err.message));
redis.on('error', (err) => console.error('❌ Lỗi Redis:', err.message));

// 3. API TEST CƠ BẢN
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Agora Backend Core đang hoạt động tốt!' 
  });
});

// ==========================================
// API KHỞI TẠO CHUYẾN ĐI & BẮN CUỐC (SOCKET)
// ==========================================
app.post('/api/trips/bidding', async (req, res): Promise<void> => {
  try {
    const { customerId, suggestedPrice, serviceType, pickupLocation, dropoffLocation } = req.body;

    const pricingData = await calculateDynamicFloorPrice({
      pickupLat: pickupLocation.lat,
      pickupLng: pickupLocation.lng,
      dropoffLat: dropoffLocation.lat,
      dropoffLng: dropoffLocation.lng,
      serviceType
    });

    if (suggestedPrice < pricingData.floorPrice) {
      res.status(400).json({
        success: false,
        message: `Giá đề xuất quá thấp. Yêu cầu giá sàn tối thiểu là ${pricingData.floorPrice}đ.`
      });
      return; 
    }

    const tripId = `trip_${Date.now()}`;
    await redis.set(`trip:${tripId}:floor_price`, pricingData.floorPrice, 'EX', 300);
    
    // Quét tìm tài xế bằng PostGIS
    const nearbyDrivers = await findNearbyDrivers(pickupLocation.lat, pickupLocation.lng, 5000);

    // BẮN TÍN HIỆU SOCKET ĐẾN CÁC TÀI XẾ VỪA TÌM THẤY
    nearbyDrivers.forEach((driver: any) => {
      // Kiểm tra xem tài xế này có đang bật app không?
      const driverSocketId = activeDrivers.get(driver.id);
      
      if (driverSocketId) {
        // Gửi thông báo cuốc xe riêng cho Socket ID của tài xế này
        io.to(driverSocketId).emit('new_bidding_trip', {
          customerId,
          tripId,
          suggestedPrice,
          distanceKm: pricingData.distanceKm,
          pickupLocation,
          dropoffLocation
        });
        console.log(`📡 Đã bắn cuốc ${tripId} tới Tài xế [ID: ${driver.id} - ${driver.full_name}]`);
      }
    });
	// Trả về kết quả cho Frontend
    res.status(201).json({ 
      success: true, 
      tripId, 
      distanceKm: pricingData.distanceKm,
      floorPrice: pricingData.floorPrice,
      driversFound: nearbyDrivers.length,
      drivers: nearbyDrivers, // Trả về danh sách để bạn dễ test
      message: 'Khởi tạo phiên đấu giá thành công! Đã quét tài xế.'
    });

  } catch (error) {
    console.error('❌ Lỗi xử lý chuyến đi:', error);
    res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
});

// BẢN ĐỒ LƯU TRỮ KHÁCH HÀNG (Thêm cái này ở trên cùng với activeDrivers)
const activeCustomers = new Map<string, string>();

// 4. LUỒNG WEBSOCKET LẮNG NGHE TÀI XẾ & KHÁCH HÀNG
io.on('connection', (socket) => {
  // --- TÀI XẾ BÁO DANH ---
  socket.on('register_driver', (driverId: number) => {
    activeDrivers.set(driverId, socket.id);
    console.log(`🚕 Tài xế [ID: ${driverId}] đã BẬT APP.`);
  });

  // --- KHÁCH HÀNG MỞ WEB ĐẶT XE ---
  socket.on('register_customer', (customerId: string) => {
    activeCustomers.set(customerId, socket.id);
    console.log(`👤 Khách hàng [ID: ${customerId}] đang trực tuyến.`);
  });


  // --- TÀI XẾ BẤM NHẬN CUỐC ---
  socket.on('accept_trip', async (data: { tripId: string, driverId: number, customerId: string }) => {
    console.log(`✅ Tài xế [ID: ${data.driverId}] VỪA CHỐT NHẬN CUỐC ${data.tripId}`);

    // 1. Lấy giá tiền từ Redis ra trước khi xóa (để biết cước phí lưu vào DB)
    const priceStr = await redis.get(`trip:${data.tripId}:floor_price`);
    const finalPrice = priceStr ? parseInt(priceStr) : 0;

    // 2. Xóa chuyến khỏi Redis (Khóa chuyến, chặn tài xế khác)
    await redis.del(`trip:${data.tripId}:floor_price`);

    // 3. GHI LỊCH SỬ VÀO POSTGRESQL
    try {
      await saveTripToDatabase(data.tripId, data.customerId, data.driverId, finalPrice);
      console.log(`💾 Đã lưu vĩnh viễn chuyến ${data.tripId} vào Database!`);
    } catch (err) {
      console.log('⚠️ Có lỗi khi lưu DB, nhưng vẫn tiếp tục luồng cho khách.');
    }

    // 4. Tìm Socket của Khách hàng để báo hỷ
    const customerSocket = activeCustomers.get(data.customerId);
    if (customerSocket) {
      io.to(customerSocket).emit('trip_accepted', {
        driverId: data.driverId,
        message: 'Tài xế đã nhận chuyến và đang di chuyển đến điểm đón!'
      });
    }
  });
  // --- TÀI XẾ BẤM HOÀN THÀNH CHUYẾN ---
  socket.on('complete_trip', async (data: { tripId: string, customerId: string }) => {
    console.log(`🏁 Chuyến đi ${data.tripId} đã CẬP BẾN THÀNH CÔNG!`);

    try {
      // Cập nhật trạng thái trong Database thành COMPLETED
      await updateTripStatus(data.tripId, 'COMPLETED');
      console.log(`💾 Đã cập nhật trạng thái COMPLETED cho chuyến ${data.tripId}`);

      // Báo hỷ cho Khách hàng biết để họ thanh toán/đánh giá
      const customerSocket = activeCustomers.get(data.customerId);
      if (customerSocket) {
        io.to(customerSocket).emit('trip_completed', {
          message: 'Chuyến đi đã hoàn thành. Cảm ơn bạn đã sử dụng Agora!'
        });
      }
    } catch (err) {
      console.log('⚠️ Lỗi khi cập nhật DB hoàn thành chuyến.');
    }
  });

  socket.on('disconnect', () => {
    // Xóa kết nối khi tắt trình duyệt/app
    for (const [driverId, sockId] of activeDrivers.entries()) {
      if (sockId === socket.id) activeDrivers.delete(driverId);
    }
    for (const [custId, sockId] of activeCustomers.entries()) {
      if (sockId === socket.id) activeCustomers.delete(custId);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Nhạc trưởng Agora đang chạy tại port ${PORT}`);
});