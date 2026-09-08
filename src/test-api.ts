//--------------------------------------------------
//--mô phỏng khách đặt chuyến đi từ 227 Chính Hữu lên Sân bay
//--------------------------------------------------
const testBiddingAPI = async () => {
  try {
    console.log('🚀 Đang gửi yêu cầu khởi tạo chuyến đi...');
    
    const response = await fetch('http://localhost:3000/api/trips/bidding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerId: "CUST_001",
        suggestedPrice: 40000, 
        serviceType: "DELIVERY",
        pickupLocation: { lat: 16.0664, lng: 108.2435 }, // Điểm đón: 227 Chính Hữu
        dropoffLocation: { lat: 16.0435, lng: 108.2014 } // Điểm đến: Sân bay
      })
    });

    const data = await response.json();
    console.log('📦 KẾT QUẢ TỪ SERVER:');
    console.dir(data, { depth: null, colors: true });

  } catch (error) {
    console.error('❌ LỖI KẾT NỐI:', error);
  }
};

testBiddingAPI();