# Kahraman portreleri

Oyundaki **kahraman** kartlarının altın çerçeveli portreleri buraya konur.

## Dosya adı kuralı — EN ÖNEMLİ MADDE

Dosya adı, kartın **İNGİLİZCE** adından türetilir (küçük harf, boşluk ve
noktalar tire olur): `Mini P.E.K.K.A` → `mini-pekka`, `Berserker` →
`berserker`.

**Türkçe ada göre adlandırmayın.** Bir kez yapıldı ve pahalıya mal oldu:
oyunun kahraman ekranında "Yaramaz" yazan portre, Türkçesi tahmin edilerek
`bandit.jpeg` diye kaydedildi. Oysa o kahraman **Berserker**'dı; Haydut
(Bandit) kahraman bile değil. Sonuç: her Haydut'lu destede Haydut'un yerine
Berserker'ın portresi çizildi ve kullanıcı "aynı destede iki Yaramaz var"
diye bildirdi.

Doğru dosya adını tahmin etmeden bulmanın yolu var — aşağıya bakın.

## Hangi kart hangi dosya?

Clash Royale API'si artık kahraman görselini **kendisi yayımlıyor**:
`iconUrls.heroMedium`. Bu alanı taşıyan kart sayısı oyunun kahraman sayısıyla
birebir aynı: **17** (Eylül 2026'da Buz Büyücüsü'yle 16'dan 17'ye çıktı). Kod
da kahraman listesini bu alandan kuruyor; tahmin yok.

**SVG kabul edilmez.** İçine PNG gömülü bir `.svg` geldiyse gömülü PNG'yi
çıkarıp `<slug>.png` olarak kaydedin (Buz Büyücüsü böyle geldi).

Görselleri o adresten indirdiyseniz dosya adları Supercell'in varlık
karmasıdır (`jAj1Q5rclXxU9kVImGqSJxa4wEMfEhvwNQ_4jiGUuqg.webp` gibi). Doğru
adı bulmak için karmayı `heroMedium` adresiyle eşleştirin — böyle
eşleştirmek **birebir** olur, göze bakmaya gerek kalmaz:

```
karma = heroMedium adresinin son parçası (uzantısız)
dosya adı = o karmaya sahip kartın İngilizce adının slug'ı
```

## Dosya koymak zorunlu değil

`heroPortrait()` önce diske bakar, dosya yoksa API'nin `heroMedium`
adresine düşer. Yani yanlış ya da eksik bir dosya artık kahramanı boş
bırakmıyor. Disk kopyası sadece hızlı olsun ve dış sunucuya bağımlı
kalmayalım diye tutuluyor.

Kabul edilen uzantılar, bakılma sırasıyla: `png`, `webp`, `jpg`, `jpeg`.
Kod değişikliği ya da yeniden başlatma gerekmez.

## Şu anki durum

17/17 portre yerinde. İlk 16'sı `.webp` ve API'nin `heroMedium` karmasıyla
birebir eşleştirilerek adlandırıldı. 17. kahraman Buz Büyücüsü (Eylül 2026)
elle eklendi: `ice-wizard.png`, 300×360, saydam PNG.

| Kart (İngilizce) | Türkçe | Dosya |
|---|---|---|
| Knight | Şövalye | `knight.webp` |
| Goblins | Goblinler | `goblins.webp` |
| Giant | Dev | `giant.webp` |
| Balloon | Balon | `balloon.webp` |
| Valkyrie | Valkür | `valkyrie.webp` |
| Musketeer | Silahşör | `musketeer.webp` |
| Wizard | Büyücü | `wizard.webp` |
| Mini P.E.K.K.A | Mini P.E.K.K.A | `mini-pekka.webp` |
| Dark Prince | Kara Prens | `dark-prince.webp` |
| Bowler | Atıcı | `bowler.webp` |
| Ice Golem | Buz Golemi | `ice-golem.webp` |
| Mega Minion | Mega Minyon | `mega-minion.webp` |
| Berserker | Yaramaz | `berserker.webp` |
| Magic Archer | Büyülü Okçu | `magic-archer.webp` |
| Tombstone | Mezar Taşı | `tombstone.webp` |
| Barbarian Barrel | Barbar Fıçısı | `barbarian-barrel.webp` |
| Ice Wizard | Buz Büyücüsü | `ice-wizard.png` |

## Notlar

- Görseller **kendi altın çerçeveleriyle** kullanılır; site üzerlerine ikinci
  bir çerçeve çizmez.
- Dikey (portre) oran en iyisi — oyundaki kart oranı yaklaşık **5:6**.
- `t_kahraman` paketi bu klasörü denetler: 16 kahraman var mı, hepsinin
  portresi var mı, dosya adı kartın İngilizce adıyla eşleşiyor mu.
