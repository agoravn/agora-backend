-- 1. Bật tính năng không gian địa lý PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Xóa bảng cũ nếu đang test, tạo lại bảng rides chuẩn Dual Mode & Vehicle Type
DROP TABLE IF EXISTS rides CASCADE;

CREATE TABLE rides (
    id SERIAL PRIMARY KEY,
    passenger_id INT NOT NULL,                
    driver_id INT NULL,                       
    
    -- Phân loại phương tiện yêu cầu ('MOTORBIKE': Xe máy, 'CAR': Ô tô, 'TRUCK': Xe tải)
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'MOTORBIKE',
    
    -- Phân loại dịch vụ (FALSE: Chở người, TRUE: Giao hàng)
    is_cargo BOOLEAN DEFAULT FALSE,           
    cargo_type VARCHAR(50) NULL,              -- 'THUNG_DO', 'HOA_QUA', 'TAI_LIEU'
    cargo_weight_kg DECIMAL(5,2) NULL,        -- Cân nặng ước tính (kg)
    cargo_insurance BOOLEAN DEFAULT FALSE,    -- Bảo hiểm Agora Care (+2k)
    cargo_photo_url TEXT NULL,                -- Ảnh chụp đối soát bưu kiện
    
    -- Tọa độ điểm đón và điểm đến
    pickup_lat DECIMAL(10,8) NOT NULL,
    pickup_lng DECIMAL(11,8) NOT NULL,
    pickup_geom GEOGRAPHY(Point, 4326) NOT NULL,
    
    dropoff_lat DECIMAL(10,8) NOT NULL,
    dropoff_lng DECIMAL(11,8) NOT NULL,
    dropoff_geom GEOGRAPHY(Point, 4326) NOT NULL,
    
    -- Cơ chế giá & Đấu giá
    pricing_mode VARCHAR(20) NOT NULL,        -- 'BIDDING' hoặc 'INSTANT'
    base_price INT NOT NULL,                  -- Giá sàn bảo vệ (VNĐ)
    offered_price INT NOT NULL,               -- Giá khách đề xuất (VNĐ)
    
    -- Trạng thái cuốc xe
    status VARCHAR(30) DEFAULT 'SEARCHING',   -- 'SEARCHING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tạo chỉ mục không gian (Spatial Index) và chỉ mục lọc theo loại xe để tăng tốc độ quét
CREATE INDEX idx_rides_pickup_geom ON rides USING GIST (pickup_geom);
CREATE INDEX idx_rides_matching ON rides (status, vehicle_type, is_cargo);
-- Xóa bảng cũ nếu đang test
DROP TABLE IF EXISTS drivers CASCADE;

CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    avatar_url TEXT NULL,
    
    -- Thông tin phương tiện (Đồng bộ với bảng rides: 'MOTORBIKE', 'CAR', 'TRUCK')
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'MOTORBIKE',
    license_plate VARCHAR(20) NOT NULL,
    vehicle_model VARCHAR(50) NULL,
    
    -- Mô hình Kinh doanh Agora: Thuê bao tháng (MRR) thay vì cắt phế
    subscription_status VARCHAR(20) DEFAULT 'TRIAL', -- 'ACTIVE', 'EXPIRED', 'TRIAL'
    subscription_valid_until TIMESTAMP NULL,         -- Hạn chót gói cước tháng
    
    -- Trạng thái hoạt động
    is_online BOOLEAN DEFAULT FALSE,                 -- Nút gạt Bật/Tắt nhận cuốc
    status VARCHAR(20) DEFAULT 'OFFLINE',            -- 'AVAILABLE' (đang rảnh), 'ON_TRIP' (đang chở), 'OFFLINE'
    
    -- Tọa độ PostGIS cập nhật theo thời gian thực (Real-time tracking)
    current_lat DECIMAL(10,8) NULL,
    current_lng DECIMAL(11,8) NULL,
    current_location GEOGRAPHY(Point, 4326) NULL,
    
    -- Thời điểm bắn tọa độ cuối cùng (để lọc bỏ các tài xế rớt mạng nhưng hệ thống vẫn tưởng đang online)
    last_location_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1. Chỉ mục không gian (GIST) cực kỳ quan trọng để ST_DWithin quét bán kính siêu tốc
CREATE INDEX idx_drivers_location ON drivers USING GIST (current_location);

-- 2. Chỉ mục ghép hợp (Composite Index) để lọc tài xế đang rảnh, online và đúng loại xe
CREATE INDEX idx_drivers_available ON drivers (is_online, status, vehicle_type);