import { EmptyState, Page } from "../components/polaris";
import { useT } from "../i18n/react";

export default function Route() {
  const t = useT();
  return (
    <Page title={t("help.title")} subtitle={t("help.subtitle")}>
      <EmptyState heading={t("common.comingSoon")} text={t("common.comingSoonText")} />
    </Page>
  );
}
