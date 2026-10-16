import { EmptyState, Page } from "../components/polaris";
import { useT } from "../i18n/react";

export default function Route() {
  const t = useT();
  return (
    <Page title={t("schedule.title")} subtitle={t("schedule.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <EmptyState heading={t("common.comingSoon")} text={t("common.comingSoonText")} />
    </Page>
  );
}
