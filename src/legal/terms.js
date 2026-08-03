/**
 * Terms & Conditions content.
 *
 * ⚠️  DRAFT — HAS NOT BEEN REVIEWED BY A LAWYER.
 * Written for a Canadian sole proprietor / small company selling digital
 * products and 1:1 coaching. Everything in [SQUARE BRACKETS] must be filled
 * in before this goes live, and the whole thing should be reviewed by a
 * lawyer in your province before you take money against it.
 */

export const terms = {
  title: 'Terms & Conditions',
  updated: '3 August 2026',
  intro: [
    'These terms are the agreement between you and Wabanaki Software Solutions Inc. ("we", "us") for everything sold or offered through this website. Please read them before you buy anything or book a session.',
    'By buying a product, booking a session, subscribing to the newsletter, or otherwise using this site, you agree to these terms. If you do not agree with them, please do not use the site or buy anything from it.',
  ],
  sections: [
    {
      heading: '1. Who you are dealing with',
      paragraphs: [
        'This site is operated by Wabanaki Software Solutions Inc., [sole proprietorship / corporation] registered in [PROVINCE], Canada.',
        'You can reach us at support@nategaffney.store for any question about these terms, an order, or a booking.',
      ],
    },
    {
      heading: '2. Who can buy',
      paragraphs: [
        'You must be at least 18 years old, or the age of majority where you live, to buy anything or book a session. If you are under that age, you may only use the site with the involvement of a parent or guardian who agrees to these terms on your behalf.',
        'You confirm that any information you give us — name, email, billing details — is accurate and yours to provide.',
      ],
    },
    {
      heading: '3. What we sell',
      paragraphs: ['We offer several different things, and different rules apply to each:'],
      list: [
        '<strong>Digital products</strong> — guides, presets, templates and similar files delivered by download or email.',
        '<strong>1:1 coaching sessions</strong> — live video calls booked through this site.',
        '<strong>Group programs and cohorts</strong> — multi-week live programs, where offered.',
        '<strong>Film and production services</strong> — commissioned work, which is quoted and contracted separately.',
      ],
      after: [
        'Product descriptions, prices and availability can change at any time before you buy. We try hard to keep everything accurate, but if an obvious pricing or description error appears, we may cancel the affected order and refund you in full rather than honour the mistake.',
      ],
    },
    {
      heading: '4. Prices, taxes and payment',
      paragraphs: [
        'All prices are shown in [CURRENCY, e.g. Canadian dollars (CAD)] unless clearly stated otherwise. Applicable sales taxes ([GST/HST or as applicable]) are added where required by law and shown before you confirm payment.',
        'If your card or bank account is in another currency, your bank sets the exchange rate and may add its own conversion or foreign transaction fee. We have no control over and do not receive any part of those fees.',
      ],
    },
    {
      heading: '5. How payment is processed (Stripe)',
      paragraphs: [
        'Payments are processed by <strong>Stripe</strong>, a third-party payment processor. We do not collect, see, or store your full card number, expiry date, or security code at any point. That information goes directly to Stripe over an encrypted connection.',
        'By paying, you also agree to Stripe’s own terms and privacy policy, available at <a href="https://stripe.com/legal" target="_blank" rel="noreferrer noopener">stripe.com/legal</a> and <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer noopener">stripe.com/privacy</a>.',
        'We receive limited information from Stripe to run the business — such as your name, email, billing country, the last four digits of your card, and whether the payment succeeded.',
      ],
      list: [
        'Your order is only accepted once payment is confirmed by Stripe and we send you a confirmation email.',
        'If a payment is declined, reversed, or charged back, we may suspend access to the product or session until it is resolved.',
        'You are responsible for keeping your billing details current for any subscription or instalment plan.',
      ],
    },
    {
      heading: '6. Digital products: delivery and licence',
      paragraphs: [
        'Digital products are delivered electronically, normally straight after payment, by download link or email. If something has not arrived within a few hours, check your spam folder and then email us — we will sort it out.',
        'When you buy a digital product you get a <strong>personal, non-exclusive, non-transferable licence</strong> to use it for your own creative work, including commercial work you produce yourself.',
      ],
      listTitle: 'You may not:',
      list: [
        'Resell, sublicense, rent, or redistribute the files, in whole or in part.',
        'Share your download link, login, or files with anyone else.',
        'Upload the files anywhere others can access them.',
        'Present the material as your own product, course, or template.',
        'Use the material to build a directly competing product.',
      ],
      after: [
        'We keep ownership of everything we make. Breaking this licence ends your right to use the material immediately, with no refund.',
      ],
    },
    {
      heading: '7. Refunds on digital products',
      paragraphs: [
        'Because digital products are delivered instantly and cannot be returned, we offer a goodwill refund window rather than a legal right of return.',
        'If a digital product is not right for you, email support@nategaffney.store within <strong>14 days</strong> of purchase and we will refund you in full. You do not need to give a reason. Your licence ends when the refund is issued, and you must delete the files.',
        'We may decline a refund where there is clear evidence of abuse — for example repeated buy-and-refund behaviour, or redistribution of the files.',
      ],
    },
    {
      heading: '8. Booking a 1:1 coaching session',
      paragraphs: [
        'Choosing a date and time on this site creates a <strong>booking request</strong>, not a confirmed appointment. Your session is only confirmed once we reply by email to confirm the time. Until then, the slot is not held for you.',
        'Payment is due before the session takes place, using the payment link in your confirmation email, unless we agree otherwise in writing.',
        'Sessions run for the length shown at the time of booking and take place over video call. We will send you the joining link before the session.',
      ],
    },
    {
      heading: '9. Rescheduling, cancellations and fees',
      paragraphs: [
        'Life happens, and the rules below are meant to be fair in both directions. Notice periods are counted from the scheduled start time of your session.',
      ],
      listTitle: 'If you need to change a booked session:',
      list: [
        '<strong>More than 24 hours’ notice</strong> — reschedule or cancel free of charge. A cancellation is refunded in full.',
        '<strong>Less than 24 hours’ notice</strong> — the session is treated as delivered and the <strong>full session fee applies</strong>. We may waive this once as a courtesy, at our discretion.',
        '<strong>No-show</strong> — if you do not join within 15 minutes of the start time and have not been in touch, the session is treated as delivered and no refund is given.',
        '<strong>Arriving late</strong> — the session still ends at its scheduled finish time. We cannot run over into another booking.',
      ],
      after: [
        'If <em>we</em> need to cancel or move your session, you will be offered either a new time that suits you or a full refund, whichever you prefer. If we are more than 15 minutes late without warning, you may treat the session as cancelled by us and take a full refund.',
        'Repeated late cancellations or no-shows may mean we decline future bookings.',
      ],
    },
    {
      heading: '10. Group programs and cohorts',
      paragraphs: [
        'Where a multi-week group program is offered, your place is confirmed once payment clears. Places are limited and allocated in order of payment.',
        'You may cancel and receive a full refund up to <strong>14 days before the start date</strong>. After that point, and once the program has begun, fees are non-refundable, because your place has been held and materials released. If you cannot attend, you may transfer your place to a future cohort once, subject to availability.',
        'Recordings and materials are provided under the same licence as digital products in section 6, and are for your personal use only.',
        'If we cancel a cohort before it begins, you will receive a full refund or a place in the next cohort, whichever you prefer.',
      ],
    },
    {
      heading: '11. Film and production services',
      paragraphs: [
        'Commissioned film, video and production work is not sold through this site. Any enquiry made here is an expression of interest only, and is governed by a separate written agreement covering scope, schedule, deposits, usage rights and cancellation. Nothing on this page creates an obligation to take on a project.',
      ],
    },
    {
      heading: '12. Newsletter',
      paragraphs: [
        'Subscribing to the newsletter is free and entirely optional. You can unsubscribe at any time using the link at the bottom of any email, and we will stop sending marketing messages. We may still contact you about an order or a booking you have made.',
      ],
    },
    {
      heading: '13. No guarantee of results',
      paragraphs: [
        'Everything sold here is educational. We share what has worked for us and for people we have worked with, but we cannot and do not guarantee any particular outcome — no specific follower count, engagement rate, income, or career result.',
        'What you get out of it depends on your own work, your circumstances, your market and factors outside anyone’s control. Nothing here is financial, legal, tax, or business advice, and it is not a substitute for professional advice about your situation.',
      ],
    },
    {
      heading: '14. Acceptable use',
      listTitle: 'When using this site or attending a session, you agree not to:',
      list: [
        'Break any applicable law, or infringe anyone else’s rights.',
        'Record, transcribe, or broadcast a coaching session without our written consent.',
        'Behave abusively toward us or anyone else in a group program. We may end a session or remove you from a program without refund for abusive, harassing, or discriminatory behaviour.',
        'Attempt to gain unauthorised access to the site, its systems, or another person’s account.',
        'Scrape, copy, or reproduce the site’s content for a competing service.',
      ],
    },
    {
      heading: '15. Intellectual property',
      paragraphs: [
        'All content on this site — writing, video, photography, design, code, course material and downloadable files — is owned by us or used with permission, and is protected by copyright and other laws.',
        'You may not copy, reproduce, republish, or adapt any of it beyond the licence described in section 6, without written permission.',
        'If you send us feedback or suggestions, we may use them freely without owing you anything for it.',
      ],
    },
    {
      heading: '16. Third-party links and services',
      paragraphs: [
        'This site links to other services — social platforms, Stripe, our email provider, scheduling tools. We do not control those services and are not responsible for their content, terms, or how they handle your data. Their own terms and privacy policies apply when you use them.',
      ],
    },
    {
      heading: '17. Limitation of liability',
      paragraphs: [
        'Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited under applicable law — including your rights under consumer protection legislation in your province, which these terms do not take away.',
        'Subject to that, the site and everything sold through it is provided "as is", without warranties of any kind. We are not liable for indirect, incidental, special, or consequential losses, including lost profits, lost revenue, lost data, or lost opportunity.',
        'Where liability cannot be excluded, our total liability to you for any claim is limited to the amount you actually paid us for the product or session the claim relates to, in the 12 months before the claim arose.',
      ],
    },
    {
      heading: '18. Indemnity',
      paragraphs: [
        'You agree to cover us for any claim, loss, or cost arising from your breach of these terms, your misuse of the material, or your infringement of someone else’s rights.',
      ],
    },
    {
      heading: '19. Suspension and termination',
      paragraphs: [
        'We may suspend or end your access to a product, session, or program if you materially break these terms — for example by redistributing files or behaving abusively. Where the breach is serious, no refund is given.',
        'You can stop using the site at any time. Sections that by their nature should survive — licences, intellectual property, liability, governing law — continue to apply after you stop.',
      ],
    },
    {
      heading: '20. Changes to these terms',
      paragraphs: [
        'We may update these terms from time to time. The version in force when you make a purchase or booking is the one that applies to it. The date at the top of this page shows when it was last changed, and material changes will be flagged on the site.',
      ],
    },
    {
      heading: '21. Governing law',
      paragraphs: [
        'These terms are governed by the laws of the Province of [PROVINCE] and the federal laws of Canada that apply there. Disputes will be handled by the courts of [PROVINCE], though this does not remove any right you have to bring a claim in the courts of the place where you live.',
        'We would much rather sort out a problem directly — please email us first and give us a fair chance to fix it.',
      ],
    },
    {
      heading: '22. Contact',
      paragraphs: [
        'Questions about these terms, an order, a refund, or a booking:',
        '<strong>Wabanaki Software Solutions Inc.</strong><br /><a href="mailto:support@nategaffney.store">support@nategaffney.store</a>',
      ],
    },
  ],
}
