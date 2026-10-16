import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/OrderBlock.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.order-details.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/ScheduleAction.tsx' {
  const shopify:
    | import('@shopify/ui-extensions/admin.order-details.action.render').Api
    | import('@shopify/ui-extensions/admin.draft-order-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
