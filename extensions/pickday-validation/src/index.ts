import { validate, type ValidationInput } from "../../../core/checkout";
import messages from "./messages.generated.json";

/** Blocks checkout when the delivery/pickup date is missing or no longer valid. Never blocks adding to cart. */
export function cartValidationsGenerateRun(input: ValidationInput) {
  return { operations: [{ validationAdd: { errors: validate(input, messages) } }] };
}
