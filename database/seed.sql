INSERT INTO drivers (full_name, phone_number, license_plate, vehicle_type, is_online, status, current_location)
VALUES 
-- 1. Ở gần (200m) -> TRÚNG TUYỂN
('Nguyễn Văn Gần', '0901000001', '43H1-111.11', 'MOTORBIKE', true, 'AVAILABLE', ST_SetSRID(ST_MakePoint(108.2450, 16.0650), 4326)),

-- 2. Ở vừa (trong bán kính 5km) -> TRÚNG TUYỂN
('Trần Thị Vừa', '0902000002', '43H1-222.22', 'MOTORBIKE', true, 'AVAILABLE', ST_SetSRID(ST_MakePoint(108.2246, 16.0717), 4326)),

-- 3. Ở xa (> 5km) -> BỊ LOẠI
('Lê Văn Xa', '0903000003', '43A-333.33', 'CAR', true, 'AVAILABLE', ST_SetSRID(ST_MakePoint(108.2500, 16.0000), 4326)),

-- 4. Ở gần nhưng Tắt App -> BỊ LOẠI
('Phạm Nghỉ Ngơi', '0904000004', '43C-444.44', 'TRUCK', false, 'OFFLINE', ST_SetSRID(ST_MakePoint(108.2436, 16.0664), 4326));