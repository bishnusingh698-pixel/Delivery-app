# Translations

Pickday shows text in three places, each translated differently.

| Where | Languages | Files |
|---|---|---|
| Storefront widget, checkout messages, thank-you page | 28: en, es, fr, de, it, pt-BR, pt-PT, nl, sv, da, nb, fi, pl, cs, tr, el, ro, ja, ko, zh-CN, zh-TW, th, vi, id, ms, hi, ar, he | `locales/storefront/<locale>.json` |
| Admin (the app inside Shopify) | 8: en, es, fr, de, pt, it, nl, ja | `app/i18n/admin/<lang>.json` |
| Theme editor labels | en | `extensions/pickday-theme/locales/` |

## How the storefront picks a language

1. The widget reads the shopper's storefront language (`request.locale`).
2. It matches it to the closest supported language (`core/i18n/locales.ts`: exact match, then the language without region, then Portuguese/Chinese variants by region, else English).
3. Only that language's file is downloaded (`pickday-i18n-<locale>.js`, about 2 KB), plus English as a fallback for any missing key.
4. A merchant's own wording for a string in Pickday > Widget & text always wins over the built-in text.
5. Dates, times, weekdays, month names, numbers and money are never translated by hand: they come from the browser's `Intl` APIs in the shopper's locale, so "Fri, 18 Oct" becomes "ven. 18 oct." or "10月18日(金)" automatically. The first day of the week follows the locale too (Monday in most of Europe, Sunday in the US, Saturday in parts of the Middle East).
6. Arabic and Hebrew switch the widget to right-to-left, mirror the calendar and arrows, and wrap inserted values in bidi isolation marks so a Latin product name or a date doesn't scramble the sentence.

Readable cart attributes ("Delivery date: Friday 18 October (2026-10-18)") are always written in the **store's primary language**, so staff read orders in their own language whatever language the shopper used. The machine-readable `_pickday` attribute is language-neutral.

## Message format

Strings use a small ICU MessageFormat subset (`core/i18n/format.ts`, no dependencies, so it also runs inside Shopify Functions):

- `{name}` placeholders. Names are never translated; word order is free.
- `{count, plural, one {# spot left} other {# spots left}}` with every plural category the language needs (Arabic has six, Polish and Czech four, Japanese one).
- `{when, select, today {…} tomorrow {…} other {… {date}}}` for sentences that change shape.

`locales/storefront/_context.json` says where each string appears and its maximum length, so translators know what fits in a phone-width cart drawer.

## Quality rules followed

- Written as a native speaker would for a shop checkout, never word for word.
- Register: German "Sie", French "vous", Spanish "tú", Dutch "je", Japanese です/ます, Korean polite 해요/합니다, Hindi "आप". Other languages use what shoppers expect in that market and keep it consistent.
- The three method names must match the words Shopify's own checkout uses in that language, so the widget and checkout agree.
- No English left over (brand names such as "Google Calendar" excepted).
- Every translation was back-translated and compared with the English meaning.

## Automated checks

`npm test` (`tests/storefront-i18n.test.ts`) fails the build if any language:

- is missing a key or has an extra one;
- drops, renames or adds a placeholder;
- lacks a plural form that `Intl.PluralRules` returns for any whole number 0 to 1000;
- has a string identical to English (except a short allow-list such as "+{amount}");
- renders longer than 120% of the string's length limit with realistic sample values.

`npm run test:browser` (`tests/browser/widget.browser.ts`) loads the built widget in headless Chromium at a 320px phone width and:

- renders it pseudo-localised (accented and 40% longer) and fails if anything overflows;
- renders every language and fails if anything overflows;
- checks Arabic and Hebrew render right-to-left with the calendar mirrored, and saves screenshots to `tests/browser/screenshots/` for a human to look at.

Admin languages are checked by `tests/admin-i18n.test.ts` (every key the code uses exists in English, and each other language has every English key with the same placeholders). All 7 admin languages are complete; reviewer notes are at the end of `TRANSLATION_REVIEW.md`. To add an admin language: copy `app/i18n/admin/en.json` to `<lang>.json`, translate, add the code to the admin language list, and add `extensions/pickday-admin/locales/<lang>.json`.

## Adding or changing a string

1. Add the English text to `locales/storefront/en.json` and a line to `_context.json` (where it shows, max length).
2. Add the translation to all 27 other files. The tests list exactly what is missing.
3. Run `npm test` and `npm run test:browser`.
4. Add anything you're unsure of to `TRANSLATION_REVIEW.md` for a native speaker.

## Adding a language

1. Add the code to `STOREFRONT_LOCALES` in `core/i18n/locales.ts` (and to `RTL_LANGS` if it is right-to-left).
2. Copy `en.json` to `<code>.json` and translate it.
3. Run `npm run build:widget`; the language file is generated automatically.

## Review status

All storefront translations pass the automated checks but have **not yet been reviewed by native speakers**. `TRANSLATION_REVIEW.md` lists, per language, the register, the glossary used and every string the translator was unsure about. The most important item everywhere is checking the three method names against a live Shopify checkout in that language.
