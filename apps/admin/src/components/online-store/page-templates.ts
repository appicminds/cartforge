/** Starting text for common pages (merchants edit it before publishing). */
export const PAGE_TEMPLATES: { key: string; title: string; body: string }[] = [
  { key: "blank", title: "", body: "" },
  {
    key: "about",
    title: "About us",
    body: "<p>Tell customers who you are, what you make and why. Share how your business started and what makes your products special.</p><h2>Our promise</h2><p>Quality you can trust, delivered to your door.</p>",
  },
  {
    key: "contact",
    title: "Contact us",
    body: "<p>We'd love to hear from you.</p><ul><li><strong>WhatsApp:</strong> +92 300 0000000</li><li><strong>Email:</strong> hello@example.com</li><li><strong>Hours:</strong> Monday to Saturday, 10am to 6pm</li></ul>",
  },
  {
    key: "shipping",
    title: "Shipping policy",
    body: "<p>We deliver all over Pakistan.</p><ul><li>Orders are dispatched within 1–2 working days.</li><li>Delivery takes 3–5 working days in major cities.</li><li>Cash on delivery is available.</li></ul><p>You'll receive a tracking number when your order ships.</p>",
  },
  {
    key: "returns",
    title: "Returns and exchanges",
    body: "<p>If something isn't right, you can exchange or return it within 7 days of delivery.</p><ul><li>Items must be unused, with tags attached.</li><li>Sale items can be exchanged but not refunded.</li><li>Contact us with your order number to start a return.</li></ul>",
  },
  {
    key: "privacy",
    title: "Privacy policy",
    body: "<p>This policy explains what personal information we collect when you shop with us and how we use it.</p><h2>What we collect</h2><p>Your name, contact details and delivery address, to process and deliver your orders.</p><h2>How we use it</h2><p>Only to fulfil orders, provide support and, if you agree, to send you updates. We never sell your information.</p><h2>Contact</h2><p>Questions about your data? Contact us.</p>",
  },
  {
    key: "terms",
    title: "Terms of service",
    body: "<p>By using this store you agree to these terms.</p><h2>Orders</h2><p>All orders are subject to availability and confirmation of the price.</p><h2>Pricing</h2><p>Prices may change without notice. The price you pay is the one shown at checkout.</p>",
  },
];
