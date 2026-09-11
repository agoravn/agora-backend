//-----Script Driver ----->
        const socket = io();
        const DRIVER_ID = 4;
        let currentTrip = {};
        let countdownTimer;
        let isOnline = true;

        // Bật/tắt trạng thái
        function toggleStatus() {
            isOnline = !isOnline;
            const btn = document.getElementById('statusToggleBtn');
            const idleScreen = document.getElementById('idleScreen');

            if (isOnline) {
                btn.className = 'badge-online';
                btn.innerText = 'ONLINE';
                socket.emit('register_driver', DRIVER_ID);
                idleScreen.innerHTML = '<div style="font-size: 50px; margin-bottom: 20px;">☕</div><h3>Đang tìm cuốc xe...</h3>';
            } else {
                btn.className = 'badge-online badge-offline';
                btn.innerText = 'OFFLINE';
                idleScreen.innerHTML = '<div style="font-size: 50px; margin-bottom: 20px;">💤</div><h3 style="color:#95a5a6;">Đang nghỉ ngơi</h3>';
                ignoreTrip(); 
            }
        }

        socket.emit('register_driver', DRIVER_ID);

        // LẮNG NGHE CUỐC MỚI TỪ SERVER
        socket.on('new_bidding_trip', (tripData) => {
            if (!isOnline) return; 
            currentTrip = tripData;
            
            const basePrice = Number(tripData.suggestedPrice) || 0;

            // Đổ text giá và địa chỉ
            document.getElementById('priceDisplay').innerText = basePrice.toLocaleString('vi-VN') + ' đ';
            document.getElementById('btnPriceDisplay').innerText = basePrice.toLocaleString('vi-VN') + ' đ';
            document.getElementById('pickupDisplay').innerText = String(tripData.pickup || "Đang tải...");
            document.getElementById('dropoffDisplay').innerText = String(tripData.dropoff || "Đang tải...");
            
            document.getElementById('calc5k').innerText = `(${((basePrice + 5000)/1000)}k)`;
            document.getElementById('calc10k').innerText = `(${((basePrice + 10000)/1000)}k)`;
            document.getElementById('calc15k').innerText = `(${((basePrice + 15000)/1000)}k)`;

            // Reset UI (Phòng trường hợp cuốc trước đang lỡ dở)
            document.getElementById('topBanner').innerHTML = '⚡ CUỐC MỚI • CÒN <span id="countdown">15</span> GIÂY';
            document.getElementById('topBanner').style.background = '#2b78e4';
            document.getElementById('actionButtons').style.display = 'block';
            document.getElementById('waitingCustomerBox').style.display = 'none';
            document.getElementById('btnFinish').style.display = 'none';

            // Mở khung cuốc xe
            document.getElementById('idleScreen').style.display = 'none';
            document.getElementById('tripContainer').style.display = 'block';

            // Đếm ngược
            let timeLeft = 15;
            document.getElementById('countdown').innerText = timeLeft;
            clearInterval(countdownTimer);
            countdownTimer = setInterval(() => {
                timeLeft--;
                const counterElement = document.getElementById('countdown');
                if(counterElement) counterElement.innerText = timeLeft;
                if (timeLeft <= 0) ignoreTrip();
            }, 1000);
        });

        // TÀI XẾ BẤM NHẬN LUÔN
        function acceptTrip() {
            clearInterval(countdownTimer);
            socket.emit('accept_trip', {
                tripId: currentTrip.tripId,
                driverId: DRIVER_ID,
                customerId: currentTrip.customerId,
                finalPrice: currentTrip.suggestedPrice
            });
            
            document.getElementById('topBanner').innerHTML = '🚙 ĐANG TỚI ĐÓN KHÁCH';
            document.getElementById('topBanner').style.background = '#27ae60'; 

            document.getElementById('actionButtons').style.display = 'none';
            document.getElementById('btnFinish').style.display = 'block';
        }

        // TÀI XẾ BẤM ĐỀ XUẤT GIÁ (+5k, +10k)
        function counterOffer(addedAmount) {
            clearInterval(countdownTimer);
            const newPrice = currentTrip.suggestedPrice + addedAmount;
            
            socket.emit('counter_offer', {
                tripId: currentTrip.tripId,
                driverId: DRIVER_ID,
                customerId: currentTrip.customerId,
                newPrice: newPrice
            });

            // Ẩn các nút hành động đi, mở khung chờ khách lên
            document.getElementById('actionButtons').style.display = 'none';
            document.getElementById('waitingPriceText').innerText = `Đã gửi giá mới: ${newPrice.toLocaleString('vi-VN')} đ`;
            document.getElementById('waitingCustomerBox').style.display = 'block';
            
            document.getElementById('topBanner').innerHTML = 'ĐANG ĐỢI KHÁCH PHẢN HỒI';
            document.getElementById('topBanner').style.background = '#e17055';
        }

        // TÀI XẾ HOÀN THÀNH HOẶC BỎ QUA
        // TÀI XẾ HOÀN THÀNH CUỐC XE
        function finishTrip() {
            console.log("Đang bấm gửi lệnh hoàn thành chuyến đi..."); // In ra log F12 của tài xế để kiểm tra
            
            socket.emit('complete_trip', {
                tripId: currentTrip.tripId,
                customerId: currentTrip.customerId,
                driverId: DRIVER_ID
            });
            
            alert('🎉 Chuyến đi hoàn tất! Tiền đã cộng vào ví.');
            ignoreTrip(); 
        }

        function ignoreTrip() {
            clearInterval(countdownTimer);
            currentTrip = {};
            document.getElementById('tripContainer').style.display = 'none';
            document.getElementById('idleScreen').style.display = 'block';
        }
    