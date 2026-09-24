// Storefront journeys, written the way a person would describe them.
//
// Stagehand reads each step, looks at the live page, and works out what to
// click or type. The steps name no CSS selectors and no test ids, so they keep
// working when the markup changes, as long as a shopper could still do it.
//
// Every journey ends with a check. Stagehand reads values off the page, and
// plain code decides pass or fail.
//
// A step is either:
//   "text"             an action for Stagehand to carry out
//   { goto: "/path" }  open a storefront page directly
//
// %name% in a step is filled from the journey's variables. Stagehand types the
// value into the page but never sends it to the model.

import { z } from "zod";

// The seeded demo login from the user-session service (the same one the
// Playwright, Cypress and Selenium suites use).
const shopper = {
  email: process.env.SHOPPER_EMAIL ?? "demo@example.com",
  password: process.env.SHOPPER_PASSWORD ?? "demo-password",
};

export const journeys = [
  {
    name: "Shopper finds a notebook and adds it to the cart",
    steps: [
      { goto: "/" },
      "Open the product page for the Hardcover Notebook",
      "Click the button that adds this product to the cart",
    ],
    check: {
      read: "The number of items shown on the cart icon in the page header",
      schema: z.object({ itemsInCart: z.number() }),
      pass: ({ itemsInCart }) => itemsInCart >= 1,
      describe: ({ itemsInCart }) => `the cart icon shows ${itemsInCart}`,
    },
  },
  {
    name: "Checkout asks a signed-out shopper to sign in",
    steps: [{ goto: "/checkout" }],
    check: {
      read: "Whether this page asks the visitor to sign in with an email address and a password",
      schema: z.object({ asksToSignIn: z.boolean() }),
      pass: ({ asksToSignIn }) => asksToSignIn,
      describe: ({ asksToSignIn }) =>
        asksToSignIn ? "the sign-in form is shown" : "no sign-in form is shown",
    },
  },
  {
    name: "Signed-in shopper buys a notebook and sees the order status",
    variables: shopper,
    steps: [
      { goto: "/login" },
      "Type %email% into the email field",
      "Type %password% into the password field",
      "Click the button that signs in",
      { goto: "/" },
      "Click the add to cart button on the Hardcover Notebook card",
      { goto: "/cart" },
      "Click the button that goes to checkout",
      "Click the button that places the order",
    ],
    check: {
      read: "The confirmation heading at the top of the page, and the order id and the status label of the first order in the list",
      schema: z.object({
        heading: z.string(),
        orderId: z.string(),
        status: z.string(),
      }),
      pass: ({ heading, orderId, status }) =>
        /order placed/i.test(heading) && orderId.trim() !== "" && status.trim() !== "",
      describe: ({ heading, orderId, status }) =>
        `heading "${heading}", order ${orderId || "(none)"}, status "${status || "(none)"}"`,
    },
  },
];
