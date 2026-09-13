# Uzbek Meme Cam 🇺🇿

Kamera qo‘l ishoralarini taniydi va ularga mos o‘zbekcha meme-reaksiyalarni ko‘rsatadi.

## v0.1

- MediaPipe Hand Landmarker orqali qo‘l kuzatuvi
- 8 ta gesture: Shaka, Rock, Pinch, Facepalm/Open Palm, Double Fist, Peace, Fist, Point
- O‘zbekcha reaction-memelar
- Brauzer va Electron/macOS rejimi
- Kamera tasviri lokal qayta ishlanadi
- Meme pack `config/memes.json` orqali o‘zgartiriladi

## Ishga tushirish

```bash
npm install
npm run app
```

Brauzerda:

```bash
npm install
npm start
```

so‘ng `http://localhost:5173` ni oching.

## Test tugmalari

- `1`–`8` — reactionlarni qo‘lda ko‘rsatish
- `D` — demo rejimini yoqish/o‘chirish

## Meme almashtirish

SVG/JPG/PNG faylni `assets/memes/` ichiga qo‘ying va `config/memes.json` ichidagi `image` yo‘lini o‘zgartiring.

> Bu loyiha gesture-meme-camera g‘oyasidan ilhomlangan, ammo implementatsiya mustaqil yozilgan.
