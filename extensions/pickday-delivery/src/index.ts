import { customizeDelivery, type DeliveryInput } from "../../../core/checkout";
import messages from "./messages.generated.json";

/** Checkout matching: shows only the options for the method chosen in the cart and adds the date to its name. */
export function cartDeliveryOptionsTransformRun(input: DeliveryInput) {
  return { operations: customizeDelivery(input, messages) };
}
