import { io } from 'socket.io-client';

// Kết nối tới Backend
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('🟢 App Tài Xế Đã Mở. Kết nối thành công!');
  
  // Báo cáo có mặt lên Server với mã ID là 1 (Nguyễn Văn Gần)
  // Nếu lúc trước test bạn ra ID khác thì sửa số 1 thành số đó nhé
  socket.emit('register_driver', 4); 
});

// Lắng nghe sự kiện 'new_bidding_trip' từ Backend bắn xuống
socket.on('new_bidding_trip', (tripData) => {
  console.log('\n=======================================');
  console.log('🚨 TING TING! CÓ CUỐC XE MỚI Ở GẦN BẠN!');
  console.log(`📍 Mã chuyến: ${tripData.tripId}`);
  console.log(`💰 Giá khách đề xuất: ${tripData.suggestedPrice}đ`);
  console.log('=======================================');
  
  console.log('⏱️ Đang xem xét cuốc xe... (Chờ 3 giây)');
  
  // Giả lập tài xế bấm nút "NHẬN CUỐC" sau 3 giây
  setTimeout(() => {
    console.log('🚀 BẤM NÚT CHỐT: ĐÃ NHẬN CUỐC!');
    socket.emit('accept_trip', {
      tripId: tripData.tripId,
      driverId: 4, // QUAN TRỌNG: Đổi số này thành ID chính xác của tài xế mà bạn đã test thành công ở bước trước
      customerId: tripData.customerId // Phản hồi lại đúng khách hàng đó
    });
  }, 3000);
});

socket.on('disconnect', () => {
  console.log('🔴 Đã mất kết nối tới máy chủ.');
});