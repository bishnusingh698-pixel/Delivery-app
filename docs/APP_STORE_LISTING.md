# App Store listing draft

Copy these into Partner Dashboard → your app → Distribution → Shopify App Store listing. Character limits are Shopify's at the time of writing; counts are noted where they're tight.

## English (primary)

**App name** (30): `Pickday: Delivery Date Picker`

**App card subtitle / tagline** (62): `Delivery & pickup dates with daily limits` (the longer line `Let customers pick the day. Set daily limits and stop most overbooking.` is over the limit)

**App introduction** (100):
Let customers choose a delivery, pickup or shipping date and time slot, with daily limits that stop most overbooking.

**App details** (500):
Pickday adds a date and time-slot picker to your cart, cart drawer and product pages, in your shoppers' language. Set the days you work, preparation time, cut-off times, holidays and how many orders you can handle per day or slot. Full days close by themselves. Checkout only shows the method the customer chose and stops orders without a valid date. See every order by day, print day sheets, route sheets and production lists, and get a daily summary in Shopify Flow (send it to email, Slack and more).

**Feature list** (up to 5 × 80):
1. Date and time-slot picker for delivery, store pickup and shipping, in 28 languages
2. Daily and per-slot limits, cut-off times, holidays and vacation mode
3. Checkout shows only the chosen method and blocks orders without a date
4. Orders calendar, day sheets, route sheets and production list
5. Works on every Shopify plan; no theme code changes

**Pricing** (from `core/plans.ts`; yearly = 2 months free; 14-day free trial on every paid plan, monthly or yearly)
- Free, $0: 30 scheduled orders a month, one method, one date per order, working days, preparation time, cutoff, booking window, up to 10 closures and vacation mode, order tags and metafield, thank-you block, checkout validation, orders list and printable day sheet, all languages, small "Powered by Pickday" link.
- Starter, $4.99/month or $49/year ($4.08/month): 500 orders a month, everything in Free plus all three methods, time slots, limits by orders or items, per-date overrides, unlimited closures, special open days, public holiday import, checkout matching, 1 pickup location, orders calendar and CSV export, production list, products without a date and extra preparation time, settings export/import by file, no branding.
- Pro, $9.99/month or $99/year ($8.25/month): everything in Starter plus unlimited orders and pickup locations, delivery areas and zones, product available days, daily product limits and method rules, a date per item, surcharges, bulk reschedule and route sheet, calendar feed, Shopify Flow, daily summary in Shopify Flow (send it to email, Slack and more), share codes, custom CSS, priority support.
- Over the monthly order limit nothing stops: everything keeps working for another 20%, then only order tags, the order metafield and Flow triggers pause until the merchant upgrades or the month resets.

**Categories:** Orders and shipping → Delivery and pickup; secondary: Store design → Cart customization.

**Search terms:** delivery date, pickup date, time slot, local delivery, order limit, delivery scheduler, bakery, florist.

**Privacy policy URL:** link to the published `PRIVACY.md`.

**Screenshots to take (1600 × 900, desktop) on a development store:**
1. Cart page with the picker open (calendar + time slots), store theme Dawn.
2. Cart drawer with the picker and a chosen date.
3. Checkout with only "Store pickup – Fri 18 Oct" shown.
4. Admin Orders calendar month view with capacity bars.
5. Admin Schedule settings with the live preview.
6. Printed day sheet.
Mobile: cart page at 390 px with the picker.

**Demo store / screencast:** a 60-second screen recording: set a daily limit of 1 → place an order → the day shows as full in the cart.

## Translations (subtitle and description for the top 6 languages)

### Español
**Introducción:** Deja que tus clientes elijan fecha y franja horaria de entrega, recogida o envío, con límites diarios que evitan la mayoría de las sobreventas.
**Detalles:** Pickday añade un selector de fecha y franja horaria al carrito, al carrito lateral y a las páginas de producto, en el idioma del cliente. Define los días que trabajas, el tiempo de preparación, la hora límite, los festivos y cuántos pedidos puedes atender por día o franja. Los días completos se cierran solos. El checkout muestra solo el método elegido y bloquea pedidos sin una fecha válida. Consulta los pedidos por día, imprime hojas del día, de ruta y de producción, y recibe un resumen diario en Shopify Flow (envíalo por email, Slack y más).
**Precios:** Free, 0 $: 30 pedidos al mes, un método, hasta 10 cierres y modo vacaciones. Starter, 4,99 $/mes o 49 $/año: 500 pedidos al mes, los tres métodos, franjas horarias, límites, festivos, lista de producción, exportación CSV y sin marca. Pro, 9,99 $/mes o 99 $/año: pedidos y puntos de recogida ilimitados, zonas de entrega, reglas de productos, recargos, Flow, resumen diario en Shopify Flow y códigos para compartir. Prueba gratis de 14 días en los planes de pago; el plan anual incluye 2 meses gratis.

### Français
**Introduction :** Laissez vos clients choisir une date et un créneau de livraison, de retrait ou d'expédition, avec des limites quotidiennes qui évitent la plupart des surréservations.
**Détails :** Pickday ajoute un sélecteur de date et de créneau au panier, au tiroir panier et aux pages produit, dans la langue du client. Définissez vos jours d'activité, le délai de préparation, l'heure limite, les jours fériés et le nombre de commandes possibles par jour ou par créneau. Les jours complets se ferment automatiquement. Le checkout n'affiche que le mode choisi et bloque les commandes sans date valide. Retrouvez vos commandes par jour, imprimez feuilles du jour, feuilles de route et listes de production, et recevez un récapitulatif quotidien dans Shopify Flow (par e-mail, Slack et plus).
**Tarifs :** Free, 0 $ : 30 commandes par mois, un mode, jusqu'à 10 fermetures et mode vacances. Starter, 4,99 $/mois ou 49 $/an : 500 commandes par mois, les trois modes, créneaux, limites, jours fériés, liste de production, export CSV et sans marque. Pro, 9,99 $/mois ou 99 $/an : commandes et points de retrait illimités, zones de livraison, règles de produits, suppléments, Flow, récapitulatif quotidien dans Shopify Flow et codes de partage. Essai gratuit de 14 jours sur les forfaits payants ; l'annuel offre 2 mois.

### Deutsch
**Einführung:** Kunden wählen Liefer-, Abhol- oder Versanddatum und Zeitfenster – mit Tageslimits, die die meisten Überbuchungen verhindern.
**Details:** Pickday fügt Warenkorb, Warenkorb-Schublade und Produktseiten eine Datums- und Zeitfensterauswahl hinzu, in der Sprache deiner Kunden. Lege Arbeitstage, Vorbereitungszeit, Bestellschluss, Feiertage und die Anzahl der Bestellungen pro Tag oder Zeitfenster fest. Volle Tage schließen sich automatisch. Der Checkout zeigt nur die gewählte Versandart und stoppt Bestellungen ohne gültiges Datum. Sieh alle Bestellungen nach Tag, drucke Tageslisten, Tourenlisten und Produktionslisten und erhalte eine tägliche Zusammenfassung in Shopify Flow (per E-Mail, Slack und mehr).
**Preise:** Free, 0 $: 30 Bestellungen pro Monat, eine Methode, bis zu 10 Schließtage und Urlaubsmodus. Starter, 4,99 $/Monat oder 49 $/Jahr: 500 Bestellungen pro Monat, alle drei Methoden, Zeitfenster, Limits, Feiertage, Produktionsliste, CSV-Export, ohne Branding. Pro, 9,99 $/Monat oder 99 $/Jahr: unbegrenzt Bestellungen und Abholorte, Liefergebiete, Produktregeln, Aufpreise, Flow, tägliche Zusammenfassung in Shopify Flow und Freigabecodes. 14 Tage kostenlos testen in den bezahlten Tarifen; jährlich gibt es 2 Monate gratis.

### Português (Brasil)
**Introdução:** Deixe seus clientes escolherem data e horário de entrega, retirada ou envio, com limites diários que evitam a maioria dos excessos de pedidos.
**Detalhes:** O Pickday adiciona um seletor de data e horário ao carrinho, à gaveta do carrinho e às páginas de produto, no idioma do cliente. Defina os dias de trabalho, o tempo de preparo, o horário limite, os feriados e quantos pedidos você atende por dia ou horário. Dias lotados fecham sozinhos. O checkout mostra só o método escolhido e bloqueia pedidos sem data válida. Veja os pedidos por dia, imprima folhas do dia, de rota e de produção e receba um resumo diário no Shopify Flow (envie por e-mail, Slack e mais).
**Preços:** Free, US$ 0: 30 pedidos por mês, um método, até 10 fechamentos e modo férias. Starter, US$ 4,99/mês ou US$ 49/ano: 500 pedidos por mês, os três métodos, horários, limites, feriados, lista de produção, exportação CSV e sem marca. Pro, US$ 9,99/mês ou US$ 99/ano: pedidos e locais de retirada ilimitados, áreas de entrega, regras de produtos, taxas extras, Flow, resumo diário no Shopify Flow e códigos de compartilhamento. 14 dias de teste grátis nos planos pagos; o anual tem 2 meses grátis.

### 日本語
**紹介文:** お客様が配達・店舗受け取り・発送の日付と時間帯を選べます。1日の上限を設定して、受けきれない注文をほぼ防げます。
**詳細:** Pickdayは、カートページ、カートドロワー、商品ページに日付と時間帯の選択欄を、お客様の言語で追加します。営業日、準備期間、締め切り時刻、祝日、1日または時間帯ごとの受注上限を設定できます。上限に達した日は自動で選択できなくなります。チェックアウトでは選ばれた受け取り方法だけが表示され、有効な日付のない注文は止められます。日ごとの注文一覧、当日リスト・配達ルート表・製造リストの印刷、Shopify Flowでの毎日のサマリー（メール、Slackなどに送信）にも対応しています。
**料金:** 無料（0ドル）：月30件の注文、1つの方法、休業日10件までと休業モード。Starter（月4.99ドルまたは年49ドル）：月500件の注文、3つの方法すべて、時間帯、上限、祝日、製造リスト、CSVエクスポート、ブランド表示なし。Pro（月9.99ドルまたは年99ドル）：注文数と受取場所が無制限、配達エリア、商品ルール、追加料金、Flow、Shopify Flowでの毎日のサマリー、共有コード。有料プランは14日間の無料トライアル付き、年払いは2か月分無料です。

### Italiano
**Introduzione:** Fai scegliere ai clienti data e fascia oraria di consegna, ritiro o spedizione, con limiti giornalieri che evitano la maggior parte delle prenotazioni in eccesso.
**Dettagli:** Pickday aggiunge un selettore di data e fascia oraria al carrello, al carrello laterale e alle pagine prodotto, nella lingua del cliente. Imposta i giorni lavorativi, il tempo di preparazione, l'orario limite, le festività e quanti ordini puoi gestire per giorno o fascia. I giorni pieni si chiudono da soli. Il checkout mostra solo il metodo scelto e blocca gli ordini senza una data valida. Visualizza gli ordini per giorno, stampa fogli del giorno, fogli di percorso e liste di produzione e ricevi un riepilogo giornaliero in Shopify Flow (invialo via email, Slack e altro).
**Prezzi:** Gratuito, 0 $: 30 ordini al mese, un metodo, fino a 10 chiusure e modalità ferie. Starter, 4,99 $/mese o 49 $/anno: 500 ordini al mese, tutti e tre i metodi, fasce orarie, limiti, festività, lista di produzione, esportazione CSV e senza marchio. Pro, 9,99 $/mese o 99 $/anno: ordini e punti di ritiro illimitati, aree di consegna, regole prodotto, supplementi, Flow, riepilogo giornaliero in Shopify Flow e codici di condivisione. Prova gratuita di 14 giorni sui piani a pagamento; l'annuale include 2 mesi gratis.

> These translations should be checked by a native speaker before publishing (see TRANSLATION_REVIEW.md for the process used for the storefront).
