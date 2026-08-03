/**
 * Privacy Policy content.
 *
 * ⚠️  DRAFT — HAS NOT BEEN REVIEWED BY A LAWYER.
 * Written against Canadian federal privacy law (PIPEDA) and anti-spam law
 * (CASL), with a nod to GDPR for visitors in the UK/EU. Everything in
 * [SQUARE BRACKETS] must be filled in before this goes live. Have a lawyer
 * review it, and re-check it whenever you add a new tool that touches
 * personal data (analytics, a CRM, a different email provider).
 */

export const privacy = {
  title: 'Privacy Policy',
  updated: '3 August 2026',
  intro: [
    'This policy explains what personal information [LEGAL BUSINESS NAME] ("we", "us") collects through this website, why we collect it, who we share it with, and what control you have over it.',
    'The short version: we collect as little as we can get away with, we do not sell your information to anyone, and we never see your card details.',
  ],
  sections: [
    {
      heading: '1. Who is responsible for your information',
      paragraphs: [
        '[LEGAL BUSINESS NAME], [BUSINESS ADDRESS], is responsible for the personal information collected through this site. For any privacy question or request, contact <a href="mailto:[CONTACT EMAIL]">[CONTACT EMAIL]</a>.',
      ],
    },
    {
      heading: '2. What we collect',
      listTitle: 'Information you give us directly:',
      list: [
        '<strong>Newsletter signup</strong> — your email address.',
        '<strong>Booking a session</strong> — your name, email, chosen date and time, and whatever you write in the notes field. Please do not put sensitive personal or health information in that box.',
        '<strong>Buying something</strong> — your name, email, billing address and country, as required to complete the sale and meet tax rules.',
        '<strong>Emailing us</strong> — whatever you choose to include in your message.',
      ],
      after: [
        '<strong>Payment information.</strong> Card numbers, expiry dates and security codes go directly to Stripe and are never collected, seen, or stored by us. We receive only limited confirmation data back from Stripe, such as your name, email, billing country, the last four digits of the card, and whether the payment succeeded.',
        '<strong>Information collected automatically.</strong> Our hosting provider keeps standard server logs, which can include your IP address, browser type, device, referring page and the time of your visit. These are used for security and to keep the site working. [If you add analytics, describe it here — what tool, what it collects, and whether it is cookie-based.]',
        '<strong>Stored on your own device.</strong> This site saves your light/dark theme choice in your browser\'s local storage. It never leaves your device, is not personal information, and you can clear it any time by clearing your browser data. We do not use advertising or tracking cookies.',
      ],
    },
    {
      heading: '3. Why we use it, and our legal basis',
      list: [
        '<strong>To deliver what you bought</strong> — sending files, confirming orders, running your session. Basis: performing our contract with you.',
        '<strong>To manage bookings</strong> — confirming times, sending reminders and joining links, handling changes. Basis: performing our contract with you.',
        '<strong>To send the newsletter</strong> — only if you signed up. Basis: your consent, which you can withdraw at any time.',
        '<strong>To answer your questions</strong> — replying to emails and support requests. Basis: our legitimate interest in running the business.',
        '<strong>To keep the site secure</strong> — spotting abuse and fraud. Basis: our legitimate interest in protecting the site.',
        '<strong>To meet legal duties</strong> — keeping tax and accounting records. Basis: legal obligation.',
      ],
      after: [
        'We do not use your information to make automated decisions that significantly affect you, and we do not build advertising profiles.',
      ],
    },
    {
      heading: '4. Consent and marketing email (CASL)',
      paragraphs: [
        'We only send marketing email to people who asked for it. Every message includes a working unsubscribe link and our contact details, and unsubscribes are actioned promptly.',
        'Withdrawing consent for marketing does not stop transactional messages — order confirmations, download links, booking confirmations and receipts — because those are needed to deliver what you asked for.',
      ],
    },
    {
      heading: '5. Who we share it with',
      paragraphs: [
        'We do not sell, rent, or trade your personal information. We share it only with service providers who help us run the business, and only as much as they need:',
      ],
      list: [
        '<strong>Stripe</strong> — payment processing. See <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer noopener">stripe.com/privacy</a>.',
        '<strong>[EMAIL PROVIDER — e.g. ConvertKit / Beehiiv / Mailchimp]</strong> — storing your subscription and sending the newsletter.',
        '<strong>[HOSTING PROVIDER — e.g. Netlify / Vercel]</strong> — serving the website and keeping server logs.',
        '<strong>[VIDEO CALL TOOL — e.g. Zoom / Google Meet]</strong> — running coaching sessions, where used.',
        '<strong>Professional advisers</strong> — our accountant or a lawyer, where genuinely needed.',
      ],
      after: [
        'We may also disclose information where the law requires it, to enforce our terms, or to protect someone’s rights or safety. If the business is ever sold or restructured, information may transfer to the new owner, who would remain bound by this policy.',
      ],
    },
    {
      heading: '6. Where your information is stored',
      paragraphs: [
        'Some of our service providers are based outside Canada, including in the United States. That means your information may be stored or processed abroad and could be accessible to courts and authorities in those countries under their own laws.',
        'We choose providers who commit to appropriate safeguards and comparable protection. By using this site you understand that your information may be handled outside Canada.',
      ],
    },
    {
      heading: '7. How long we keep it',
      list: [
        '<strong>Purchase and tax records</strong> — kept as long as Canadian tax law requires, currently at least six years.',
        '<strong>Booking records</strong> — kept for [RETENTION PERIOD, e.g. two years] after the session, so we have a record of what was agreed.',
        '<strong>Newsletter subscription</strong> — kept until you unsubscribe, plus a minimal record of the unsubscribe so we do not email you again by mistake.',
        '<strong>Emails you send us</strong> — kept for as long as needed to deal with the matter, then deleted periodically.',
        '<strong>Server logs</strong> — kept for a short period by our host, then rotated out.',
      ],
    },
    {
      heading: '8. How we protect it',
      paragraphs: [
        'The site is served over HTTPS. Payment data is handled entirely by Stripe, a PCI-DSS Level 1 certified provider, so card details never touch our systems. We limit who can access personal information and use reputable providers with their own security programs.',
        'No system is perfectly secure, and we cannot guarantee absolute security. If a breach ever occurs that creates a real risk of significant harm, we will notify affected people and the Office of the Privacy Commissioner of Canada as required by law.',
      ],
    },
    {
      heading: '9. Your rights',
      listTitle: 'You can ask us at any time to:',
      list: [
        '<strong>Access</strong> the personal information we hold about you, and be told how it has been used and who it has been shared with.',
        '<strong>Correct</strong> anything inaccurate or incomplete.',
        '<strong>Delete</strong> your information, where we are not required to keep it for legal or accounting reasons.',
        '<strong>Withdraw consent</strong> for marketing, or for any processing based on consent.',
        '<strong>Receive a copy</strong> of the information you gave us in a portable format.',
        '<strong>Object to or restrict</strong> processing based on our legitimate interests.',
      ],
      after: [
        'Email <a href="mailto:[CONTACT EMAIL]">[CONTACT EMAIL]</a> and we will respond within 30 days. We may need to verify your identity first. Exercising these rights is free, and we will not treat you differently for it.',
      ],
    },
    {
      heading: '10. Children',
      paragraphs: [
        'This site is not aimed at children and we do not knowingly collect personal information from anyone under 18. If you believe a child has given us their information, email us and we will delete it.',
      ],
    },
    {
      heading: '11. Links to other sites',
      paragraphs: [
        'This site links out to places like Instagram, YouTube, TikTok and Stripe. Once you follow a link, that service’s own privacy policy applies. We are not responsible for how they handle your information — worth reading their policies if it matters to you.',
      ],
    },
    {
      heading: '12. Changes to this policy',
      paragraphs: [
        'We may update this policy as the business changes or new tools are added. The date at the top shows when it last changed. Significant changes will be flagged on the site, and where the law requires it we will ask for your consent again.',
      ],
    },
    {
      heading: '13. Questions and complaints',
      paragraphs: [
        'Please come to us first — most things are quickest to fix directly:',
        '<strong>[LEGAL BUSINESS NAME]</strong><br />[BUSINESS ADDRESS]<br /><a href="mailto:[CONTACT EMAIL]">[CONTACT EMAIL]</a>',
        'If you are not satisfied with our response, you can complain to the <strong>Office of the Privacy Commissioner of Canada</strong> at <a href="https://www.priv.gc.ca" target="_blank" rel="noreferrer noopener">priv.gc.ca</a>, or to the privacy regulator in your own country if you live outside Canada.',
      ],
    },
  ],
}
