import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { BRAND } from "../../config/brand";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [{ title: BRAND.appStoreName }, { name: "description", content: BRAND.tagline }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login), support: BRAND.supportEmail };
};

/** Public page shown outside Shopify admin (e.g. the app URL opened directly). */
export default function App() {
  const { showForm, support } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{BRAND.appStoreName}</h1>
        <p className={styles.text}>Let customers choose their delivery, pickup or shipping date in the cart. Set working days, holidays, time slots and daily limits.</p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Your store address</span>
              <input className={styles.input} type="text" name="shop" placeholder="your-store.myshopify.com" autoComplete="on" />
              <span>Example: your-store.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
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
        <p>Help: <a href={`mailto:${support}`}>{support}</a></p>
      </div>
    </div>
  );
}
