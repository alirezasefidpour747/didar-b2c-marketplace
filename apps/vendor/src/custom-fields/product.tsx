import { defineCustomFieldsConfig } from "@mercurjs/dashboard-sdk";
import { Text } from "@medusajs/ui";
import { Link } from "react-router-dom";
// Read-only extension: metadata cannot override audited weight, classification or finance.
function GoldRecord() {
  return (
    <Text dir="rtl">
      <Link to="/didar">وزن قطعه، UID و طبقه‌بندی مصوب در پرونده دیدار</Link>
    </Text>
  );
}
export default defineCustomFieldsConfig({
  model: "product",
  displays: [
    {
      zone: "general",
      fields: [{ id: "didar_gold_record", component: GoldRecord }],
    },
  ],
});
