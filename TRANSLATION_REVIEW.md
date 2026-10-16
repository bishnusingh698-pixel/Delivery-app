# Translation review

All 27 non-English storefront languages were translated from `locales/storefront/en.json` using the context in `_context.json` (where each string appears and its maximum length). They pass the automated checks (`npm test` and `npm run test:browser`), but **none has been checked by a native speaker yet**. This file lists, per language, the register and glossary used and every string the translator was unsure about, so a reviewer can go straight to those.

## Applies to every language

- **Method names must match Shopify's checkout.** `method.delivery`, `method.pickup` and `method.shipping` were written from memory of Shopify's checkout wording. Open a live checkout in each language and copy Shopify's exact terms. This is the single most important review item.
- **"Google Calendar" link (`thankyou.google`).** Some languages use Google's own localised product name (for example de/sv/da/nb "Google Kalender", nl "Google Agenda", fi "Google Kalenteri", ja/ko/zh), others keep the English name. Both are acceptable; pick one style per language if you prefer.
- **Summary lines** (`summary.*`) mostly use a "Delivery: {date}" colon pattern so they still read correctly when the date is the word for Today or Tomorrow.
- **Dates after prepositions.** Dates come from the browser's `Intl` formatter in the nominative/basic form. Languages with grammatical case (pl, cs, el, fi, tr, ro, he) avoid placing a preposition or suffix directly on `{date}`.
- **Merchants can override any string** per language in Pickday > Widget & text, so a store can fix wording without waiting for an app update.

## Spanish (`es`)
### Register
"tú" throughout, as the brief requires. Spanish shop checkouts, including Shopify's, address shoppers with tú. Vocabulary is neutral international Spanish (Shopify's es leans Latin American: "Retiro", "agregar").

### Glossary
- Local delivery: Entrega local
- Pickup: Retiro (location: "Punto de retiro")
- Shipping: Envío
- Checkout: Finalizar la compra / pantalla de pago (strings say "antes de finalizar la compra")
- Cart: Carrito
- Postcode: Código postal

### Low confidence
- method.pickup / method.shipping / method.delivery: matched from memory of Shopify's es checkout ("Envío" / "Retiro" / "Entrega local"). Confirm against a live es checkout. A Spain-only audience may prefer "Recogida".
- product.countdown.pickup: "retíralo" goes with "Retiro". In Spain "recógelo" would sound more natural.
- slot.left: "plaza" is the Spain word. In Latin America "lugar" or "cupo" would be more usual.
- thankyou.heading: "Tu entrega programada" is also used for pickup orders. That is acceptable, but a native speaker may prefer something more neutral.
- vacation / thankyou.*: "el {date}" assumes Intl output like "viernes, 16 de octubre". If {date} can be "Hoy"/"Mañana" here, it would read "el Hoy".

## French (`fr`)
### Register
"vous" throughout, as the brief requires. Uses French typography: a no-break space (U+00A0) before ":" and "?".

### Glossary
- Local delivery: Livraison locale
- Pickup: Retrait (location: "Point de retrait")
- Shipping: Expédition
- Checkout: Paiement ("avant de passer au paiement")
- Cart: Panier
- Postcode: Code postal

### Low confidence
- method.pickup / method.shipping: Shopify fr shows "Retrait" or "Retrait en magasin", and "Expédition" or "Livraison" depending on the screen. Confirm against a live fr checkout.
- area.covered / area.notCovered: "nous livrons au {postcode}" ("au 75011") is common in speech, but a native speaker should confirm it reads well in a UI.
- area.coveredArea: "dans la zone {area}" can sound clunky with some area names.
- thankyou.heading: "Votre livraison prévue" is also shown for pickup orders.
- poweredBy: "Propulsé par" is Shopify's own footer wording. Keep it or change it to taste.
- vacation: shortened to "Commandes possibles dès le {nextDate}." to fit 100 characters. This drops "still".

## German (`de`)
### Register
Formal "Sie" throughout (required by brief; standard in German shop checkouts). Imperatives as "Bitte wählen Sie …".

### Glossary
- Local delivery: Lokale Zustellung
- Pickup: Abholung
- Shipping: Versand
- Checkout: Kasse ("zur Kasse gehen")
- Cart: Warenkorb
- Postcode: Postleitzahl (PLZ in the short error message)

### Low confidence
- method.delivery: "Lokale Zustellung" is my recollection of Shopify's German checkout term; verify against a live German Shopify checkout (could be "Lokale Lieferung").
- method.pickup: Shopify may use "Abholung" or "Abholung vor Ort"; I used "Abholung".
- thankyou.google: used Google's official German product name "Google Kalender" instead of English "Google Calendar"; revert if the brand must stay English.
- product.countdown.*: restructured to the Amazon-style "Lieferung morgen, wenn Sie innerhalb von 2 Std. 15 Min. bestellen" (fact first, condition after); rendered text with a long date may exceed 80 chars.
- summary.* / summary.pickupAt*: used "Lieferung: {date}" colon style so it also reads correctly when {date} is "Heute"/"Morgen".
- vacation: exactly 100 chars; "bis einschließlich" keeps the "last closed day" meaning.
- reason.vacation: "Betriebsferien" (shop holiday closure) – natural, but a native speaker may prefer "Urlaubsbedingt geschlossen".

## Italian (`it`)
### Register
Informal "tu", the norm in Italian e-commerce (Amazon.it, Zalando, Shopify's it checkout all use "tu").

### Glossary
- Local delivery: Consegna locale
- Pickup: Ritiro (location: "Punto di ritiro")
- Shipping: Spedizione
- Checkout: Pagamento / Check-out (strings say "procedere al pagamento")
- Cart: Carrello
- Postcode: CAP

### Low confidence
- method.pickup: Shopify it may show "Ritiro in negozio" rather than "Ritiro". Confirm against a live it checkout.
- area.coveredArea: "consegniamo in zona {area}" depends on how merchants name their areas.
- vacation: "fino al {date}" with a weekday date ("fino al venerdì 16 ottobre") should be "fino a venerdì…". Check against the real Intl output.
- product.countdown.* / thankyou.*: "il {date}" has the same weekday-article issue as above.
- thankyou.heading: "Data di consegna o ritiro" is a free rewrite of "Your delivery schedule".
- slot.busy: "Giornata molto richiesta" is a rewrite of "Busy day".

## Portuguese (Brazil) (`pt-BR`)
### Register
"você", the standard in Brazilian e-commerce, with possessives written without the article ("seu pedido").

### Glossary
- Local delivery: Entrega local
- Pickup: Retirada (location: "Local de retirada")
- Shipping: Frete
- Checkout: Finalizar compra
- Cart: Carrinho
- Postcode: CEP

### Low confidence
- method.shipping: "Frete" is my memory of Shopify pt-BR. It could be "Envio". Date labels and summaries use "envio" for dispatch. Confirm.
- product.countdown.*: "em {date}" with a weekday date ("em sexta-feira, 16 de outubro") is slightly stiff. "na sexta-feira" is more natural but depends on the date format.
- tzNote: "Datas e horários no fuso: {zone}." is clipped. Check how it reads with the real zone name.
- slot.full "Lotado" / reason.full "Sem vagas": word choice for capacity.
- thankyou.shipping / thankyou.dispatch: phrased as "A previsão de … é {date}".

## Portuguese (Portugal) (`pt-PT`)
### Register
Formal third person without a pronoun ("Escolha", "a sua encomenda"), the standard in Portuguese e-commerce. Avoids "você" and "tu". Uses European vocabulary: "encomenda", "levantamento", "artigo".

### Glossary
- Local delivery: Entrega local
- Pickup: Levantamento (location: "Local de levantamento")
- Shipping: Envio
- Checkout: Finalizar compra
- Cart: Carrinho
- Postcode: Código postal

### Low confidence
- method.pickup: Shopify pt-PT may use "Recolha" rather than "Levantamento". Confirm against a live pt-PT checkout.
- reason.full: "Lotação esgotada" may feel heavy. "Completo" is an alternative.
- tzNote: "Datas e horas no fuso horário: {zone}." is clipped.
- product.earliest.pickup: "Primeiro levantamento: {date}" was shortened from "Primeira data de levantamento".
- fee.label: "Sobretaxa de entrega" could also be "Taxa adicional".

## Dutch (`nl`)
### Register
Informal "je/jij" (required by brief; standard in Dutch e-commerce such as bol.com and Coolblue).

### Glossary
- Local delivery: Lokale bezorging
- Pickup: Ophalen
- Shipping: Verzenden
- Checkout: Afrekenen
- Cart: Winkelwagen
- Postcode: Postcode

### Low confidence
- method.pickup / method.shipping: Shopify's Dutch checkout uses the verbs "Verzenden" / "Ophalen" as I recall; check that it isn't "Verzending" / "Afhalen" in the current checkout.
- thankyou.google: used the official Dutch product name "Google Agenda"; revert to "Google Calendar" if the brand must stay English.
- reason.tooSoon: "Te kort dag" is idiomatic but slightly colloquial; alternative "Te vroeg".
- thankyou.heading: "Jouw bezorgmoment" (singular) rather than a literal "schedule"; may read odd for pickup-only orders.
- summary.*: colon style ("Bezorging: {date}") so it works when {date} is "Vandaag"/"Morgen".

## Swedish (`sv`)
### Register
Informal "du" – the universal form of address in Swedish e-commerce.

### Glossary
- Local delivery: Lokal leverans
- Pickup: Upphämtning
- Shipping: Frakt
- Checkout: Kassa ("gå till kassan")
- Cart: Varukorg
- Postcode: Postnummer

### Low confidence
- method.pickup: Shopify's Swedish checkout might say "Hämta" or "Upphämtning i butik"; I used "Upphämtning".
- thankyou.google: used the official Swedish product name "Google Kalender".
- product.countdown.* / thankyou.shipping / thankyou.dispatch / thankyou.pickupAt: {date} is inserted without a preposition ("leverans fredag 16 oktober"), which is common in shop UIs but a native speaker may want "den" or "på".
- location.instructions: "Info om upphämtning" chosen for brevity; "Instruktioner för upphämtning" is 31 chars.
- slot.label: "Tid" is short; "Tidsfönster" is an alternative.

## Danish (`da`)
### Register
Informal "du" – standard in Danish webshops.

### Glossary
- Local delivery: Lokal levering
- Pickup: Afhentning
- Shipping: Forsendelse
- Checkout: Betaling / kassen ("gå til betaling")
- Cart: Kurv / indkøbskurv
- Postcode: Postnummer

### Low confidence
- method.shipping: Shopify's Danish checkout uses "Forsendelse" as I recall; it could be "Levering" in some places – verify.
- Checkout term: Shopify DA might say "Gå til kassen" rather than "betaling"; used "går til betaling" in validation.*.
- thankyou.google: used "Google Kalender" (official Danish name).
- product.countdown.* / thankyou.pickupAt / thankyou.shipping: {date} inserted without "d." or "den"; reads fine in UI but check.
- slot.busy: "tidsrum" is the same in singular and plural, so both plural branches are identical (intentional).

## Norwegian Bokmål (`nb`)
### Register
Informal "du" – standard in Norwegian online shops.

### Glossary
- Local delivery: Lokal levering
- Pickup: Henting
- Shipping: Frakt
- Checkout: Kasse ("gå til kassen")
- Cart: Handlekurv
- Postcode: Postnummer

### Low confidence
- method.pickup: Shopify's Norwegian checkout may use "Henting i butikk" or "Hent"; I used "Henting".
- thankyou.google: used "Google Kalender" (official Norwegian name).
- thankyou.dispatch: "er planlagt sendt {date}" is idiomatic but terse; check.
- validation.dateUnavailable / methodUnavailable / surcharge: comma before main verb after a relative clause ("Datoen du valgte, er …") follows the official comma rule; some shops omit it.

## Finnish (`fi`)
### Register
Informal "sinä" with imperatives ("Valitse", "Tilaa") – standard in Finnish e-commerce.

### Glossary
- Local delivery: Paikallinen toimitus
- Pickup: Nouto
- Shipping: Toimitus
- Checkout: Kassa ("siirry kassalle")
- Cart: Ostoskori
- Postcode: Postinumero

### Low confidence
- method.shipping: "Toimitus" is my recollection of Shopify's Finnish checkout; it may be "Lähetys" – verify. It also overlaps with "Paikallinen toimitus".
- Placeholders cannot be inflected, so I used a head noun in apposition or a colon ("postinumeroon {postcode}", "alueelle {area}", "Tuotetta {product}", "Noutopaikka: {location}", "aikavyöhykkeellä {zone}"). Check these, especially reason.productUnavailable and reason.soldOut (colon style).
- vacation: "{date} asti" puts a nominative Intl date ("perjantai 16. lokakuuta") before "asti"; this is understandable but not perfect grammar.
- thankyou.pickupAt: "Voit noutaa tilauksesi {date}." puts the nominative weekday where an essive ("perjantaina") would be ideal.
- product.countdown.dispatch: "lähetämme {date}" has the same nominative-date issue.
- thankyou.google: used "Google Kalenteri" (official Finnish name).
- duration.hm: "{hours} t {minutes} min" – "t" for tunti; "h" is also common.

## Polish (`pl`)
### Register
Informal "ty" imperatives ("Wybierz", "Zamów", "Wróć do koszyka"), which is the norm in Polish shop UIs and in Shopify's own Polish checkout. Used consistently; possessive "Twoim" capitalised in full-sentence checkout errors, as Polish shops usually do.

### Glossary
- Local delivery: Dostawa lokalna
- Pickup: Odbiór osobisty
- Shipping: Wysyłka
- Checkout: Kasa ("przejdź do kasy")
- Cart: Koszyk
- Postcode: Kod pocztowy

### Low confidence
- method.pickup: Shopify's Polish checkout may say "Odbiór" or "Odbiór w sklepie" rather than "Odbiór osobisty". Check against a live checkout.
- Date sentences (summary.*, thankyou.*, vacation, product.countdown.*): Intl gives a nominative weekday ("sobota, 17 października"), so I used "Label: {date}" instead of "w {date}", which would need the accusative. Please confirm the countdown "– dostawa w terminie: {date}" reads well.
- area.covered / area.coveredArea / area.notCovered: rewritten as "… jest w naszym zasięgu" so the sentence stays grammatical with any area name.
- slot.left: "miejsce" (spot) may not fit merchants who count orders, not seats.
- thankyou.google: kept as "Google Calendar" per the brief. Google's own Polish name is "Kalendarz Google".

## Czech (`cs`)
### Register
Formal "vy" ("Vyberte", "Vraťte se prosím"), with lowercase "vaše" as in standard Czech e-shop copy. Czech shops expect this form.

### Glossary
- Local delivery: Místní doručení
- Pickup: Vyzvednutí
- Shipping: Doprava
- Checkout: Pokladna
- Cart: Košík
- Postcode: PSČ

### Low confidence
- method.pickup / method.delivery: I am not sure of Shopify's exact Czech checkout terms (the pickup option may be "Osobní odběr", and local delivery may be "Místní rozvoz").
- product.countdown.*: "Objednejte do {duration} a doručíme … v termínu {date}" uses a nominative weekday after "v termínu". Please check that it reads naturally.
- vacation: rephrased to "poslední zavřený den: {date} … nejbližší termín: {nextDate}" to avoid case endings on the weekday.
- calendar.available / calendar.selected: masculine forms "Volný" / "Vybraný" agree with an implied "den".
- poweredBy: "Běží na {brand}" is informal tech phrasing. "Využívá {brand}" is an alternative.
- thankyou.google: kept as "Google Calendar" per the brief. Google's own Czech name is "Kalendář Google".

## Turkish (`tr`)
### Register
Formal "siz" ("seçin", "sipariş verin", "Siparişiniz"). This is standard for Turkish e-commerce and checkout copy.

### Glossary
- Local delivery: Yerel teslimat
- Pickup: Teslim alma
- Shipping: Kargo
- Checkout: Ödeme
- Cart: Sepet
- Postcode: Posta kodu

### Low confidence
- method.pickup: Shopify TR may use "Mağazadan teslim alma" or "Teslim al". Check against the live checkout.
- Placeholder suffixes: I avoided case suffixes directly on {date}, {product}, {method} and {location}. I used "{date} tarihinde", "{product}," and "{location} adresinden" instead, which is a little formal.
- calendar.event*: written as "Sipariş {order}: teslimat" to avoid suffixes on "#1001". This is slightly terse.
- slot.left / slot.busy: Turkish keeps the noun singular after numbers, so the one and other branches are identical (intended).
- thankyou.google: kept as "Google Calendar" per the brief. Google's Turkish name is "Google Takvim".

## Greek (`el`)
### Register
Formal or plural "εσείς" ("Επιλέξτε", "Παραγγείλτε", "σας"). This is standard for Greek online shops and checkout.

### Glossary
- Local delivery: Τοπική παράδοση
- Pickup: Παραλαβή
- Shipping: Αποστολή
- Checkout: Ολοκλήρωση αγοράς
- Cart: Καλάθι
- Postcode: Ταχυδρομικός κώδικας (abbreviated Τ.Κ. in sentences)

### Low confidence
- product.countdown.*: the other branch is the bare "{date}" ("για παράδοση Σάββατο 17 Οκτωβρίου"), because the weekday's gender varies, so "το/την/στις" can't be fixed. This reads slightly telegraphic.
- vacation: "έως {date}" and "για {nextDate}" have the same article issue.
- tzNote: "αναφέρονται σε: {zone}" depends on the browser's Greek time-zone name.
- reason.full: "Πλήρως κρατημένη" (feminine, agreeing with ημέρα). Slots use slot.full "Πλήρες" separately.
- slot.label: "Χρονικό διάστημα". Some shops say "Ώρα παράδοσης", but it must also cover pickup.
- duration.hm / duration.m: the abbreviations "ώρ." and "λεπ." Some shops use "ω" and "λ".
- thankyou.google: kept as "Google Calendar" per the brief. Google's Greek name is "Ημερολόγιο Google".

## Romanian (`ro`)
### Register
Informal "tu" (imperative "Alege", "coșul tău"), which most large Romanian shops use (eMAG, for example). Uses comma-below diacritics (ș, ț).

### Glossary
- Local delivery: Livrare locală
- Pickup: Ridicare (location: "Punct de ridicare")
- Shipping: Expediere
- Checkout: Finalizarea comenzii
- Cart: Coș
- Postcode: Cod poștal

### Low confidence
- method.pickup / method.shipping: Shopify ro may say "Ridicare personală" / "Ridicare din magazin" and "Livrare" / "Expediere". Confirm against a live ro checkout. This is the biggest uncertainty.
- slot.left: shortened to "Încă # loc / locuri / de locuri" to fit 20 characters. "Mai sunt # locuri" sounds more natural but runs over the limit.
- minOrder / validation.minOrder: rephrased to "{method} se poate alege la comenzi de peste {amount}" to avoid gender agreement with the method name.
- vacation / thankyou.*: "până pe {date}" / "pe {date}" with a weekday date. Check against the real Intl output.
- poweredBy: "Susținut de {brand}" is a guess at idiomatic footer wording.
- reason.full: "Complet rezervat".

## Japanese (`ja`)
### Register
です/ます (polite) throughout, with light honorifics where Japanese shops use them (お届け, お受け取り, ご注文, お選びください). Short UI labels are plain nouns (お届け日, 受取日, 変更).

### Glossary
- Local delivery: ローカルデリバリー (method.delivery)
- Pickup: 店舗受取 (method.pickup); 受取 / お受け取り in compounds and sentences
- Shipping: 配送 (method.shipping)
- Checkout: ご購入手続き (the wording on Shopify's Japanese "ご購入手続きへ" button; Shopify also shows チェックアウト in places)
- Cart: カート
- Postcode: 郵便番号

### Low confidence
- method.pickup: Shopify's Japanese checkout may show 受取 or 店舗受取 (in-store pickup) on the delivery-method toggle. Check against a live JA checkout.
- method.delivery: ローカルデリバリー is Shopify's admin term. Check that the checkout also uses it rather than ローカル配達.
- validation.missingDate / validation.missingItemDate: uses ご購入手続き for "checkout". Swap it for チェックアウト if the store's checkout uses that.
- summary.* and product.countdown.*: when {date} is replaced by 今日/明日, "今日にお届け" reads slightly unnatural (今日お届け is better). Fine with real dates.
- thankyou.google: written as "Google カレンダー" (Google's official Japanese product name) rather than English "Google Calendar".
- minOrder / validation.minOrder: "over {amount}" rendered as 以上 (at least), the usual retail wording. Change it to "を超える" if the threshold is strictly greater-than.
- reason.full (予約がいっぱいです) / slot.full (満枠): natural for slot booking, but check the tone for a delivery context.

## Korean (`ko`)
### Register
해요체 polite (…해 주세요, …할 수 있어요, …예정이에요), as in modern Korean commerce apps (Coupang, Kurly, Toss). Short labels are nouns (배송일, 픽업 장소, 변경).

### Glossary
- Local delivery: 현지 배송 (method.delivery)
- Pickup: 픽업 (method.pickup)
- Shipping: 배송 (method.shipping)
- Checkout: 결제
- Cart: 카트
- Postcode: 우편번호

### Low confidence
- method.delivery: Shopify ko may use 지역 배송 or 로컬 배송 instead of 현지 배송. Check against a live KO checkout.
- method.pickup: Shopify ko may show 매장 픽업 for in-store pickup. Check against a live KO checkout.
- minOrder / validation.minOrder: the particle after {method} is hardcoded as 은. This is correct for 현지 배송 / 픽업 / 배송 (all end in a final consonant), but breaks if a merchant's method name ends in a vowel.
- area.covered / area.notCovered / area.coveredArea: "{postcode} 지역" pattern used to avoid particle problems. Check that it sounds natural with a bare postcode such as "06236 지역".
- product.countdown.*: "{date}에 배송돼요" with the Intl date "10월 16일 (금)에": check that the particle after the weekday parenthesis reads well.
- thankyou.heading (배송 일정): also shown for pickup orders. Consider a neutral 수령 일정.
- slot.busy: "주문이 많은 날이에요:" is a free rendering of "Busy day:".

## Chinese (Simplified) (`zh-CN`)
### Register
Polite neutral with 您 in full sentences (standard for mainland store and checkout copy), and terse noun labels. Avoids the casual 亲 style.

### Glossary
- Local delivery: 本地配送 (method.delivery)
- Pickup: 自提 (method.pickup); 自提点 for location
- Shipping: 运输 (method.shipping)
- Checkout: 结账
- Cart: 购物车
- Postcode: 邮政编码

### Low confidence
- method.shipping: 运输 is my best recollection of Shopify's zh-CN checkout toggle. Shoppers would find 快递 / 配送 more natural. Must be checked against a live zh-CN checkout.
- method.pickup: Shopify zh-CN may use 到店取货 (in-store pickup) instead of 自提. Check against a live zh-CN checkout.
- minOrder / validation.minOrder: "over {amount}" rendered as 满{amount} (at least), the usual mainland retail wording.
- reason.closed (不营业) / reason.vacation (休假暂停营业): check that the tone is natural for a short calendar tooltip.
- slot.left: 名额 (spots) is fine for slots. Check that it fits per-day capacity as well.
- thankyou.heading (配送安排): also shown for pickup orders.

## Chinese (Traditional) (`zh-TW`)
### Register
Polite neutral with 您 in full sentences, using Taiwan vocabulary (外送, 取貨, 出貨, 結帳, 郵遞區號, 行事曆, 時段, 額滿). Short labels are nouns.

### Glossary
- Local delivery: 本地外送 (method.delivery)
- Pickup: 到店取貨 (method.pickup); 取貨 in compounds
- Shipping: 運送 (method.shipping)
- Checkout: 結帳
- Cart: 購物車
- Postcode: 郵遞區號

### Low confidence
- method.delivery / method.pickup / method.shipping: chosen from memory of Shopify's zh-TW checkout (本地外送 / 到店取貨 / 運送). Shopify might use 在地外送, 取貨 or 運送方式 variants. Check against a live zh-TW checkout.
- reason.vacation (店休暫停營業): slightly redundant. 店休中 alone may be more natural.
- slot.busy: "熱門日期" is a free rendering of "Busy day". Check the tone.
- minOrder / validation.minOrder: "over {amount}" rendered as 滿{amount} (at least).
- thankyou.heading (配送時程): also shown for pickup orders.
- poweredBy (由{brand}提供技術支援): check whether a shorter "{brand} 技術支援" is preferred.

## Thai (`th`)
### Register
Neutral polite Thai as used by Shopee/Lazada and Shopify: "คุณ" where a pronoun is needed, "กรุณา" for requests. No gendered particles (ค่ะ/ครับ), so the UI does not speak as a specific gender.

### Glossary
- Local delivery: การจัดส่งในพื้นที่
- Pickup: รับสินค้าที่ร้าน
- Shipping: การจัดส่ง
- Checkout: ชำระเงิน
- Cart: ตะกร้าสินค้า (shortened to ตะกร้า in sentences)
- Postcode: รหัสไปรษณีย์

### Low confidence
- method.pickup: not sure Shopify's Thai checkout says exactly "รับสินค้าที่ร้าน"; it may use "รับสินค้า" or "รับที่ร้าน". Please compare with a live Thai checkout.
- method.delivery / method.shipping: "การจัดส่งในพื้นที่" / "การจัดส่ง" are my best guess at Shopify's wording; please check.
- summary.* / thankyou.* / product.countdown.*: {date} goes in with no preposition, after a space (e.g. "จัดส่ง วันศุกร์ที่ 16 ตุลาคม", "จัดส่งวันนี้"). This reads fine with the long weekday format, but please check it with the short format "16 ต.ค. 2569" too.
- date.label.delivery vs date.label.dispatch: in Thai, จัดส่ง covers both "ship" and "deliver", so I used ส่งพัสดุ ("send the parcel") for dispatch. Please check that the two labels are clearly different to a shopper.
- poweredBy: "ขับเคลื่อนโดย" is a literal rendering of "powered by" that Shopify uses, but it can sound stiff.
- slot.left: "เหลือ # ที่" (spots left). Please check that "ที่" is clear enough on a time-slot chip.

## Vietnamese (`vi`)
### Register
"Bạn" with "Vui lòng" for requests. This is the standard friendly-polite register of Vietnamese e-commerce (Shopee, Tiki, Shopify vi), and the shop refers to itself as "chúng tôi".

### Glossary
- Local delivery: Giao hàng địa phương
- Pickup: Nhận tại cửa hàng
- Shipping: Vận chuyển
- Checkout: Thanh toán
- Cart: Giỏ hàng
- Postcode: Mã bưu chính

### Low confidence
- method.delivery: Shopify's Vietnamese checkout may say "Giao hàng tại địa phương" (24 chars, over the 22 limit). I used "Giao hàng địa phương". Please check against the real checkout.
- method.pickup: Shopify may use "Nhận hàng tại cửa hàng" or "Nhận hàng". Please check.
- summary.*: I used a colon form ("Giao hàng: {date}") so the line also reads correctly when {date} is "Hôm nay"/"Ngày mai". Please check that it does not read as too terse.
- reason.soldOut: "{product} đã hết suất ngày này" ("no more slots/servings for that day"). Please check that "suất" fits non-food products.
- thankyou.delivery: rewritten as "giao tận nơi" (delivered to your door) and does not say "local". Please check that this is acceptable.
- vacation: shortened to "đặt hàng nhận từ {nextDate}" to fit 100 chars. Please check that the meaning (order now to receive from that date) is clear.

## Indonesian (`id`)
### Register
"Anda" with "Silakan" for requests. This is the formal-polite register of Shopify's Indonesian checkout and of major marketplaces (Tokopedia, Shopee ID).

### Glossary
- Local delivery: Pengiriman lokal
- Pickup: Pengambilan di toko
- Shipping: Pengiriman
- Checkout: Checkout
- Cart: Keranjang
- Postcode: Kode pos

### Low confidence
- method.pickup: Shopify's Indonesian checkout may use "Ambil di toko" or just "Pengambilan". Please check.
- date.label.delivery / summary.delivery / product.earliest.delivery: I used "pengantaran" (hand delivery) so these do not clash with "pengiriman" (shipping/dispatch). date.label.delivery is also used for shipping arrival, where "Tanggal pengantaran" is a bit off. Please check.
- slot.label / slot.left / requiredSlot: "slot waktu" is common in apps but is a loanword. Please check that it sounds natural.
- product.countdown.dispatch: "dan kami kirim" is slightly informal. "dan akan kami kirim" is an alternative.
- area.covered / area.notCovered: "mengantar ke" was chosen over "mengirim ke". Please check.
- vacation: shortened to "…untuk {nextDate} dst." to fit 100 chars with long dates. "dst." may look terse; "dan seterusnya" is the alternative if space allows.

## Malay (`ms`)
### Register
"Anda" (lowercase in mid-sentence, as is standard in Malaysian retail) with "Sila" for requests. This is the polite-neutral register of Shopee MY, Lazada MY and Shopify ms.

### Glossary
- Local delivery: Penghantaran tempatan
- Pickup: Ambil di kedai
- Shipping: Penghantaran
- Checkout: Daftar keluar
- Cart: Troli
- Postcode: Poskod

### Low confidence
- method.pickup: Shopify's Malay checkout may use "Pengambilan" or "Ambil sendiri" rather than "Ambil di kedai". Please check.
- method.delivery / method.shipping: Shopify's exact Malay terms are unverified.
- date.label.dispatch / summary.dispatch / product.earliest.dispatch / thankyou.dispatch / calendar.eventDispatch / product.countdown.dispatch: "pos/dipos" is used for "dispatch/ship out" to set it apart from "penghantaran" (delivery). This is natural in Malaysia but may suggest Pos Malaysia specifically. Please check.
- reason.full: "Tempahan penuh" (fully booked). Please check that it fits a shop context.
- product.countdown.*: "Pesan dalam masa {duration}…" — "Buat pesanan dalam masa" may sound more natural.
- vacation / noCommonDate: tightened to fit the length limits ("Kami cuti hingga…", "Sila pesan berasingan."). Please check that they still sound polite.

## Hindi (`hi`)
### Register
"आप" throughout, as required, with "कृपया" for requests. The vocabulary is everyday Hinglish e-commerce Hindi (ऑर्डर, कार्ट, डिलीवरी, पिकअप, चेकआउट), as used by Flipkart and Amazon.in rather than Sanskritised terms.

### Glossary
- Local delivery: स्थानीय डिलीवरी
- Pickup: पिकअप
- Shipping: शिपिंग
- Checkout: चेकआउट
- Cart: कार्ट
- Postcode: पिन कोड

### Low confidence
- method.delivery: Shopify's Hindi checkout might use "लोकल डिलीवरी" rather than "स्थानीय डिलीवरी". Please check.
- area.covered / area.notCovered: "{postcode} पर डिलीवरी" — the postposition with a PIN code may read better as "{postcode} में".
- duration.hm: "घं"/"मि" are compact abbreviations. "घंटे"/"मिनट" are clearer but longer.
- slot.left: Hindi plural categories are one (0 and 1) and other. "0 जगह बाकी" is acceptable but could be worded differently.
- product.countdown.*: the order was rearranged to "{आज/कल/{date} को} डिलीवरी के लिए {duration} में ऑर्डर करें". Please check the flow.
- fee.label / validation.surcharge: "अतिरिक्त शुल्क" was used for "surcharge"; "सरचार्ज" is the alternative.

## Arabic (`ar`)
### Register
Modern Standard Arabic, polite. I used gender-neutral "يُرجى + verbal noun" for requests and errors, and the conventional masculine-generic imperative only in short CTAs and countdowns ("اختر", "اطلب"), as Arabic stores do. Bidi isolation of placeholders is left to the code.

### Glossary
- Local delivery: التوصيل المحلي
- Pickup: الاستلام
- Shipping: الشحن
- Checkout: الدفع (إتمام الطلب)
- Cart: سلة التسوق
- Postcode: الرمز البريدي

### Low confidence
- method.pickup: Shopify AR may use "الاستلام من المتجر". Check against the live checkout.
- Checkout term: I used "قبل الدفع" in the validation.* keys. Shopify may say "إتمام الطلب".
- slot.left / slot.busy: all six plural categories are filled in. The zero branch only appears if the code ever shows 0. Please check the agreement of the "many" form (بقي # مكانًا / بقيت # فترة).
- duration.hm: "س" / "د" abbreviations. Some locales prefer "ساعة" / "دقيقة", but those are too long for 15 characters.
- methodGroup: rendered as a label ("طريقة استلام الطلب") rather than a question.
- thankyou.heading: "موعد استلام طلبك" ("when you get your order") is used so it covers pickup and shipping too.
- reason.productUnavailable: "غير متاح لـ {product}". Check the spacing after "لـ" once the code wraps the placeholder in isolation marks.

## Hebrew (`he`)
### Register
Plural imperative ("בחרו", "הזמינו") for CTAs, and impersonal "יש ל…" for errors. Both are gender-neutral, and this is the usual style on Israeli e-commerce sites. Bidi isolation of placeholders is left to the code.

### Glossary
- Local delivery: משלוח מקומי
- Pickup: איסוף
- Shipping: משלוח
- Checkout: קופה (מעבר לקופה)
- Cart: עגלת קניות
- Postcode: מיקוד

### Low confidence
- method.delivery vs method.shipping: Hebrew uses "משלוח" for both, so they differ only by "מקומי". Check that this matches Shopify HE. Pickup may be "איסוף עצמי" there.
- date.label.delivery / date.label.dispatch: "תאריך משלוח" vs "תאריך יציאה למשלוח" are distinct but close. Please confirm they are clear.
- product.countdown.*: the other branch uses "בתאריך {date}" to avoid attaching the ב- prefix to an isolated placeholder. "ב{date}" would be more natural if the code allows it.
- product.earliest.dispatch: "יציאה למשלוח החל מ: {date}" is awkward because a prefix can't attach to a placeholder.
- slot.left: the two branch uses "# מקומות". Native style might prefer "נותרו שני מקומות".
- thankyou.google: kept as "Google Calendar" per the brief. Google's Hebrew name is "יומן Google".


# Admin translations (es, fr, de, pt, it, nl, ja)

The merchant admin (`app/i18n/admin/*.json`) and the order-page extension (`extensions/pickday-admin/locales/*.json`) were translated by hand from the English source. `tests/admin-i18n.test.ts` checks every language has every key with the same placeholders. Items for a native reviewer, per language, are below. In every language, check the Shopify admin page names used in instructions (Settings > Notifications, Shipping and delivery, Local pickup, Packing slips, theme editor, App embeds) against the live Shopify admin in that language.

## Admin: es

### Pickday admin — Spanish (es) translation notes

Register: informal "tú" (as Shopify's Spanish admin), neutral/Latin-American-leaning vocabulary following Shopify es ("Agregar", "Retiro en tienda", "tienda online").

#### Glossary
| English | Spanish |
|---|---|
| Local delivery | Entrega local |
| Store pickup / Local pickup | Retiro en tienda |
| Shipping | Envío |
| Pickup location | Ubicación de retiro |
| Checkout (page / step) | Pantalla de pago / el pago |
| Checkout matching | Coincidencia en el pago |
| Check out (verb) | Finalizar la compra |
| Time slot | Franja horaria |
| Cutoff time | Hora límite |
| Preparation time (lead) | Tiempo de preparación |
| Closures / Public holidays | Cierres / Festivos |
| Surcharge / Fee | Recargo / Cargo |
| App embed(s) | Incrustación de la aplicación / Incrustaciones de aplicaciones |
| Theme editor | Editor de temas |
| Cart drawer | Carrito lateral |
| Date picker / picker | Selector de fecha / selector |
| Snippet | Fragmento |
| Route sheet / Day sheet | Hoja de ruta / Hoja del día |
| Fulfilled | Preparado |
| Upgrade | Mejorar plan |
| Settings > Notifications > Customer notifications | Configuración > Notificaciones > Notificaciones al cliente |
| Settings > Shipping and delivery | Configuración > Envío y entrega |
| Flow triggers | Desencadenadores de Flow |

#### Least sure
1. snippet.packingSlip.step1 / .title — "Albaranes"/"Albarán" for Packing slips; Shopify es may label it differently (e.g. "Comprobantes de preparación").
2. help.faq.pickupMatch.a — "Retiro en tienda" as the Local pickup settings label under Envío y entrega; verify exact Shopify es label.
3. checkout.title, home.alert.checkoutMismatchAction, help.diag.delivery — "Coincidencia en el pago" is a coined feature name.
4. help.faq.fees.a, surcharges.howLine, surcharges.productHelp — kept "Delivery fee" in English because it is the literal title of the product Pickday creates (fee-product.server.ts).
5. help.faq.notShowing.a, widget.setup.blockText — kept block name "Pickday date picker" in English (theme extension has no es schema locale, so the editor shows it in English).
6. help.faq.checkoutBlocked.a, help.faq.expressButtons.* — "Comprar ahora" for Buy it now; verify Shopify es wording.
7. orders.status.fulfilled / ext statusFulfilled — "Preparado" (Shopify es order status); some regions may expect "Completado".
8. surcharges.productNotLive — "canal de ventas Tienda online" for Online Store sales channel.
9. methods.meaningDispatch — "Fecha de despacho" (LatAm); Spain would prefer "Fecha de envío", which clashes with Shipping.
10. snippet.orderConfirmation.step1 — "panel de control de Shopify" for "Shopify admin".
11. transfer.productMapped / productMissing — "identificador" for product handle.
12. notifications.feedHeading — "Feed de calendario" (anglicism, common in Shopify es).
13. help.diag.embed — "tema publicado" for "live theme".
14. home.alert.usage — "{pct}%" kept without space (Spanish typography prefers "{pct} %").
15. Length — many strings are 30–40% longer than English (inherent to Spanish); the longest were shortened, a few labels (e.g. widget.setup.embedTitle, areas.zonePostcodes) remain above 130%.

## Admin: fr

### Pickday admin: French (fr) translation notes

Register: "vous" throughout, the same as the Shopify admin in French. Imperatives use the vous form ("Ajoutez", "Choisissez"). Quoted UI labels use « … ». Apostrophes are straight single quotes, which are safe with the formatter. There are no doubled '' anywhere.

#### Glossary
| English | French |
|---|---|
| Local delivery | Livraison locale |
| Store pickup / Local pickup | Retrait en magasin |
| Shipping | Expédition |
| Method (delivery method) | Mode (mode de livraison) |
| Checkout | Paiement (e.g. "au paiement", "Correspondance au paiement") |
| Time slot | Créneau horaire / créneau |
| Cutoff time | Heure limite |
| Preparation time (lead time) | Délai de préparation |
| Capacity / limit | Capacité / limite |
| Pickup location | Point de retrait (a Shopify location is "emplacement") |
| Area (list entry) / Zone (group) | Zone / Secteur |
| Closure / public holiday | Fermeture / jour férié |
| Special open day | Ouverture exceptionnelle |
| Vacation mode | Mode vacances |
| Surcharge / fee | Supplément / frais |
| Plan / Upgrade | Forfait / Mettre à niveau |
| Tag / Note | Balise / Remarque |
| Fulfilled / Scheduled / Cancelled | Traitée / Planifiée / Annulée |
| Theme editor / App embeds | Éditeur de thème / Intégrations d'applications |
| Cart drawer | Tiroir de panier |
| Snippet | Extrait |
| Daily summary (digest) | Récapitulatif quotidien |
| Schedule (page) | Calendrier |
| Route sheet / Day sheet | Feuille de route / Feuille du jour |

Shopify admin paths used: Paramètres > Notifications > Notifications aux clients > Confirmation de commande / Confirmation d'expédition; Notifications au personnel > Nouvelle commande; Paramètres > Expédition et livraison > Retrait en magasin; Paramètres > Expédition et livraison > Bordereaux de marchandises; the "Boutique en ligne" sales channel.

#### Strings I'm least sure about
1. `snippet.packingSlip.step1` / `.title`: I used "Bordereaux de marchandises" for Packing slips. I'm fairly sure this is Shopify's French label, but it could also be "Bordereaux d'expédition". Please check it in a French admin.
2. `areas.*` (area vs zone): English uses both "area" and "zone". I translated area as "Zone" and zone as "Secteur" so they stay distinct. As a result, "Delivery zone" (`orders.zone`) became "Secteur de livraison".
3. `checkout.title` / `home.alert.checkoutMismatchAction`: "Correspondance au paiement" for "Checkout matching". It's understandable but stiff.
4. `locations.emptyMethodsLink` / `locations.emptyText`: "Modes de livraison" for "Delivery methods". The actual page is titled "Modes et pays".
5. `help.faq.notShowing.a`, `widget.setup.blockText`: I left the block name "Pickday date picker" in English. If the theme extension localizes the block name, it should match that name instead.
6. `help.faq.changeDate.a` uses « Ignorer les limites ». It assumes `orders.ignoreLimits` ("Ignorer les limites pour cette modification") is the visible label.
7. `help.faq.checkoutBlocked.a` / `help.faq.expressButtons.*`: "Acheter maintenant" for "Buy it now". I believe Shopify FR themes use this; some use "Acheter".
8. `digest.subject`: rewritten as "Pickday : commandes du {date} ({count})" to avoid needing plurals.
9. `methods.offer`: "Proposer : {method}". I used the label style because the method name's article and gender vary.
10. `schedule.forMethod`: "Calendrier : {method}". This was reworded for the same reason.
11. `home.alert.vacationText`: "du {start} jusqu'à la fin, le {end}". This assumes the dates render without an article; it may read awkwardly depending on the date format.
12. `transfer.productMapped` / `transfer.productMissing`: "identifiant" for handle. Shopify FR sometimes shows "handle" or "Identifiant" in SEO settings.
13. `common.discard`: "Ignorer" (Polaris contextual save bar wording). Shopify sometimes uses "Supprimer".
14. `preview.rightNow`: "Il est actuellement {now} ({zone})." I put the zone in parentheses instead of "in {zone}".
15. Extension `changed`: "Modifications : {{count}}. Dernière : {{from}} → {{to}}". I restructured it to avoid "fois" plural handling.

## Admin: de

### Pickday admin – German (de) translation notes

**Register:** informal "du" (as in Shopify's German admin), imperative "Aktiviere…", "Füge … hinzu".

#### Glossary
| English | German |
|---|---|
| Local delivery / Store pickup / Shipping | Lokale Zustellung / Abholung im Geschäft / Versand |
| Pickup location | Abholstandort |
| Time slot | Zeitfenster |
| Preparation time (lead time) | Vorlaufzeit |
| Cutoff time | Bestellschluss |
| Booking window | Buchungszeitraum |
| Closures / Closed day | Schließtage / Schließtag |
| Public holidays | Gesetzliche Feiertage |
| Vacation mode | Urlaubsmodus |
| Surcharge / fee / Delivery fee | Zuschlag / Gebühr / Liefergebühr |
| Capacity / limit | Kapazität / Limit |
| Delivery area / zone | Liefergebiet / Zone |
| Postcode | Postleitzahl (PLZ) |
| Route sheet / Day sheet | Tourenliste / Tagesliste |
| Production list | Produktionsliste |
| Plan | Tarif |
| Date picker | Datumsauswahl |
| Cart / Cart drawer | Warenkorb / Warenkorb-Drawer |
| Theme editor / App embed | Theme-Editor / App-Einbettung |
| Checkout matching | Checkout-Abgleich |
| Share code | Freigabecode |
| Fulfilled / Cancelled / Scheduled | Ausgeführt / Storniert / Geplant |
| Settings > Notifications > Customer notifications | Einstellungen > Benachrichtigungen > Kundenbenachrichtigungen |
| Settings > Shipping and delivery > Local pickup / Packing slips | Einstellungen > Versand und Zustellung > Lokale Abholung / Packzettel |

#### Least-sure strings
1. `snippet.packingSlip.step1` / `.title` – "Packzettel" vs "Lieferscheine"; verify against current Shopify DE admin label.
2. `snippet.staffNotification.step1` – "Mitarbeiterbenachrichtigungen" (Shopify DE may say "Benachrichtigungen für Mitarbeiter").
3. `method.pickup` – "Abholung im Geschäft" (Shopify DE checkout); Shopify settings page itself says "Lokale Abholung".
4. `plans.free.name`, `common.upgrade`, `plans.downgrade` – kept "Free"/"Upgrade" as product/plan names; could be "Kostenlos".
5. Cart drawer → "Warenkorb-Drawer" – common in German themes but anglicism; Dawn DE may use "Warenkorb-Schublade".
6. `help.faq.expressButtons.*` – "Jetzt kaufen" assumed as Shopify DE label of the "Buy it now" button.
7. `widget.setup.blockText`, `help.faq.notShowing.a` – block name "Pickday date picker" left in English (it's the theme block's name); change if the theme extension block is localized.
8. `home.alert.vacationText` – "vom {start} bis zum Ende am {end}" depends on date format of {start}/{end}.
9. `schedule.cutoffFor` – "Bestellschluss am {day}" assumes {day} is a weekday name.
10. `order.schedule` / `orderDetail.subtitle` – "Schedule" in order context rendered "Termin" (vs "Zeitplan" for the settings page).
11. `reason.notYetOpen` / `schedule.notBefore` – "Noch nicht freigegeben" / "Keine Daten freigeben vor" (booking not open yet).
12. `products.picker.tagPlaceholder` – example tag localized to "auf-bestellung".
13. `areas.testDelivered` – "Wird beliefert:" (yes/no follows).
14. Extension `changed` – rewritten as "Änderungen: {{count}}. Letzte Änderung: …" to avoid "time(s)".
15. `common.availableOn` – "Verfügbar im {plan}-Tarif" assumes {plan} is a plan name.

## Admin: pt

### Pickday admin – pt (Brazilian Portuguese) translator notes

Register: "você" (Shopify pt-BR admin style), imperative for actions ("Adicione", "Escolha"), short and neutral.

#### Glossary
- Local delivery → Entrega local
- Store pickup → Retirada na loja (Shopify page "Local pickup" → Retirada no local)
- Shipping (method) → Frete; Shipping and delivery → Frete e entrega
- Checkout → checkout (as in Shopify pt-BR)
- Time slot → Faixa de horário (short form "horário" in tight labels)
- Capacity / limit → Capacidade / limite
- Cutoff time → Horário limite
- Preparation time (lead time) → Prazo de preparo
- Schedule (settings page) → Programação; order schedule → Agendamento; Scheduled → Agendado
- Closures → Fechamentos; Vacation mode → Modo férias; Public holidays → Feriados
- Surcharges / fee → Taxas extras / taxa
- Postcode → CEP
- Shoppers / customers → clientes
- Fulfilled → Processado (Shopify pt-BR)
- App embed(s) → Incorporação do app / Incorporações de apps; Theme editor → editor de temas
- Packing slips → Guias de remessa; Settings > Notifications → Configurações > Notificações
- Upgrade → Fazer upgrade; plan names Free/Starter/Pro kept
- Route sheet / Day sheet → Folha de rota / Folha do dia
- Cart drawer → gaveta do carrinho; tag → tag; snippet → snippet

#### Least-sure strings
1. method.pickup "Retirada na loja" – Shopify's own label is "Retirada no local"; chose "na loja" to mirror "Store pickup"; may want "Retirada no local" for consistency with checkout.
2. method.shipping "Frete" – Shopify pt-BR uses "Frete"; "Envio" may read more naturally as a method name.
3. snippet.*.step1 – exact Shopify pt-BR notification names ("Notificações ao cliente", "Notificações para funcionários", "Confirmação de frete") not verified against live admin.
4. snippet.packingSlip.step1 – "Guias de remessa" assumed for Packing slips.
5. help.faq.fees.a / surcharges.howLine / productHelp – kept product title "Delivery fee" in English because the code creates the product with that literal title.
6. help.faq.notShowing.a / widget.setup.blockText – kept theme block name "Pickday date picker" (only an English theme schema locale exists).
7. help.faq.checkoutBlocked.a – "Data obrigatória em Programação" mirrors English, though the toggle lives on Methods page.
8. help.faq.changeDate.a – "Ignorar limites" refers to orders.ignoreLimits ("Ignorar limites nesta alteração"); the order-page extension says "Ignorar capacidade e regras".
9. orders.status.fulfilled / statusFulfilled "Processado" – Shopify pt-BR term; "Concluído" also possible.
10. digest.subject "Pickday: pedidos para {date}: {count}" – restructured for the no-plural rule; double colon is slightly awkward.
11. orders.bulkConfirm "Mover pedidos para {date}: {count}" – same restructuring.
12. surcharges.taxHeading "Tributos" – could be "Impostos".
13. reason.beyondWindow "Longe demais" – short but slightly vague (means too far in the future).
14. transfer.codeLabel/createCode – shortened "share code" to "código" for space.
15. surcharges.errAmount keeps "4.50" (decimal point) as in English; Brazilian users would write 4,50 – depends on the input parser.

## Admin: it

### Pickday admin – Italian (it) translation notes

Register: informal "tu" (as Shopify's Italian admin), imperative verbs ("Scegli", "Attiva", "Fai clic su"). Gender-neutral phrasing where possible ("Ti diamo il benvenuto", "lo configuro io").

#### Glossary
- Local delivery → Consegna locale; Store pickup → Ritiro in negozio; Shipping → Spedizione
- Local pickup (Shopify settings page) → Ritiro locale
- Checkout → pagamento ("al pagamento"); Checkout matching → Allineamento (del) pagamento
- Settings > Notifications → Impostazioni > Notifiche; Customer/Staff notifications → Notifiche ai clienti / Notifiche per lo staff
- Shipping and delivery → Spedizione e consegna; Packing slips → Documenti di trasporto
- Theme editor → editor di temi; App embeds → Incorporamenti app; Online Store → Negozio online
- Time slot → fascia oraria; Capacity → capacità; Cutoff → orario limite; Preparation time → tempo di preparazione
- Booking window → finestra di prenotazione; Schedule (page/order) → Programmazione
- Pickup location → sede di ritiro; Delivery area → area; Zone → zona; Postcode → CAP
- Surcharge / fee → supplemento; "Delivery fee" product → "Costo di consegna"
- Closures & holidays → Chiusure e festività; Vacation mode → Modalità ferie; Special open day → Apertura extra
- Production list → lista di produzione; Route sheet → foglio di percorso; Day sheet → foglio del giorno
- Cart drawer → carrello a scomparsa; Date picker → selettore di data; Buy it now → Acquista ora
- Fulfilled → Evaso; Upgrade → Esegui l'upgrade / Passa a {plan}; Free plan → Gratuito (Starter, Pro unchanged)

#### Least-sure strings
1. checkout.title / help.diag.delivery – "Allineamento pagamento" chosen for "Checkout matching" (feature name; no Shopify equivalent).
2. plans.free.name – translated "Gratuito"; Starter/Pro left as plan names. Check that billing plan names shown by Shopify match.
3. method.pickup "Ritiro in negozio" vs Shopify settings "Ritiro locale" – deliberately different (method vs Shopify path).
4. snippet.packingSlip.* – "Documenti di trasporto" assumed as Shopify IT label for Packing slips.
5. snippet.*.step1 – "Notifiche per lo staff", "Conferma della spedizione", "Nuovo ordine" assumed Shopify IT labels.
6. help.faq.notShowing.a / widget.setup.blockText – block name "Pickday date picker" left in English (must match the theme block name shown in editor).
7. help.faq.*.a – "Acquista ora" for Buy it now (Shopify IT dynamic checkout button label).
8. areas.regionCodesHelp / testRegionCode – examples changed from CA, NY to MI, RM (Italian province codes).
9. capacity.hideBefore – "Nascondi una fascia quando mancano meno di (stesso giorno)" reads together with a following duration input; verify UI layout.
10. digest.subject – "Pickday: ordini per il {date}: {count}" (double colon to avoid plural).
11. orders.bulkConfirm – "Sposta gli ordini al {date} ({count})" (count moved to parenthesis to avoid plural).
12. preview.rightNow – "In questo momento a {zone} sono le {now}" assumes {now} is a time (not date+time).
13. home.alert.vacationText – "dal {start} fino alla fine, il {end}" – assumes date formats fit "il …".
14. capacity.from/until "Dalle/Fino alle" assume time values; closures/orders/products from/to use "Dal/Al" (dates).
15. surcharges.taxable "Tassa i supplementi" – shortened; alternative "Applica le imposte ai supplementi".

## Admin: ja

### Pickday admin – Japanese (ja) translation notes

#### Register
Polite です/ます style in sentences. Labels, buttons and headings are short noun phrases or verb + する/を〜, the way Shopify's Japanese admin writes them (e.g. 「保存」「日付を変更」「〜をオンにする」). The shopper is called お客様 throughout (this covers both "customer" and "shopper"). The merchant is called あなた only where the sentence needs it.

#### Glossary
| English | Japanese |
|---|---|
| Local delivery (method.delivery) | ローカルデリバリー |
| Store pickup / Local pickup | 店舗受取 |
| Shipping | 配送 |
| Settings > Shipping and delivery | 設定 > 配送と配達 |
| Settings > Notifications > Customer / Staff notifications | 設定 > 通知 > お客様通知 / スタッフ通知 |
| Order confirmation / Shipping confirmation / New order | 注文確認 / 配送確認 / 新規注文 |
| Packing slips | 梱包票 |
| Theme editor / App embeds | テーマエディター / アプリ埋め込み |
| Checkout | チェックアウト |
| Cart drawer | カートドロワー |
| Pickup location | 受取場所 (Shopify locations: ロケーション) |
| Time slot | 時間帯 |
| Cutoff time | 締め切り時間 |
| Preparation time (lead time) | 準備期間 |
| Booking window | 予約受付期間 |
| Capacity / limit | 上限 (title: 時間帯と受注上限) |
| Full | 満枠 |
| Surcharges / fee | 追加料金 / 料金, "Delivery fee" product = 配達料金 |
| Vacation mode | 休業モード |
| Closures & holidays / special open day | 休業日と祝日 / 臨時営業日 |
| Delivery areas / zones | 配達エリア / ゾーン |
| Postcode / State or province | 郵便番号 / 都道府県/州 |
| Production list / Route sheet / Day sheet | 製造リスト / ルートシート / 日別シート |
| Variant / handle / Online Store sales channel | バリエーション / ハンドル / オンラインストア販売チャネル |
| Fulfilled / Scheduled / Cancelled | 発送済み / 予定済み / キャンセル済み |
| Buy it now | 今すぐ購入 |

ICU plurals: Japanese has only the `other` category, so the strings keep `=0` where English has it, plus `other` with `#`.

#### Strings I am least sure about
1. `method.pickup` / `locations.*`: I used 店舗受取 for both "Store pickup" and Shopify's "Local pickup" settings page. Shopify JA may label it 「ローカルピックアップ」 in some places, so please check this against the live admin.
2. `method.delivery`: ローカルデリバリー follows Shopify's JA term. A shopper-facing alternative would be 「配達」.
3. `snippet.packingSlip.*`: 梱包票 is the Shopify JA name as I remember it. Please check it against the current admin, which may say 「納品書」.
4. `plans.free.name` = 無料, but Starter and Pro stay in English as plan names. `common.availableOn` / `plans.switchTo` put the name into the string, giving e.g. 「Starterプランで利用可能」 and 「無料に切り替え」.
5. `help.faq.notShowing.a`, `widget.setup.blockText`: I kept the block name 「Pickday date picker」 in English on the assumption that the theme block's name is not translated. Change it if the theme extension localises it.
6. `areas.postcodesHelp`: I replaced the examples with Japanese postcodes (100-0001, 100*, 1000000-1999999). I checked these against `core/postcode.ts`, and dashes are accepted.
7. `surcharges.errAmount`: the example changed from "5 or 4.50" to 「500」, because JPY has no decimals.
8. `areas.deliveryOff`, `capacity.turnOnSlots`, `methods.shopifyNote`, `methods.nameIn`: the English ends in a dangling "in"/"use" that a link or control follows. I rendered it as 「…：」. Check how the UI joins the link to the text.
9. `orders.status.fulfilled` / ext `statusFulfilled`: 発送済み is Shopify's JA term. For pickup orders it reads a little oddly.
10. `production.offsetNote`: "Prep days ahead" became 準備の前倒し日数, which is somewhat clumsy.
11. `capacity.hideBefore` / `capacity.showLeftBelow`: these labels sit next to an input field, so the word order may read awkwardly in the UI.
12. `reason.beyondWindow` = 予約受付期間外, `reason.notYetOpen` = 受付開始前: these are interpretations rather than literal translations.
13. `home.alert.vacationText`: I kept the {start}/{end} sentence close to the English.
14. `plans.perMonth` = 「/月」: this assumes it follows a price.
15. `areas.regionsLabel` etc.: I used 都道府県/州 for "state or province" so it works for both Japan and the US.

## Admin: nl

Register: "je". Key terms: Lokale bezorging / Ophalen in winkel / Verzending, tijdvak (time slot), bestelgrens / deadline (cutoff), abonnement (plan). Review: the Shopify Dutch labels for Packing slips and Local pickup, and whether "Verwerkt" matches Shopify's word for fulfilled.
