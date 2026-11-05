import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { BRAND } from "../../config/brand";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [{ title: BRAND.appStoreName }, { name: "description", content: BRAND.tagline }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // No "enter your store address" form: App Store apps must install and log in through Shopify only.
  return { support: BRAND.supportEmail };
};

/** Public page shown outside Shopify admin (e.g. the app URL opened directly). */
export default function App() {
  const { support } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{BRAND.appStoreName}</h1>
        <p className={styles.text}>Let customers choose their delivery, pickup or shipping date in the cart. Set working days, holidays, time slots and daily limits.</p>
        <ul className={styles.list}>
          <li>
            <strong>Date and time slot picker</strong>. In the cart page, the cart drawer and on product pages, in 28 languages, right-to-left included.
          </li>
          <li>
            <strong>Your rules, worldwide</strong>. Working days, cutoff times, lead time, public holidays for your country, delivery areas by postcode, several pickup locations.
          </li>
          <li>
            <strong>No overbooking</strong>. Daily and per-slot limits, an orders calendar, printable day sheets and CSV export.
          </li>
        </ul>
        {support ? <p>Help: <a href={`mailto:${support}`}>{support}</a></p> : null}
      </div>
    </div>
  );
}
