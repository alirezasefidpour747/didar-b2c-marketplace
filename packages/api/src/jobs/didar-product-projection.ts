import { runProductProjections } from "../didar/projection";
export default async function projectDidarProducts(container: any) {
  await runProductProjections(container);
}
export const config = {
  name: "didar-product-projection",
  schedule: "* * * * *",
};
