//---JavaScript giao diện màn hình khách 
        const socket = io();
        let pickupCoords = null;
        let dropoffCoords = null;
        let pickupMarker, dropoffMarker;
        let routeLine = null; // Lưu đường kẻ xanh
        let currentPrice = 0; // Lưu giá tiền
        let currentDistance = 0; // Thêm biến này để lưu số km
        
        // Bắt buộc phải có dòng này ngay sau khi kết nối Server
        socket.emit('register_customer', 'CUST_WEB_001');

       // 1. Khởi tạo Bản đồ (Lấy trực tiếp dữ liệu hình ảnh của Google Maps)
        const map = L.map('map').setView([16.0664, 108.2435], 14);
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            attribution: '© Dữ liệu bản đồ của Google'
        }).addTo(map);
        // Hàm gọi API OSRM để vẽ đường và tính tiền
        // Hàm gọi API OSRM để vẽ đường và tính tiền (Có bật ghi log lỗi)
        async function drawRouteAndCalculatePrice() {
            if (!pickupCoords || !dropoffCoords) {
                console.warn("⚠️ Thiếu tọa độ điểm đón hoặc điểm đến!");
                return;
            }

            document.getElementById('resultBox').innerHTML = `<span style="color:#3498db">Đang phân tích đường đi và tính cước... ⏳</span>`;

            try {
                // OSRM nhận tọa độ theo thứ tự: Kinh độ (lng), Vĩ độ (lat)
                const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${dropoffCoords.lng},${dropoffCoords.lat}?overview=full&geometries=geojson`;
                
                console.log("🔍 Đang gọi OSRM URL:", url);

                const response = await fetch(url);
                if (!response.ok) throw new Error('Máy chủ OSRM từ chối phản hồi');

                const data = await response.json();
                console.log("📦 Dữ liệu OSRM trả về:", data);

                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    
                    // 1. Tính quãng đường (km)
                    currentDistance = (route.distance / 1000).toFixed(1);
                    
                    // 2. Tính tiền: 12.000đ/km (Tối thiểu 15.000đ)
                    currentPrice = Math.max(15000, Math.round(currentDistance * 12000));
                    
                    // Hiển thị hóa đơn
                    document.getElementById('resultBox').innerHTML = `
                        <div style="background:#e8f8f5; padding:10px; border-radius:8px; border:1px solid #27ae60;">
                            <b>🛣️ Quãng đường:</b> ${currentDistance} km <br>
                            <b style="color:#e74c3c; font-size:18px;">💵 Cước phí: ${currentPrice.toLocaleString('vi-VN')} đ</b>
                        </div>
                    `;

                    // 3. Vẽ đường Polyline lên bản đồ
                    const coords = route.geometry.coordinates; // Định dạng [Lng, Lat]
                    const latLngs = coords.map(c => [c[1], c[0]]); // Chuyển thành [Lat, Lng] cho Leaflet

                    if (routeLine) map.removeLayer(routeLine); // Xóa đường cũ
                    routeLine = L.polyline(latLngs, { color: '#3498db', weight: 6, opacity: 0.8 }).addTo(map);
                    
                    // Zoom bản đồ vừa khít với đường đi
                    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
                } else {
                    document.getElementById('resultBox').innerHTML = `<span style="color:#c0392b">❌ Không tìm thấy đường đi giữa 2 điểm này.</span>`;
                }
            } catch (error) {
                console.error("❌ Lỗi chi tiết khi vẽ đường:", error);
                document.getElementById('resultBox').innerHTML = `⚠️ Không thể vẽ đường đi. Vui lòng thử lại!`;
            }
        }
        
        // 2. Hàm gọi API miễn phí (Nominatim) để dịch chữ thành Tọa độ
        // Hàm gọi API tìm kiếm Photon (Không bị chặn, cập nhật tên đường liên tục)
        // Hàm gọi API tìm kiếm Photon (Chuẩn xác tên đường, không bị chặn)
        async function searchAddress(text, type) {
            if (!text) return;
            
            document.getElementById('resultBox').innerHTML = `<span style="color:#f39c12">⏳ Đang tìm vị trí...</span>`;
            
            try {
                const query = encodeURIComponent(text + ", Đà Nẵng");
                const url = `https://photon.komoot.io/api/?q=${query}&limit=1`;
                
                const response = await fetch(url);
                if (!response.ok) throw new Error('Máy chủ từ chối kết nối');

                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                    const lon = data.features[0].geometry.coordinates[0];
                    const lat = data.features[0].geometry.coordinates[1];
                    
                    // 1. Gán tọa độ và cắm mốc lên bản đồ trước
                    if (type === 'pickup') {
                        pickupCoords = { lat, lng: lon };
                        if (pickupMarker) map.removeLayer(pickupMarker);
                        pickupMarker = L.marker([lat, lon]).addTo(map).bindPopup("📍 Điểm đón").openPopup();
                    } else {
                        dropoffCoords = { lat, lng: lon };
                        if (dropoffMarker) map.removeLayer(dropoffMarker);
                        dropoffMarker = L.marker([lat, lon]).addTo(map).bindPopup("🏁 Điểm đến").openPopup();
                    }
                    
                    map.setView([lat, lon], 15);
                    setTimeout(() => map.invalidateSize(), 400);

                    // 2. Kiểm tra nếu có đủ 2 điểm thì kích hoạt vẽ đường & tính tiền ngay lập tức
                    if (pickupCoords && dropoffCoords) {
                        drawRouteAndCalculatePrice();
                    } else {
                        document.getElementById('resultBox').innerHTML = `<span style="color:#27ae60">✅ Đã ghim vị trí! Hãy nhập điểm còn lại.</span>`;
                    }
                } else {
                    document.getElementById('resultBox').innerHTML = `<span style="color:#c0392b">❌ Không tìm ra địa chỉ này. Hãy thử gõ ngắn gọn hơn.</span>`;
                }
            } catch (error) {
                console.error("❌ Lỗi API Bản đồ:", error);
                document.getElementById('resultBox').innerHTML = `⚠️ Lỗi mạng. Vui lòng kiểm tra kết nối và thử lại!`;
            }
        }

        // Ép bản đồ load ngay khi mở trang
        setTimeout(() => map.invalidateSize(), 1000);
        //----------------------------------------------

        // 3. Hàm Đặt xe (Gắn tọa độ thực tế để gửi xuống Backend)
        function bookRide() {
            if (!pickupCoords || !dropoffCoords) {
                alert('⚠️ Vui lòng nhập đầy đủ cả điểm đón và điểm đến!');
                return;
            }

            document.getElementById('resultBox').innerHTML = `<b>Đang tìm tài xế gần bạn... ⏳</b>`;

            const rideRequest = {
                customerId: 'CUST_WEB_001',
                pickup: pickupCoords,
                dropoff: dropoffCoords,
                serviceType: 'MOTORBIKE',
                price: currentPrice // Bắn giá tiền thật vừa tính được đi
            };

            socket.emit('request_ride', rideRequest);
        }

        // Lắng nghe Tài xế nhận cuốc
       // Lắng nghe tín hiệu Tài xế nhận cuốc từ Nhạc trưởng
        socket.on('trip_accepted', (data) => {
            console.log("🎉 NHẬN ĐƯỢC TÍN HIỆU TÀI XẾ NHẬN CUỐC:", data);

            // Tính thời gian đón dự kiến (tốc độ 40km/h trong phố)
            const etaMinutes = Math.max(2, Math.round((currentDistance / 40) * 60));

            // Đổ dữ liệu thật vào khung kết quả của khách
            document.getElementById('resultBox').innerHTML = `
                <div style="background: white; border: 2px solid #27ae60; border-radius: 8px; padding: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); text-align: left;">
                    <h3 style="color: #27ae60; margin: 0 0 10px 0; text-align: center;">✅ TÀI XẾ ĐÃ NHẬN CHUYẾN</h3>
                    <hr style="border: 0; border-top: 1px dashed #eee; margin: 10px 0;">
                    
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <div style="font-size: 45px; margin-right: 15px; background: #f4f7f6; border-radius: 50%; padding: 5px;">🧑‍✈️</div>
                        <div style="line-height: 1.4;">
                            <b style="font-size: 17px; color: #2c3e50;">${data.driverName}</b><br>
                            <span style="color: #3498db; font-weight: bold;">📞 ${data.driverPhone}</span>
                        </div>
                    </div>

                    <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; font-size: 14.5px; line-height: 1.8; color: #34495e;">
                        🏍️ <b>Phương tiện:</b> ${data.vehicleType} - <b style="background:#f1c40f; padding:2px 6px; border-radius:4px; color:black;">${data.licensePlate}</b><br>
                        🛣️ <b>Quãng đường:</b> ${currentDistance} km<br>
                        ⏳ <b>Thời gian đón dự kiến:</b> ~${etaMinutes} phút<br>
                        💵 <b>Cước phí:</b> <b style="color: #e74c3c; font-size: 18px;">${currentPrice.toLocaleString('vi-VN')} đ</b>
                    </div>
                </div>
            `;
        });
        

        // Lắng nghe Hoàn thành chuyến
        socket.on('trip_completed', (data) => {
            document.getElementById('resultBox').innerHTML = `
                <h3 style="color: #c0392b; margin: 5px 0;">🏁 CHUYẾN ĐI KẾT THÚC!</h3>
                <p>Cảm ơn bạn đã sử dụng Agora.</p>
            `;
            // Reset bản đồ sau 10 giây
            setTimeout(() => location.reload(), 10000);
        });

        // Đặt mặc định ban đầu khi load trang là RIDE (Chở người)
        let currentServiceType = 'RIDE'; 
        let currentVehicleType = 'MOTORBIKE';
        let currentBookingMode = 'BID';
        let customPrice = 45000;
        // KÍCH HOẠT HÀM NGAY KHI VỪA MỞ TRANG WEB
        selectService('RIDE'); 
        selectVehicle('MOTORBIKE');
        selectMode('BID');

        function selectService(type) {
            currentServiceType = type;
            
            // Xóa hết trạng thái active cũ
            document.getElementById('tab-ride').className = 'service-tab';
            document.getElementById('tab-delivery').className = 'service-tab';
            
            const mainBtn = document.getElementById('mainActionBtn');

            if(type === 'RIDE') {
                // Bật màu xanh cho Chở người
                document.getElementById('tab-ride').classList.add('active-blue');
                // Đổi chữ nút dưới cùng thành TÌM TÀI XẾ
                mainBtn.innerText = "TÌM TÀI XẾ";
                mainBtn.style.background = "#0984e3"; // Có thể đổi màu nút cho hợp tông
            } else {
                // Bật màu cam cho Gửi hàng
                document.getElementById('tab-delivery').classList.add('active-orange');
                // Đổi chữ nút dưới cùng thành NHẬP CHI TIẾT HÀNG HÓA
                mainBtn.innerText = "NHẬP CHI TIẾT HÀNG HÓA ➔";
                mainBtn.style.background = "#e17055";
            }
        }

        // 2. Hàm chọn Phương tiện (Xe máy / Ô tô / Xe tải)
        function selectVehicle(type) {
            currentVehicleType = type;
            document.getElementById('veh-motor').classList.remove('active-orange');
            document.getElementById('veh-car').classList.remove('active-orange');
            document.getElementById('veh-truck').classList.remove('active-orange');
            
            if(type === 'MOTORBIKE') {
                document.getElementById('veh-motor').classList.add('active-orange');
            } else if(type === 'CAR') {
                document.getElementById('veh-car').classList.add('active-orange');
            } else {
                document.getElementById('veh-truck').classList.add('active-orange');
            }
        }

        // 3. Hàm chọn Chế độ Đặt (Đấu giá tự do / Đi ngay)
        function selectMode(mode) {
            currentBookingMode = mode;
            document.getElementById('mode-bid').classList.remove('active-dark');
            document.getElementById('mode-instant').classList.remove('active-dark');
            
            const biddingBox = document.getElementById('biddingBox');

            if(mode === 'BID') {
                document.getElementById('mode-bid').classList.add('active-dark');
                if(biddingBox) biddingBox.style.display = 'block'; // Hiển thị cụm tăng giảm giá
            } else {
                document.getElementById('mode-instant').classList.add('active-dark');
                if(biddingBox) biddingBox.style.display = 'none'; // Ẩn cụm đấu giá khi chọn đi ngay
            }
        }

        // 4. Hàm tăng giảm giá tiền đấu giá (-5k / +5k)
        function adjustPrice(amount) {
            if (customPrice + amount >= 30000) { // Sàn bảo vệ tài xế tối thiểu 30k
                customPrice += amount;
                const priceElement = document.getElementById('displayPrice');
                if(priceElement) {
                    priceElement.innerText = customPrice.toLocaleString('vi-VN') + ' đ';
                }
                currentPrice = customPrice; 
            }
        }
    