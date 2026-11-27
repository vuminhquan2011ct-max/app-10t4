# Hướng dẫn triển khai bảo mật `P0-B` (Supabase Edge Functions) & Cập nhật Google Apps Script

> **Đảm bảo Zero Regression**: Hiện tại ứng dụng chạy mặc định với `EXPO_PUBLIC_SERVER_SECURITY_MODE=0` nên mọi tính năng trên Vercel & App vẫn hoạt động bình thường 100%. Bạn chỉ cần làm lần lượt **Phần A** (1 phút) rồi **Phần B** (5 phút) khi sẵn sàng chuyển sang kiến trúc bảo mật cấp Production hoàn chỉnh.

---

## Phần A — Cập nhật Google Apps Script Drive `K8T4_app` (1 phút)

Phiên bản mới của [`scripts/google-apps-script-k8t4-drive.gs`](../scripts/google-apps-script-k8t4-drive.gs) đã khoá cứng `CONFIG.FOLDER_ID`, kiểm tra thư mục cha đệ quy khi xoá (chống xoá tệp ngoài `K8T4_app`), chặn xoá hàng loạt Google Sheets bằng chuỗi URL ngắn, giới hạn 25 MB + chặn tệp nguy hiểm (`html/svg/js/exe`), và chống Formula Injection (`=`, `+`, `-`, `@`).

1. Mở [https://script.google.com](https://script.google.com) → chọn dự án Apps Script đang gắn với thư mục `K8T4_app`.
2. Dán toàn bộ nội dung file `scripts/google-apps-script-k8t4-drive.gs`.
3. Điền đúng `CONFIG.API_SECRET_KEY` (khớp với khóa hiện tại của bạn) và `CONFIG.SPREADSHEET_ID` (nếu dự án độc lập).
4. Bấm **Deploy** → **Manage deployments** → biểu tượng bút chì (**Edit**) → **Version: New version** → **Deploy** *(Execute as: Me | Who has access: Anyone)*.

---

## Phần B — Triển khai `P0-B` Supabase Edge Functions & Migration (5 phút)

### Bước 1: Đăng nhập & liên kết dự án Supabase CLI
```bash
npx supabase login
npx supabase link --project-ref <MA_PROJECT_REF_CUA_BAN>
```

### Bước 2: Chạy Migration bảo mật `20261127_p0b_security_hardening.sql`
Mở **Supabase Dashboard → SQL Editor** (hoặc chạy `npx supabase db push`) và thực thi file:
- `supabase/migrations/20261127_p0b_security_hardening.sql`

*(Tùy chọn tạo bảng lưu khóa chống brute-force bền vững cho `pro-vault-verify`)*:
```sql
create table if not exists private.security_lockouts (
  lock_key text primary key,
  failed_attempts int not null default 0,
  lockout_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on table private.security_lockouts from public, anon, authenticated;
```

**Quan trọng — Cho phép `service_role` truy vấn schema `private` từ Edge Functions**:
- Vào **Supabase Dashboard → Project Settings → API → Exposed schemas**, thêm `private` vào danh sách *(yên tâm: Migration đã chạy `REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;` nên chỉ `service_role` bên trong Edge Functions mới đọc/ghi được!)*.

**Tạo mã mời Giáo viên (`private.teacher_invite_codes`)** *(thay `MA_MOI_BI_MAT_CUA_BAN` bằng mã mạnh >= 8 ký tự)*:
```sql
insert into private.teacher_invite_codes (code_hash, role, label, max_uses, expires_at)
values (
  encode(extensions.digest('MA_MOI_BI_MAT_CUA_BAN', 'sha256'), 'hex'),
  'teacher',
  'Mã mời GVCN 10T4',
  5,
  now() + interval '90 days'
);
```

### Bước 3: Tạo hash PBKDF2-SHA256 cho Pro Vault (KHÔNG lưu mật khẩu thô)
Chạy lệnh Node 1 dòng cục bộ để tạo chuỗi `pbkdf2_sha256$...` cho mật khẩu & mã PIN 7 số của bạn:
```bash
node -e "const c=require('crypto'),h=(s)=>{const salt=c.randomBytes(16).toString('hex');const dk=c.pbkdf2Sync(s,salt,100000,32,'sha256').toString('hex');return 'pbkdf2_sha256$100000$'+salt+'$'+dk;}; console.log('PWD:', h(process.argv[1])); console.log('PIN:', h(process.argv[2]));" "MAT_KHAU_PRO_CUA_BAN" "1234567"
```

### Bước 4: Nạp Secrets lên Supabase Edge Functions
```bash
npx supabase secrets set \
  PRO_VAULT_PASSWORD_HASH="pbkdf2_sha256$100000$..." \
  PRO_VAULT_PIN_HASH="pbkdf2_sha256$100000$..." \
  DRIVE_SCRIPT_URL="https://script.google.com/macros/s/.../exec" \
  DRIVE_API_KEY="KHOA_BI_MAT_APPS_SCRIPT" \
  DRIVE_FOLDER_ID="1mjTLnW1ztWKD2PvKJ0aW8uowiLD5eR_D" \
  DRIVE_FOLDER_NAME="K8T4_app" \
  ALLOWED_ORIGINS="https://app-10t4.vercel.app"
```
*(Ghi chú: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, và `SUPABASE_SERVICE_ROLE_KEY` được Supabase tự động cấp sẵn cho Edge Functions.)*

### Bước 5: Deploy cả 3 Edge Functions
```bash
# pro-vault-verify & auth-gateway cần gọi trước/ngoài phiên JWT nên dùng --no-verify-jwt
npx supabase functions deploy pro-vault-verify --no-verify-jwt
npx supabase functions deploy auth-gateway --no-verify-jwt

# drive-proxy bắt buộc JWT hợp lệ (Authorization: Bearer <token>)
npx supabase functions deploy drive-proxy
```

### Bước 6: Kiểm tra nhanh (Smoke Test)
```bash
# 1. Kiểm tra Pro Vault từ chối sai PIN (mong đợi HTTP 401)
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/pro-vault-verify" \
  -H "Content-Type: application/json" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -d '{"mode":"pin","secret":"0000000","deviceId":"smoke-test"}'

# 2. Kiểm tra Drive Proxy từ chối request không có JWT (mong đợi HTTP 401)
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/drive-proxy" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","payload":{"fileId":"invalid"}}'
```

### Bước 7: Kích hoạt trên Vercel (`EXPO_PUBLIC_SERVER_SECURITY_MODE=1`)
1. Vào **Vercel Dashboard → Project `app-10t4` → Settings → Environment Variables**.
2. Thêm biến: `EXPO_PUBLIC_SERVER_SECURITY_MODE` = `1` *(Production & Preview)*.
3. Bấm **Redeploy** bản mới nhất và kiểm tra đăng nhập, Gói Pro, và tải ảnh Drive hoạt động trơn tru.
4. *(Dọn dẹp sau khi đã xác nhận 100% ổn định)*:
   - Xoá biến `EXPO_PUBLIC_DRIVE_API_KEY` khỏi Vercel để trình duyệt không còn chứa khóa Apps Script.
   - Chạy `DELETE FROM public.class_state WHERE id = 'class10t4_accounts_v1';` trong Supabase SQL Editor để xoá sạch bản sao bảng tài khoản cũ.
