# 1. Mahsulot Kontseptsiyasi
"WordCross Multiplayer" foydalanuvchilarning ingliz tili so'z boyligini (B1/B2 darajada) oshirish uchun mo'ljallangan sun'iy intellektga asoslangan interaktiv krossvord o'yinidir. Tizim foydalanuvchi kiritgan so'zlardan avtomatik ravishda kontekstual gaplar yaratadi va ularni krossvord grid (katakchalar to'plami) shakliga o'zgartiradi. Ilovada yakkaxon (Single Player) va boshqa o'yinchilar bilan real vaqtda bellashish imkonini beruvchi (1v1 Multiplayer) rejimlar mavjud bo'lib, o'quv jarayonini raqobatbardosh, interaktiv va qiziqarli qiladi.

# 2. Tizim Arxitekturasi Diagrammasi (Matnli tasvir)

Tizim uchta asosiy ustunga quriladi: **Frontend (Vue 3)**, **Backend/DB/Realtime (Supabase)** va **AI Model (Gemini API)**.

```text
[ Foydalanuvchi interfeysi (Client) ]
         |
    (Vue 3 + Tailwind CSS)  <----- (Dinamik Krossvord Render, UI reaksiyalari)
         |
         |-------------------------------------------------------|
         |                                                       |
[ Supabase (BaaS) ]                                     [ AI xizmati ]
         |                                                       |
  - Auth: Email/Google orqali avtorizatsiya                      |
  - Database: Foydalanuvchilar, So'zlar, Xonalarni saqlash       |
  - Realtime: WebSocket (1v1 xona sinxronizatsiyasi,        [ Gemini API ]
    "Presence" onlayn treking, "Broadcast" harflar kiritilishi)  |
         |                                                       |
         |------------------- (Edge Functions)-------------------|
                              Xavfsiz API orqali gap generatsiyasi
```
* **Izoh:** Vue 3 dan Supabase ma'lumotlar bazasiga ma'lumot jo'natiladi. Agar so'z yangi bo'lsa, API integratsiyasi orqali Gemini AIdan so'ro'v olinadi va qaytgan javob (kontekst) bazada saqlanadi. O'yin paytida Realtime kanallar orqali katakchalarning holati sinxronlashadi.

# 3. Supabase Ma'lumotlar Bazasi Sxemasi (SQL)

Supabase PostgreSQL uchun kerakli relatsion jadvallar:

```sql
-- 1. Foydalanuvchilar (Supabase Auth bilan ulanish uchun)
CREATE TABLE users (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    total_score INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. So'zlar bazasi (Foydalanuvchi lug'ati)
CREATE TABLE words (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    word VARCHAR(255) NOT NULL,
    context_clue TEXT NOT NULL,
    translation VARCHAR(255),
    learned_status BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. O'yin Xonalari (Multiplayer uchun)
CREATE TABLE game_rooms (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player1_id UUID REFERENCES users(id),
    player2_id UUID REFERENCES users(id),
    crossword_data JSONB NOT NULL, -- Grid ma'lumotlari va koordinatalar
    status VARCHAR(50) DEFAULT 'waiting', -- holati: 'waiting', 'active', 'finished'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. O'yin Natijalari / Ballar
CREATE TABLE game_scores (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    score INT DEFAULT 0,
    completion_time_sec INT,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

# 4. AI Prompt Strategiyasi

Gemini API orqali Eng yaxshi sifatli va ta'limotga mos keladigan natija olish uchun aniq parametrli shablon (System Instruction):

```text
Siz ingliz tili o'qituvchisisiz. Vazifangiz quyida kiritilgan ma'lum bir maqsadli so'z yordamida B1/B2 darajasidagi qisqa, tushunarli va so'zning ma'nosini mantiqiy jihatdan ochib beruvchi bitta gap tuzishdir.

QAT'IY QOIDALAR:
1. Yaratilgan gap faqat 1 ta bo'lishi shart.
2. Gap ichida maqsad qilingan so'zni olib tashlab, o'rniga "_______" (7 ta ostki chiziq) qo'ying.
3. Foydalanuvchi yashirilgan so'z aynan qaysi ekanligini taxmin qila olishi uchun gap yetarlicha mantiqiy ishorani (clue) o'z ichiga olishi shart.
4. Hech qanday qo'shimcha so'z, tarjima yoki izoh yozmang. Faqat gapning o'zini qaytaring!

Maqsadli so'z: "{TARGET_WORD}"

Natija:
```
*(Dynamic `{TARGET_WORD}` o'zgaruvchisi frontend yoki serverdan yuboriladi).*

# 5. Multiplayer Realtime Logikasi (Vue 3 + Supabase)

Ikki o'yinchi bir xonaga kirganda Supabase **Broadcast** (past kechikish, database-ni saqlash talab etilmaydi) ishlatilishi eng ideal yechimdir.

**Vue 3 da ulanish logikasi:**
1. Foydalanuvchi xonaga kirdi (Component Mount bo'ldi).
2. Xonaning maxsus kanaliga ulanamiz: `supabase.channel('room:ROOM_ID')`.
3. Raqib tarafdan yuborilgan `cell_filled` eventlarini eshitamiz.
4. Agar lokal o'yinchi biror harf yozsa, uni `broadcast.send` orqali jo'natamiz.

```javascript
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/supabase'

export function useCrosswordMultiplayer(roomId, localUserId) {
  const grid = ref([]) // Grid holati (reactive)
  let channel = null

  onMounted(() => {
    channel = supabase.channel(`room_${roomId}`)
    
    // Raqib kiritgan harflarni qabul qilish
    channel
      .on('broadcast', { event: 'cell_filled' }, (payload) => {
        const { y, x, letter, userId } = payload
        if (userId !== localUserId) {
           grid.value[y][x].letter = letter
           grid.value[y][x].from = 'opponent' // CSS ni o'zgartirish uchun
        }
      })
      .subscribe()
  })

  // Mahalliy (local) o'yinchi harf kiritganda yoziladigan funksiya:
  const fillCell = (y, x, letter) => {
    grid.value[y][x].letter = letter
    grid.value[y][x].from = 'me'
    
    // Boshqa obunachilarga e'lon qilish
    channel.send({
      type: 'broadcast',
      event: 'cell_filled',
      payload: { y, x, letter, userId: localUserId }
    })
  }

  onUnmounted(() => {
    supabase.removeChannel(channel) // Komponent o'chganda aloqani uzish
  })

  return { grid, fillCell }
}
```

# 6. UI/UX Dizayn Blueprint (Tailwind CSS)

**Vizion:** Dark Mode (to'q mavzu), kibersport elementlari, ravshan kontrastli typografiya.
Katakchalar dizayni (Vue 3 and Tailwind):

```html
<template>
  <div class="p-6 bg-slate-900 min-h-screen flex items-center justify-center">
    <!-- Grid konteyneri -->
    <div class="grid gap-1 md:gap-2 max-w-3xl mx-auto rounded-xl p-4 bg-slate-800/50 shadow-2xl">
      <div v-for="(row, y) in grid" :key="y" class="flex gap-1 md:gap-2 justify-center">
        <!-- Har bir katakcha -->
        <div
          v-for="(cell, x) in row"
          :key="`${y}-${x}`"
          class="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center font-bold text-xl rounded transition-all duration-300 select-none uppercase shadow-sm"
          :class="{
            // O'qdan xoli interfeys (qop-qora yoki transperent background)
            'bg-transparent border-transparent': cell.isEmpty,
            
            // Standart bo'sh katak
            'bg-slate-700 border-2 border-slate-600/50 text-transparent': !cell.isEmpty && !cell.letter,
            
            // Hozirgi kursor (Active) 
            'ring-4 ring-indigo-500 bg-slate-600': cell.isActive,
            
            // Mahalliy o'yinchi kiritgan harf (To'q ko'k / Neon qoshish mumkin)
            'bg-blue-600 text-white border-2 border-blue-400 shadow-[0_0_12px_rgba(37,99,235,0.6)]': cell.letter && cell.from === 'me',
            
            // Raqib kiritgan harf (Qizil/Pushti ranglar bilan farqlash)
            'bg-rose-500/20 text-rose-300 border-2 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)]': cell.letter && cell.from === 'opponent',

            // So'z to'g'ri topilganda o'zgaradigan yashil tus
            'bg-emerald-500 border-emerald-400 text-white': cell.isCorrect 
          }"
          @click="selectCell(y, x)"
        >
          {{ cell.letter }}
        </div>
      </div>
    </div>
  </div>
</template>
```

# 7. MVP Rivojlanish Yo'l xaritasi (Roadmap)

**Bosqich 1: Loyihani sozlash va UI komponentlar (1-Hafta)**
* Vue 3 + Vite muhitini boshlash, Tailwind CSS/PostCSS-ni sozlash.
* Krossvord katakchalari, Inputlar, Auth sahifalarining statik UI ko'rinishini qurish.

**Bosqich 2: Backend va Auth Integratsiyasi (2-Hafta)**
* Supabase loyihasini yaratish, sxemalarni (SQL) kiritish.
* Foydalanuvchilar ro'yxatdan o'tishi va tizimga kirish qismlarini Vue router orqali himoyalash.

**Bosqich 3: So'z bankini yaratish (3-Hafta)**
* Frontend orqali lug'at bazasiga so'z kiritish.
* Gemini API (yoki Cloud Function server) orqali kiritilgan so'z uchun kontekstual bo'shliq (_blank_) li gaplarni saqlash mantig'i.

**Bosqich 4: Krossvord Generator Engine (4-Hafta)**
* Kiritilgan ma'lum miqdordagi (masalan, 5-7 ta) so'zlardan o'zaro kesishadigan valid (yaroqli) krossvord massivini (2D Array) vizual tizish algoritmini o'rnatish.

**Bosqich 5: Single Player va Realtime Multiplayer (5-Hafta)**
* Avval individual ishlash holatini yakunlash (yozish mexanikasi, klaviatura (focus) boshqaruvi).
* Supabase Room yaratish tizimi va sharhlangan xonalar orqali `Supabase Channel Broadcast` tizimi. Raqib yozgan harflarning ekrandagi real-time renderingi.

**Bosqich 6: Yakunlash va Polishing (6-Hafta)**
* Ballar (Scores) kalkulyatori, Timer o'rnatish, chiroyli sound effect'lar, animatsiyalar qoshish.
* Onlayn serverga (Vercel / Netlify) chiqarish (Deploy) hamda ilovani productionda test qilish.
