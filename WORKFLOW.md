# WORKFLOW — Dua Mustajab Reader

> เอกสารแผนงานสำหรับให้ **Codex** (หรือ AI coding agent อื่น) ดำเนินงานต่อจนสมบูรณ์ระดับมืออาชีพ
> อัปเดตล่าสุด: 2026-06-25 • สถานะ: Phase 0 (audit + quick fixes + deploy) เสร็จแล้ว

---

## 0) บริบทโปรเจกต์ (อ่านก่อนเริ่มเสมอ)

- **ชนิด:** Progressive Web App แบบ *static* — **ไม่มี build step**, ไม่มี framework, ไม่มี `package.json`
  เขียนด้วย HTML + CSS + Vanilla JS ล้วน เสิร์ฟไฟล์ตรงๆ
- **เป้าหมาย:** อ่านหนังสือ PDF 2 เล่ม (อัซการยามเช้า-เย็น และ ดุอามุสตาญาบ) ภาษาไทย/อาหรับ
  พร้อมเครื่องมือช่วยอ่าน ทำงานได้ออฟไลน์และติดตั้งลงหน้าจอหลักได้
- **กลุ่มผู้ใช้หลัก:** มือถือและ iPad (ต้องแสดงผลถูกต้องไม่ผิดเพี้ยน)
- **เรนเดอร์ PDF:** pdf.js 2.16.105 (โหลดจาก CDN) ใช้ HTTP **Range requests** เพื่อโหลดเฉพาะหน้าที่ดู
- **Repo:** `NuSofwan/azkar-duamustajab-reader` • Deploy: **GitHub Pages** (ผ่าน GitHub Actions)

### ข้อจำกัด / กติกาที่ต้องเคารพ (สำคัญมาก)
1. **ห้ามใส่ build step / bundler / framework** เว้นแต่จะได้รับอนุมัติจากเจ้าของชัดเจน — ต้องรันได้จากการเสิร์ฟไฟล์ static เท่านั้น
2. **ห้าม pre-cache ไฟล์ `dua_mustajab_th.pdf` (~69MB) ทั้งก้อน** ใน Service Worker (จะทำให้ดาวน์โหลดทั้งไฟล์ทันที) — ดูคอมเมนต์ใน `sw.js`
3. **ห้ามแตะตรรกะ pinch-to-zoom / scroll-paging ที่ละเอียดอ่อนใน `script.js`** โดยไม่ทดสอบบน iOS Safari จริง (มี workaround เฉพาะ iOS rubber-band หลายจุด)
4. ทุกการแก้ไขต้องผ่าน `node --check script.js && node --check sw.js` และทดสอบบนความกว้าง 375 / 768 / 1280 px
5. เมื่อแก้ asset/JS/CSS ต้อง **bump `CACHE_NAME` ใน `sw.js`** (เช่น `v23` → `v24`) ไม่งั้นผู้ใช้เดิมจะได้ไฟล์เก่าจาก cache
6. ภาษาในหน้าจอ = ภาษาไทย ให้คงโทน "ครับ/สุภาพ" เดิม

### โครงสร้างไฟล์
```
index.html      reader หลัก (มี inline e-book enhancement script ท้าย body)
install.html    landing/คู่มือติดตั้ง PWA (carousel 3 หน้า: Android / iOS / app iframe)
style.css       ธีม + responsive + safe-area + a11y
script.js       ตรรกะหลักทั้งหมด (อยู่ใน DOMContentLoaded ก้อนเดียว + SW register ท้ายไฟล์)
sw.js           Service Worker (offline cache + notification)
manifest.json   PWA manifest
icon.svg        ไอคอน vector (มี)  •  icon.png ~3MB (ใหญ่เกินไป — ดู Phase 2)
404.html / robots.txt / sitemap.xml / .nojekyll
.github/workflows/deploy.yml   CI/CD → GitHub Pages
```

---

## 1) สิ่งที่ทำไปแล้วใน Phase 0 (อย่าทำซ้ำ)

> commit ของ session นี้ (audit + bug fix + responsive + deploy scaffold)

- [x] ลบ `zoom.js` (dead code อ้าง `pdf-canvas` ที่ไม่มีจริง + ซ้ำซ้อนกับ pinch-zoom ใน `script.js`)
- [x] แก้ `theme-color` (`#3b82f6` ฟ้า → `#FF8A65` peach) + เพิ่ม dark variant ผ่าน media query
- [x] แก้สี loading overlay, streak-card, page-select focus ให้เป็นโทน peach ตรงธีม
- [x] เพิ่ม `viewport-fit=cover` + **safe-area insets** (`env(safe-area-inset-*)`) ให้ navbar / bottom bar / tasbih / highlight palette — กัน notch บัง iPhone/iPad
- [x] **Fit-to-width อัตโนมัติตอนโหลดครั้งแรก** (`applyInitialFitScale` ใน `script.js`) — หน้า PDF พอดีจอมือถือ ไม่ต้องเลื่อนซ้ายขวา (ทดสอบแล้ว 375/768/1280)
- [x] **Resume reading position** — เขียน/อ่าน key `${book}_reading_position` (เดิมอ่านอย่างเดียว ไม่เคยเขียน → เปิดหน้า 1 เสมอ)
- [x] **จำเล่มล่าสุด** (`last_book`) + รองรับ deep-link `?book=<file>.pdf`
- [x] เพิ่ม**คีย์บอร์ดนำทาง** (←/→ เมื่อหน้าไม่ล้นแนวนอน, PageUp/PageDown เสมอ)
- [x] ธีมตามระบบ (`prefers-color-scheme`) เมื่อผู้ใช้ยังไม่เคยเลือกธีม
- [x] manifest ระดับโปร: `id`, `scope`, `lang`, `dir`, `categories`, `display_override`, `shortcuts`, แยก purpose `any`/`maskable`, เพิ่ม `icon.svg`
- [x] เพิ่ม meta SEO/OG/twitter + favicon SVG
- [x] SW: เพิ่ม `install.html` + `icon.svg` เข้า cache, ทำ `install` ให้ทนทาน (cache รายตัว ไม่ล้มทั้งก้อน), bump → `v23`
- [x] เพิ่ม a11y: `focus-visible` ring, `prefers-reduced-motion`, `aria-label`/`aria-live` ปุ่มนำทาง
- [x] เพิ่ม `404.html`, `robots.txt`, `sitemap.xml`, `.nojekyll`, `.gitignore`, README, GitHub Actions deploy

---

## 2) งานที่ต้องทำต่อ — เรียงตามลำดับความสำคัญ

แต่ละงานมี: **ทำไม → ไฟล์ที่เกี่ยวข้อง → วิธีทำ → เกณฑ์ผ่าน (Acceptance)**

### 🔴 P1 — ความถูกต้อง/ประสิทธิภาพ (ทำก่อน)

#### P1.1 ลดขนาดไอคอน + สร้างชุดไอคอนจริง  ⟶ ใช้ image2.0 (ดู §4)
- **ทำไม:** `icon.png` ปัจจุบัน ~3MB ใหญ่เกินไปสำหรับ PWA icon (ควร < 50KB/ขนาด) และยังไม่มี maskable จริง (มี safe-zone padding)
- **ไฟล์:** `manifest.json`, `index.html`, ไฟล์ไอคอนใหม่
- **วิธี:** สร้าง `icon-192.png`, `icon-512.png` (purpose any), `icon-maskable-512.png` (มี safe zone 20%), `apple-touch-icon-180.png` ด้วย image2.0 → optimize (pngquant/oxipng) → อัปเดต `manifest.json` ให้ชี้ไฟล์ตามขนาดจริง
- **Acceptance:** Lighthouse PWA installability ผ่าน, ไอคอนรวม < 200KB, ไอคอนบน Android ไม่ถูก crop

#### P1.2 Refit เมื่อหมุนจอ / เปลี่ยนขนาด (orientation change)
- **ทำไม:** ตอนนี้ fit-to-width คำนวณครั้งเดียวตอนโหลด ถ้าหมุนจาก portrait→landscape สเกลจะไม่อัปเดต
- **ไฟล์:** `script.js`
- **วิธี:** เพิ่ม listener `window.resize` / `orientationchange` (debounce ~250ms) → ถ้าผู้ใช้ยัง **ไม่เคยซูมเอง** ให้ recompute fit แล้ว `renderPage(pageNum)`; ต้องเพิ่ม flag `userHasZoomed` (set = true ใน `zoomIn/zoomOut/pinch end`) เพื่อไม่รีเซ็ตซูมที่ผู้ใช้ตั้งเอง
- **Acceptance:** หมุนจอแล้วหน้ายังพอดีกว้าง, ถ้าผู้ใช้ซูมเองไว้ค่าไม่ถูกรีเซ็ต

#### P1.3 ปุ่ม "พอดีหน้า/พอดีกว้าง" (Fit) ใน toolbar
- **ทำไม:** ผู้ใช้ควรกดรีเซ็ตซูมกลับให้พอดีจอได้
- **ไฟล์:** `index.html` (เพิ่มปุ่มใน more-tools), `script.js`
- **Acceptance:** กดแล้ว scale กลับเป็น fit-to-width, ทำงานทุก breakpoint

#### P1.4 ตรวจ/แก้ความถูกต้องของสารบัญ (TOC)
- **ทำไม:** ถ้า PDF ไม่มี outline จะ fallback เป็นเลขหน้า hardcode (`loadTOC` ใน `script.js`) ซึ่งอาจไม่ตรงหน้าจริง
- **วิธี:** เปิด PDF จริง ตรวจว่ามี `getOutline()` หรือไม่ ถ้าไม่มี ให้ทำสารบัญที่ถูกต้องต่อเล่ม (ระบุหัวข้อ→เลขหน้าจริง) หรือสร้างจากการสแกนหัวข้อ
- **Acceptance:** ทุกลิงก์สารบัญพาไปหน้าที่ถูกต้อง

#### P1.5 ย้ายข้อมูลผู้ใช้จาก localStorage → IndexedDB สำหรับ highlight/notes (ถ้าจำเป็น)
- **ทำไม:** ไฮไลต์เก็บเป็น array ของพิกัด (อาจใหญ่) ใน localStorage ซึ่งมี quota ~5MB อาจเต็ม
- **วิธี:** เพิ่ม abstraction layer อ่าน/เขียน (มี IndexedDB อยู่แล้วสำหรับ page cache) + migration จาก localStorage เดิม
- **Acceptance:** ไฮไลต์/โน้ตเยอะๆ ไม่ทำให้ `QuotaExceededError`

### 🟠 P2 — ฟีเจอร์ระดับมืออาชีพที่ขาด

#### P2.1 โหมดท่องจำ (Memorization Mask) — ฟีเจอร์ค้างไว้
- **สถานะ:** มี CSS `.memorization-mask` ใน `style.css` แต่ **ไม่มี JS** ใช้งาน
- **วิธี:** เพิ่มโหมดปิดบังข้อความ (แตะเพื่อเผย/ปิด) สำหรับฝึกท่องจำดุอา — วาดบนเลเยอร์เดียวกับ highlight หรือสร้าง overlay จากการเลือกข้อความ
- **Acceptance:** เปิดโหมด → ข้อความถูกบัง, แตะเผยทีละส่วน, สถานะบันทึกต่อหน้า

#### P2.2 ค้นหาข้อความในหนังสือ (Full-text search)
- **วิธี:** ใช้ `page.getTextContent()` ของ pdf.js ทำ index ค้นหา → ไฮไลต์ผลลัพธ์ + กระโดดไปหน้า (ระวัง performance เล่ม 69MB — ทำ lazy/async + cache index ใน IndexedDB)
- **Acceptance:** พิมพ์คำไทย/อาหรับแล้วเจอผล กระโดดไปถูกหน้า

#### P2.3 ตั้งค่าการอ่าน (เก็บถาวร): ขนาดเริ่มต้น, ความสว่าง PDF, ความเร็วแอนิเมชัน
- **ไฟล์:** เพิ่ม section ใน sidebar
- **Acceptance:** ค่าคงอยู่ข้าม session

#### P2.4 ปุ่มแชร์ (Web Share API) + คัดลอกข้อความที่เลือก
- **Acceptance:** บนมือถือเรียก share sheet ได้, desktop คัดลอกลิงก์/ข้อความ

#### P2.5 Export/Import ข้อมูลผู้ใช้ (bookmark/notes/highlight) เป็น JSON
- **ทำไม:** กันข้อมูลหายเมื่อล้าง browser / ย้ายเครื่อง
- **Acceptance:** ดาวน์โหลด `.json` และนำเข้ากลับได้ครบ

#### P2.6 ปรับ install.html ให้ไม่ปิดการซูม (a11y)
- **สถานะ:** `install.html` มี `maximum-scale=1.0, user-scalable=no` (ปิดการซูม = ปัญหา accessibility)
- **วิธี:** เอา `user-scalable=no` ออก หรือใช้วิธีอื่นกัน scroll แทน
- **Acceptance:** ผู้ใช้ซูมหน้า install ได้

#### P2.7 หน้าจอ onboarding/empty-state & error states ที่สวยขึ้น ⟶ อาจใช้ image2.0
- ภาพ illustration ตอนโหลด/ผิดพลาด/ออฟไลน์ ให้ดูเป็นแอปจริง (ดู §4)

### 🟡 P3 — ขัดเกลา (Polish)

- P3.1 **No-flash theme:** ย้ายการ apply ธีม (dark/sepia) เป็น inline script ใน `<head>` ก่อน paint (ตอนนี้อยู่ใน DOMContentLoaded → มีกระพริบเล็กน้อยสำหรับผู้ใช้ dark)
- P3.2 **iOS splash screens:** เพิ่ม `<link rel="apple-touch-startup-image">` หลายขนาด (ตอนนี้ iOS ขึ้นจอขาวตอนเปิด) ⟶ ใช้ image2.0 สร้าง splash (ดู §4)
- P3.3 **og:image การ์ดแชร์** 1200×630 เฉพาะ (ตอนนี้ใช้ icon.png) ⟶ image2.0
- P3.4 **Skeleton/placeholder** ระหว่างเรนเดอร์หน้าแทนข้อความ "กำลังโหลด..." บน canvas
- P3.5 **PDPA/consent:** มี Google Analytics (`G-880D9JST3X`) — เพิ่มแบนเนอร์ขอความยินยอม cookie/analytics ให้ถูกกฎหมายไทย
- P3.6 **Lighthouse ≥ 90 ทั้ง 4 หมวด** (Performance/Accessibility/Best Practices/SEO)
- P3.7 **เพิ่ม `<noscript>`** แจ้งเตือนเมื่อปิด JS

---

## 3) Checklist ความเข้ากันได้มือถือ/iPad (ต้องผ่านทุกข้อ)

ทดสอบบนอุปกรณ์/emulator: iPhone (มี notch), iPad (portrait+landscape), Android Chrome

- [ ] หน้า PDF **พอดีความกว้างจอ** ไม่ต้องเลื่อนแนวนอนเพื่ออ่าน (ทำแล้วใน P0)
- [ ] เนื้อหาไม่ถูก notch/home-indicator บัง (safe-area — ทำแล้วใน P0 ตรวจซ้ำบนเครื่องจริง)
- [ ] Pinch-to-zoom ลื่น, จุดโฟกัสถูกต้อง (อย่าแก้ logic เดิมโดยไม่ทดสอบ iOS)
- [ ] ปัดขึ้น/ลงสุดขอบ = เปลี่ยนหน้า, ปัดกลางหน้า = อ่านปกติ (ทดสอบ rubber-band iOS)
- [ ] หมุนจอแล้ว layout ไม่พัง (ต่อยอด P1.2)
- [ ] ติดตั้งลงหน้าจอหลักจาก install.html ได้ทั้ง Android (Chrome) และ iOS (Safari)
- [ ] เปิดแบบ standalone แล้ว **ไม่ redirect ไป install.html** (logic ใน `index.html` head)
- [ ] แตะปุ่มทุกปุ่มมีขนาด ≥ 44×44px (Apple HIG)
- [ ] ใช้งานออฟไลน์ได้หลังเปิดครั้งแรก (เล่มเล็กแน่ๆ, เล่มใหญ่เท่าหน้าที่เคยเปิด)

---

## 4) Asset ที่ต้องสร้างด้วย **image2.0** (เครื่องมือสร้างภาพ AI ของ Codex)

> เจ้าของระบุให้ **ใช้ image2.0 สร้างรูปแบบ/เอฟเฟค/ฟีเจอร์ภาพทั้งหมด** ด้านล่างคือ prompt พร้อมใช้
> **โทนแบรนด์:** peach/salmon `#FF8A65`, gold `#FFB74D`, พื้นพีชอ่อน `#FFF5F0`, สไตล์อิสลามิกโมเดิร์น มินิมอล อบอุ่น
> หลังสร้างทุกภาพ: export ขนาดที่ระบุ → optimize (pngquant/oxisvg) → วางในโปรเจกต์ → อัปเดต reference ใน `manifest.json`/`index.html` → bump `sw.js` cache

| # | ไฟล์ | ขนาด | ใช้ที่ |
|---|------|------|-------|
| A | `icon-192.png`, `icon-512.png` | 192, 512 | manifest any |
| B | `icon-maskable-512.png` | 512 (safe-zone 20%) | manifest maskable / Android adaptive |
| C | `apple-touch-icon-180.png` | 180 | iOS home icon |
| D | `og-card.png` | 1200×630 | og:image การ์ดแชร์ |
| E | `splash-*.png` | ตามรุ่น iPhone/iPad | apple-touch-startup-image |
| F | `illustration-offline.svg` / `-error.svg` / `-empty.svg` | vector | empty/error states |
| G | (option) พื้นหลังลายอิสลามิก / texture กระดาษ | tile | sepia/reading bg |

**Prompt A/B/C (ไอคอนแอป):**
> "A modern minimalist app icon for an Islamic dua & azkar reading app. An open book combined with a subtle crescent moon, warm peach-to-salmon gradient (#FF8A65 to #F4511E) on a soft cream background (#FFF5F0), flat vector style, rounded, clean, centered, generous padding/safe-zone, no text. Square, high contrast, suitable as a maskable PWA icon."

**Prompt D (og card 1200×630):**
> "A social share banner (1200x630) for an Islamic dua & azkar reader web app. Left side: app name 'Dua Mustajab' in clean Thai-friendly typography; right side: an open book with soft crescent and gentle gold light rays. Warm peach/salmon palette (#FF8A65, #FFB74D) on cream (#FFF5F0), minimalist, elegant, lots of whitespace, modern Islamic geometric accents in the corners."

**Prompt E (iOS splash):**
> "A clean PWA launch/splash screen, centered open-book-with-crescent logo on a soft peach gradient (#FFF5F0 to #FFE0D2), generous margins, minimalist, no text, calm and warm." (สร้างหลายอัตราส่วนตามรุ่น iPhone/iPad)

**Prompt F (illustrations):**
> "A friendly minimalist line illustration for an [offline / error / empty] state of an Islamic reading app, peach/salmon accent (#FF8A65) on transparent background, soft rounded shapes, warm and reassuring, vector style, no text."

> หมายเหตุ: คงสัดส่วน/พาเลตเดิมให้ทุกภาพดูเป็นชุดเดียวกัน และทดสอบ contrast ทั้ง light/dark/sepia

---

## 5) การ Deploy (GitHub Pages)

ตั้งค่าไว้แล้วใน `.github/workflows/deploy.yml` (deploy อัตโนมัติทุก push ขึ้น `main`)

**ตั้งค่าครั้งแรก (ทำครั้งเดียว):**
1. GitHub repo → **Settings → Pages**
2. **Build and deployment → Source = `GitHub Actions`**
3. push ขึ้น `main` → ดู workflow รันที่แท็บ **Actions**
4. URL: `https://nusofwan.github.io/azkar-duamustajab-reader/`

**ตรวจหลัง deploy:**
- [ ] เปิด URL → redirect ไป `install.html` (พฤติกรรมตั้งใจ)
- [ ] ติดตั้ง PWA แล้วเปิด standalone → เข้า reader ตรง (ไม่ redirect)
- [ ] เล่มใหญ่โหลดแบบ range request (Network tab เห็น `206 Partial Content`)
- [ ] Service Worker ลงทะเบียนสำเร็จ, ออฟไลน์ใช้งานได้

**ทางเลือกถ้าไม่อยากใช้ Actions:** Settings → Pages → Source = `Deploy from a branch` → `main` / `/ (root)` (มี `.nojekyll` แล้ว)

> ⚠️ Git LFS ใช้ไม่ได้กับ GitHub Pages — เก็บ PDF เป็นไฟล์ปกติต่อไป
> ⚠️ ถ้า bandwidth/ขนาดเป็นปัญหา พิจารณาย้ายเฉพาะ PDF ใหญ่ไป object storage/CDN แล้วชี้ URL แทน

---

## 6) ขั้นตอนการทำงานมาตรฐานของ Codex (ต่อ 1 งาน)

1. อ่าน §0 (กติกา) + งานที่เลือกใน §2
2. แก้โค้ดเป็นชิ้นเล็ก commit ย่อย ข้อความ commit สื่อความหมาย
3. `node --check script.js && node --check sw.js`
4. เสิร์ฟ local: `python -m http.server 8000` → เปิด `index.html?app=true`
5. ทดสอบความกว้าง **375 / 768 / 1280** + light/dark/sepia + ตรวจ console ไม่มี error
6. ถ้าแก้ asset/JS/CSS → **bump `CACHE_NAME`** ใน `sw.js`
7. อัปเดต checkbox ในไฟล์นี้ (§1/§2) ให้สะท้อนสถานะจริง
8. push → ตรวจผล deploy บน Pages

---

## 7) Definition of Done (ภาพรวมโครงการ)

- [ ] P1 ทั้งหมดเสร็จ + ไม่มี console error/warning
- [ ] Lighthouse ≥ 90 ทั้ง 4 หมวด (มือถือ)
- [ ] ติดตั้ง + ใช้งานออฟไลน์ได้จริงบน iOS Safari และ Android Chrome
- [ ] แสดงผลถูกต้องไม่ผิดเพี้ยนบน iPhone (notch) / iPad (portrait+landscape) / เดสก์ท็อป
- [ ] Asset ภาพทั้งหมด (§4) สร้างด้วย image2.0 และ optimize แล้ว
- [ ] deploy ขึ้น GitHub Pages สำเร็จและเข้าถึงได้
