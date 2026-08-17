# Kahraman portreleri

Oyundaki **kahraman** kartlarının altın çerçeveli portreleri buraya konur.

## Neden elle konuyor?

Bu görseller hiçbir yerde yayınlanmıyor. Kontrol edildi:

- Clash Royale API'sinde kahraman diye bir alan yok (kart görselleri sadece
  normal `iconUrls`).
- RoyaleAPI'nin asset deposunda `heroes/`, `hero/`, `prestige/`,
  `cards-prestige/` klasörlerinin hiçbiri yok (hepsi 404).
- `cards-gold/` **farklı bir şey**: normal kart resminin altın çerçeveli hâli,
  kahraman portresi değil.
- Oyunun kendi verisinde bu sistemin adı "prestige" ve görseller Supercell'in
  paketlenmiş `.sc` dosyalarının içinde — dışarıdan indirilemiyor.

Bu yüzden site diskteki dosyalara bakıyor. **Dosyayı buraya koymak yeterli** —
kod değişikliği gerekmez, sunucuyu yeniden başlatmaya da gerek yok (en fazla
15 saniye içinde görünür).

## Dosya adları

Oyundaki 16 kahraman, sırasıyla. `.png` tercih edilir; `.webp`, `.jpg` ve
`.jpeg` de kabul edilir.

| # | Kahraman | Dosya adı |
|---|----------|-----------|
| 1 | Valkür | `valkyrie.png` |
| 2 | Barbar Fıçısı | `barbarian-barrel.png` |
| 3 | Büyücü | `wizard.png` |
| 4 | Mini P.E.K.K.A | `mini-pekka.png` |
| 5 | Şövalye | `knight.png` |
| 6 | Goblinler | `goblins.png` |
| 7 | Yaramaz | `bandit.png` |
| 8 | Mezar Taşı | `tombstone.png` |
| 9 | Büyülü Okçu | `magic-archer.png` |
| 10 | Balon | `balloon.png` |
| 11 | Kara Prens | `dark-prince.png` |
| 12 | Atıcı | `bowler.png` |
| 13 | Dev | `giant.png` |
| 14 | Silahşör | `musketeer.png` |
| 15 | Buz Golemi | `ice-golem.png` |
| 16 | Mega Minyon | `mega-minion.png` |

**Durum:** 16/16 portre yerinde (`.jpeg` olarak). Uzantı önemli değil —
`heroPortrait()` png/webp/jpg/jpeg sırasıyla bakar.

## Notlar

- Görseller **kendi altın çerçeveleriyle** kullanılır; site üzerlerine ikinci
  bir çerçeve çizmez. Çerçevesiz bir görsel koyarsanız çıplak görünür.
- Dikey (portre) oran en iyisi — oyundaki kart oranı yaklaşık **5:6**.
- Henüz konmamış olanlar, karakter render'ı + CSS çerçeve ile gösterilmeye
  devam eder; yani eksik dosya sayfayı bozmaz.
- Kartlar sayfasındaki sayaç kaç portrenin yerinde olduğunu yazar.
