# Oyun modu kapakları

Meta sayfasındaki **mod seçme kutucukları** için. Oyun kapakları
`assets/img/oyunlar/`, bölüm kapakları `assets/img/arayuz/` klasöründe.

Buraya bir görsel koyduğunuzda site onu **kendiliğinden** kullanmaya
başlar — kod değiştirmek ya da yeni dağıtım gerekmez, en fazla bir
dakika içinde görünür.

## Dosya adı = modun kimliği

| Dosya adı | Mod | Kapak yoksa |
|---|---|---|
| `nihai` | Nihai Kademe (Path of Legends) | 🏅 |
| `mucadele` | Mücadele (Challenge) | ⚔️ |
| `kupa` | Kupa Yolu (Ladder) | 🏆 |

Örnek: Nihai için `nihai.png`, Mücadele için `mucadele.png`.

Koymadığınız modda emoji kalır — klasör boşken de sayfa düzgün çalışır.

## Görsel nasıl olmalı

- **Kare**, **256×256 piksel**. Ekranda 56 piksellik kutuda çiziliyor;
  daha büyüğü boşuna yük. (Oyun kapaklarında bir kez 1254×1254 dosyalar
  konmuştu, on kapak 8,8 MB tutuyordu.)
- Uzantı: `png` · `webp` · `jpg` · `jpeg` · `gif`
- Koyu zemine uyan renk ya da saydam PNG.

## Neden yalnızca üç mod

Bu liste keyfi değil, **veriyle sınırlı**. Her modun destesi o modda
oynanan gerçek maçlardan hesaplanıyor ve bazı modlarda yeterli maç
birikmiyor:

- **Büyük ve Küçük Mücadele ayrılamıyor.** Supercell'in maç kaydında
  kademeyi söyleyen bir alan yok — ikisi de aynı mod adıyla geliyor
  (`Challenge_AllCards_EventDeck_NoSet`). Kayıtta yalnızca `eventTag`
  var, o da hangi etkinlik olduğunu söylüyor, hangi kademe olduğunu
  değil. Ayırmak, hangi maçın hangi kademeden geldiğini uydurmak olurdu.
- **Kaos** dönemsel bir etkinlik; 200 oyuncunun günlüğünde 22 maç
  görünüyor ve çoğu arkadaş maçı. Meta çıkaracak veri yok.

Bir mod için yeterli veri birikmeye başlarsa buraya eklenebilir; ölçüm
`server/modmeta.js` başında yazılı.

## Veriler ne kadar güvenilir

- **Nihai Kademe** her tazelemede yeniden hesaplanıyor (~4.900 maç).
- **Mücadele ve Kupa Yolu** zaman içinde birikiyor: tek tazelemede
  yeterli maç toplanmıyor, o yüzden maçlar saklanıyor. Aynı maçın iki
  kez sayılmaması için maç kimlikleri de saklanıyor — sunucu yeniden
  başladığında bile.
- Kazanma oranı **yalnızca 40 maçı geçen** destelerde yazılıyor. Altında
  kalan destede yüzde yerine kaç maça dayandığı görünüyor.
- Oranlar **denge düzeltmeli**: örneklenen oyuncular rakiplerinden
  güçlü olduğu için ham oran destenin değil oyuncunun başarısını
  ölçüyor. Düzeltme ölçüldü, ortalama 25 puan fark yaratıyor.
