import { EmptyState, Page } from "../components/polaris";
import { useT } from "../i18n/react";

export default function Route() {
  const t = useT();
  return (
    <Page title={t("orderDetail.title")} subtitle={t("orderDetail.subtitle")} backTo={{ href: "/app/orders", label: t("nav.orders") }}>
      <EmptyState heading={t("common.comingSoon")} text={t("common.comingSoonText")} />
    </Page>
  );
}
