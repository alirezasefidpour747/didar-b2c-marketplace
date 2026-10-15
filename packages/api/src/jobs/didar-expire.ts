import { expireOrders } from "../didar/service";
export default async function expireDidarReservations() {
  await expireOrders();
}
export const config = {
  name: "didar-expire-reservations",
  schedule: "* * * * *",
};
