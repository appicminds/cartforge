/**
 * Legal pages in plain language. DRAFTS: have them reviewed by a lawyer and add
 * your company's legal name, address and contact details before launch.
 */
export interface LegalDoc {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}

export const LEGAL: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms of service",
    description: "The agreement between you and CartForge when you use our platform.",
    updated: "November 26, 2026",
    sections: [
      {
        heading: "Who these terms are for",
        body: [
          "These terms apply when you create a CartForge account or use CartForge to run a store. By creating an account you agree to them on behalf of yourself and the business you represent.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "You must give accurate information and keep your password and sign-in methods safe. You're responsible for everything done through your account, including by staff you invite.",
          "You must be old enough to form a binding contract where you live.",
        ],
      },
      {
        heading: "Your store and your content",
        body: [
          "You own your products, pictures, text and customer data. You give us permission to host, copy and display them only as needed to run your store and our services.",
          "You're responsible for what you sell, how you describe it, your prices and taxes, delivering orders, refunds, and following the laws of the places you sell to.",
        ],
      },
      {
        heading: "Payments",
        body: [
          "Payments made through providers such as Stripe or local gateways are handled by those providers under their own terms. CartForge doesn't hold your customers' money.",
          "If paid plans apply to you, fees are charged in advance and are not refundable except where the law requires.",
        ],
      },
      {
        heading: "Beta",
        body: [
          "CartForge is in beta. Features may change, and the service is provided as it is. We'll give you reasonable notice before billing starts or before removing features you rely on.",
        ],
      },
      {
        heading: "What you may not do",
        body: [
          "You must follow our Acceptable use policy. We may suspend or close stores that break it, put others at risk, or don't pay fees that are due.",
        ],
      },
      {
        heading: "Ending your account",
        body: [
          "You can close your account at any time. You can export your data before you do. We may close accounts as described above, and will tell you why when we can.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "To the extent the law allows, CartForge isn't liable for lost profits or indirect losses, and our total liability is limited to the fees you paid us in the 12 months before the claim.",
        ],
      },
      {
        heading: "Changes to these terms",
        body: [
          "We may update these terms. If a change matters, we'll tell you before it takes effect. Continuing to use CartForge after that means you accept the new terms.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    description: "What information CartForge collects, why, and the choices you have.",
    updated: "November 26, 2026",
    sections: [
      {
        heading: "Two kinds of information",
        body: [
          "Merchants: when you sign up we collect your name, email, password (stored only as a secure hash) and your store's details.",
          "Shoppers: when someone buys from a CartForge store, the store collects their contact details, addresses and orders. The store is responsible for that information; CartForge processes it on the store's behalf.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To run your account and store, process orders and payments, send emails you or your customers need (such as receipts), keep the service secure, and improve it.",
          "We don't sell personal information.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Service providers that help us run CartForge, such as hosting, email delivery and payment providers you choose to connect, only as needed to provide the service.",
          "Authorities, when the law requires it.",
        ],
      },
      {
        heading: "Cookies",
        body: [
          "We use cookies to keep you signed in, protect forms and remember your cart. This website doesn't use advertising cookies.",
        ],
      },
      {
        heading: "Security",
        body: [
          "Data is encrypted in transit, payment credentials are encrypted at rest, and staff accounts can use two-step sign-in. No system is perfectly secure, so please report anything suspicious to us.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "You can see and change your account details at any time, export your store data, and close your account. Depending on where you live you may have further rights, such as asking for a copy of your data or its deletion.",
        ],
      },
      {
        heading: "Changes",
        body: [
          "If we change this policy in a way that matters, we'll tell you before it takes effect.",
        ],
      },
    ],
  },
  {
    slug: "acceptable-use",
    title: "Acceptable use policy",
    description: "What can and can't be sold or done on CartForge.",
    updated: "November 26, 2026",
    sections: [
      {
        heading: "The basics",
        body: [
          "Sell real products and services honestly, describe them accurately, and deliver what you promise.",
        ],
      },
      {
        heading: "Not allowed",
        body: [
          "Anything illegal where you or your customers are, including counterfeit goods and items that infringe someone else's rights.",
          "Weapons, drugs and other dangerous or regulated goods without the licenses the law requires.",
          "Scams, misleading claims, fake reviews, or collecting payments or passwords under false pretenses.",
          "Hateful, violent or sexually exploitative content.",
          "Spam, malware, or attempts to break, overload or get around the security of CartForge or other stores.",
        ],
      },
      {
        heading: "What happens if a store breaks these rules",
        body: [
          "We may remove content, limit features, suspend or close the store. Where we can, we'll tell you what happened and give you a chance to fix it.",
        ],
      },
    ],
  },
];

export const legalBySlug = (slug: string) => LEGAL.find((d) => d.slug === slug);
