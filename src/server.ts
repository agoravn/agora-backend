import { saveTripToDatabase, updateTripStatus, getDailyStats } from './services/trip.service';
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

// --- API: THỐNG KÊ DOANH THU TRONG NGÀY ---
app.get('/api/admin/daily-stats', async (req, res) => {
  try {
    const stats = await getDailyStats();
    res.json({
      success: true,
      message: 'Báo cáo doanh thu hôm nay',
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi truy xuất cơ sở dữ liệu' });
  }
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
  
  // Lắng nghe Khách hàng đặt xe
  socket.on('request_ride', async (rideData) => {
    console.log("🚨 NHẬN YÊU CẦU ĐẶT XE TỪ KHÁCH:", rideData); // In ra để kiểm tra

    try {
      // TẠM THỜI BỎ QUA TÌM KIẾM BÁN KÍNH DB ĐỂ TEST LUỒNG MẠNG TRƯỚC
      // Ép hệ thống tạo luôn một chuyến đi giả lập bắn thẳng qua Tài xế
      const mockTrip = {
        tripId: 'TRIP_' + Date.now(),
        customerId: rideData.customerId,
        pickup: rideData.pickup,
        dropoff: rideData.dropoff,
        suggestedPrice: rideData.price  //Lấy giá thật từ Frontend - Màn khách hàng
      };

      console.log("🚀 ĐANG BẮN CUỐC SANG CHO TÀI XẾ...");
      
      // Bắn tín hiệu sang toàn bộ Tài xế đang online (kích hoạt hàm bên driver.html)
      io.emit('new_bidding_trip', mockTrip);

    } catch (error) {
      console.error("❌ Lỗi khi xử lý đặt xe:", error);
    }
  });
  
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

  // --- KHÁCH HÀNG BẤM TÌM TÀI XẾ (HÀM BỊ THIẾU) ---
  socket.on('book_ride', (data: any) => {
    console.log(`🛎️ Khách [ID: ${socket.id}] đang tìm xe với giá ${data.price}đ`);
    
    // Đóng gói thông tin cuốc xe
    const tripData = {
      tripId: 'TRIP_' + Math.floor(Math.random() * 1000000),
      customerId: socket.id, // Lưu lại ID khách để lát tài xế biết trả lời ai
      suggestedPrice: data.price,
      pickup: data.pickup,
      dropoff: data.dropoff
    };

    // Quét toàn bộ tài xế đang Online (quét thanh khoản) và đẩy cuốc xe tới
    activeDrivers.forEach((driverSocketId, driverId) => {
      io.to(driverSocketId).emit('new_bidding_trip', tripData);
    });
  });

  // --- TÀI XẾ TRẢ GIÁ MỚI (+5k, +10k) ---
  socket.on('counter_offer', (data: any) => {
    console.log(`⚖️ Tài xế [ID: ${data.driverId}] báo giá mới ${data.newPrice}đ cho cuốc ${data.tripId}`);
    // Bắn mức giá mới ngược lại cho đúng vị khách đó
    io.to(data.customerId).emit('driver_counter_offer', data);
  });

  // --- TÀI XẾ BẤM NHẬN CUỐC ---
  socket.on('accept_trip', async (data: { tripId: string, driverId: number, customerId: string }) => {
    console.log(`✅ Tài xế [ID: ${data.driverId}] VỪA CHỐT NHẬN CUỐC ${data.tripId}`);
    // Bắn thông báo chốt đơn về cho màn hình khách hàng
    io.to(data.customerId).emit('driver_accepted', data);
    
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

    // 4. KÉO HỒ SƠ TÀI XẾ TỪ DATABASE VÀ BÁO CHO KHÁCH HÀNG
    try {
      const driverResult = await pool.query(
        'SELECT full_name, phone_number, license_plate, vehicle_type FROM drivers WHERE id = $1',
        [data.driverId]
      );

      if (driverResult.rows.length > 0) {
        const driverInfo = driverResult.rows[0];

        // Tìm Socket của Khách hàng để báo tin vui kèm thông tin tài xế
        const customerSocket = activeCustomers.get(data.customerId);
        if (customerSocket) {
          io.to(customerSocket).emit('trip_accepted', {
            tripId: data.tripId,
            driverId: data.driverId,
            driverName: driverInfo.full_name,
            driverPhone: driverInfo.phone_number,
            vehicleType: driverInfo.vehicle_type,
            licensePlate: driverInfo.license_plate,
            message: 'Tài xế đã nhận chuyến và đang di chuyển đến điểm đón!'
          });
        }
      } else {
        console.log(`⚠️ Không tìm thấy hồ sơ tài xế ID: ${data.driverId}`);
      }
    } catch (dbError) {
      console.error("❌ Lỗi khi truy vấn hồ sơ tài xế:", dbError);
    }
  });
  // --- TÀI XẾ BẤM HOÀN THÀNH CHUYẾN ---
  socket.on('complete_trip', (data: any) => {
    console.log(`🏁 Tài xế [ID: ${data.driverId}] đã hoàn tất cuốc ${data.tripId}`);
    
    // Bắn thông báo về cho điện thoại của Khách hàng
    if (data.customerId) {
        io.to(data.customerId).emit('trip_completed', data);
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

const PORT = 3000;
httpServer.listen(PORT,() => {
  console.log(`🚀 Nhạc trưởng Agora đang chạy tại port ${PORT}`);
});