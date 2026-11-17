# Đưa app lên mạng và tự cập nhật khi sửa code

## 1. Bật dữ liệu chung (giáo viên và học sinh thấy cùng dữ liệu)
1. Tạo tài khoản miễn phí tại https://supabase.com và tạo một project.
2. Vào SQL Editor, dán nội dung file `supabase/schema.sql`, bấm Run.
3. Vào Project Settings > API, copy `Project URL` và `anon public key`.
4. Copy `.env.example` thành `.env.local` rồi điền hai giá trị đó:
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
5. Khi deploy, điền cùng hai biến này trong Netlify: Site settings > Environment variables.

Nếu chưa điền, app vẫn chạy bằng dữ liệu lưu trên từng máy.

Lưu ý: bảng đang cho phép ai có link đều đọc và ghi được. Phù hợp để thử trong lớp, chưa phù hợp cho dữ liệu nhạy cảm.

## 2. Link công khai tự cập nhật khi bạn sửa code
1. Tạo kho trên GitHub (trống), rồi trong thư mục app-10t4 chạy:
   git remote add origin https://github.com/TEN-BAN/TEN-KHO.git
   git add .
   git commit -m "Quan ly lop 10T4"
   git push -u origin master
2. Vào https://app.netlify.com > Add new site > Import from Git > chọn kho vừa tạo.
   Netlify tự đọc `netlify.toml` (lệnh build, thư mục dist).
3. Từ đó, mỗi lần sửa code trong VS Code và `git push`, Netlify tự build và đăng bản mới trong 1 đến 3 phút.

## 3. Khi đang code
Chạy `npx expo start --web`. Lưu file là trình duyệt tự tải lại ngay.

## 4. Đăng thủ công không qua GitHub
Chạy `npm run deploy` (cần đăng nhập Netlify lần đầu).
